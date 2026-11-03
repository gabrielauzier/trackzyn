import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { TOKEN_SCOPES } from '../db/schema.ts'
import { authGuards } from '../plugins/auth.ts'
import { type AccessTokenView, createToken, listTokens, revokeToken } from '../services/access-tokens.ts'
import { UUID_PATTERN } from '../services/users.ts'
import { withoutNul } from './schemas.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')

const tokenReadSchema = z.object({
  id: z.string(),
  name: z.string(),
  workspace_id: z.string(),
  workspace_name: z.string(),
  scopes: z.array(z.enum(TOKEN_SCOPES)),
  display_hint: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
  status: z.enum(['active', 'expired', 'revoked']),
})

function toTokenRead(token: AccessTokenView) {
  return {
    id: token.id,
    name: token.name,
    workspace_id: token.workspaceId,
    workspace_name: token.workspaceName,
    scopes: token.scopes,
    display_hint: token.displayHint,
    created_at: token.createdAt.toISOString(),
    expires_at: token.expiresAt.toISOString(),
    last_used_at: token.lastUsedAt?.toISOString() ?? null,
    revoked_at: token.revokedAt?.toISOString() ?? null,
    status: token.status,
  }
}

/** Session-only: without `config.tokenScope` a token can never reach these routes (SCOPE-06). */
export function accessTokenRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)

    typed.post(
      '/api/tokens',
      {
        schema: {
          body: z.object({
            name: withoutNul(z.string().min(1).max(100)),
            workspace_id: uuid,
            scopes: z.array(z.enum(TOKEN_SCOPES)).min(1),
            expires_in_days: z.literal([30, 90, 365]),
          }),
          response: { 201: z.object({ id: z.string(), token: z.string(), expires_at: z.string() }) },
        },
        preValidation: [requireUser],
      },
      async (request, reply) => {
        const { row, plaintext } = await createToken(ctx.db, request.user, {
          name: request.body.name,
          workspaceId: request.body.workspace_id.toLowerCase(),
          scopes: request.body.scopes,
          expiresInDays: request.body.expires_in_days,
        })
        return reply.code(201).send({ id: row.id, token: plaintext, expires_at: row.expiresAt.toISOString() })
      },
    )

    typed.get(
      '/api/tokens',
      { schema: { response: { 200: z.array(tokenReadSchema) } }, preValidation: [requireUser] },
      async (request) => (await listTokens(ctx.db, request.user.id)).map(toTokenRead),
    )

    typed.delete(
      '/api/tokens/:token_id',
      { schema: { params: z.object({ token_id: uuid }) }, preValidation: [requireUser] },
      async (request, reply) => {
        await revokeToken(ctx.db, request.user.id, request.params.token_id.toLowerCase())
        return reply.code(204).send()
      },
    )
  }
}
