import { asc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance, preValidationAsyncHookHandler } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { type User, users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { authGuards } from '../plugins/auth.ts'
import { UUID_PATTERN, getUserById, toUserRead, updateUser } from '../services/users.ts'
import { userReadSchema } from './schemas.ts'

const userUpdateBody = z.object({
  password: z.string().nullish(),
  email: z.email().nullish(),
  is_active: z.boolean().nullish(),
  is_superuser: z.boolean().nullish(),
  is_verified: z.boolean().nullish(),
  preferences: z.record(z.string(), z.unknown()).nullish(),
})

const idParams = z.object({ id: z.string() })

declare module 'fastify' {
  interface FastifyRequest {
    /** The user addressed by `/api/users/{id}`, set by the lookup guard. */
    target: User
  }
}

export function userRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser, requireSuperuser } = authGuards(ctx)
    app.decorateRequest('target', undefined as never)

    // `get_user_or_404`: resolved before the body is validated, like the FastAPI dependency.
    const loadTarget: preValidationAsyncHookHandler = async (request) => {
      const { id } = request.params as { id: string }
      const target = UUID_PATTERN.test(id) ? await getUserById(ctx.db, id) : null
      if (!target) throw new HttpError(404, 'Not Found')
      request.target = target
    }

    const lookupResult = z.object({ id: z.string(), email: z.string() })

    // Static paths: they win over `/api/users/:id`.
    typed.get(
      '/api/users/lookup',
      { schema: { querystring: z.object({ email: z.email() }), response: { 200: lookupResult } }, preValidation: [requireUser] },
      async (request) => {
        const [found] = await ctx.db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(sql`lower(${users.email}) = lower(${request.query.email})`)
          .limit(1)
        if (!found) throw new HttpError(404, 'User not found')
        return found
      },
    )

    typed.get(
      '/api/users/directory',
      { schema: { response: { 200: z.array(lookupResult) } }, preValidation: [requireUser] },
      async () => ctx.db.select({ id: users.id, email: users.email }).from(users).orderBy(asc(users.email)),
    )

    typed.get('/api/users/me', { schema: { response: { 200: userReadSchema } }, preValidation: [requireUser] }, async (request) =>
      toUserRead(request.user),
    )

    typed.patch(
      '/api/users/me',
      { schema: { body: userUpdateBody, response: { 200: userReadSchema } }, preValidation: [requireUser] },
      async (request) => {
        const updated = await updateUser(ctx.db, ctx.config, request.user, toUpdate(request.body), { safe: true })
        return toUserRead(updated)
      },
    )

    typed.get(
      '/api/users/:id',
      { schema: { params: idParams, response: { 200: userReadSchema } }, preValidation: [requireSuperuser, loadTarget] },
      async (request) => toUserRead(request.target),
    )

    typed.patch(
      '/api/users/:id',
      {
        schema: { params: idParams, body: userUpdateBody, response: { 200: userReadSchema } },
        preValidation: [requireSuperuser, loadTarget],
      },
      async (request) => {
        const updated = await updateUser(ctx.db, ctx.config, request.target, toUpdate(request.body), { safe: false })
        return toUserRead(updated)
      },
    )

    typed.delete(
      '/api/users/:id',
      { schema: { params: idParams }, preValidation: [requireSuperuser, loadTarget] },
      async (request, reply) => {
        await ctx.db.delete(users).where(eq(users.id, request.target.id))
        return reply.code(204).send()
      },
    )
  }
}

function toUpdate(body: z.infer<typeof userUpdateBody>) {
  return {
    password: body.password,
    email: body.email,
    isActive: body.is_active,
    isSuperuser: body.is_superuser,
    isVerified: body.is_verified,
    preferences: body.preferences,
  }
}
