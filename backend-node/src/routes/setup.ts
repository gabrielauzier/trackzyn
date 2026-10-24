import { eq, sql } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { requireLocalAuth } from '../plugins/policy.ts'
import { writeAccessToken } from '../services/tokens.ts'
import { createUser, getUserById } from '../services/users.ts'
import { createPersonalWorkspaceForUser } from '../services/workspaces.ts'

const createAdminBody = z.object({
  email: z.email(),
  password: z.string(),
  name: z.string().default(''),
  language: z.string().default('en'),
})

async function countUsers(ctx: AppContext): Promise<number> {
  const [row] = await ctx.db.select({ n: sql<number>`count(${users.id})::int` }).from(users)
  return row?.n ?? 0
}

export function setupRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()

    typed.get(
      '/api/setup/status',
      { schema: { response: { 200: z.object({ has_users: z.boolean() }) } } },
      async () => ({ has_users: (await countUsers(ctx)) > 0 }),
    )

    // First-run bootstrap: the instance administrator. Only works while `users` is empty.
    typed.post(
      '/api/setup/create-admin',
      {
        schema: { body: createAdminBody },
        preValidation: [requireLocalAuth(ctx)],
      },
      async (request) => {
        if ((await countUsers(ctx)) > 0) throw new HttpError(403, 'Setup already completed')

        const { email, password, name, language } = request.body
        const preferences: Record<string, unknown> = { language, onboarding_completed: false }
        if (name) preferences.display_name = name

        const created = await createUser(ctx.db, { email, password, isSuperuser: true })
        await ctx.db.update(users).set({ preferences }).where(eq(users.id, created.id))
        const user = (await getUserById(ctx.db, created.id)) ?? created
        await createPersonalWorkspaceForUser(ctx.db, user)

        return { access_token: await writeAccessToken(ctx.config, user.id), token_type: 'bearer' }
      },
    )
  }
}
