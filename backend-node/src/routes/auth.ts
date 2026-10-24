import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { HttpError } from '../http/http-error.ts'
import { requireLocalAuth, requireRegistrationEnabled } from '../plugins/policy.ts'
import { LOGIN_LIMIT, PASSWORD_RESET_LIMIT, REGISTER_LIMIT, rateLimit } from '../plugins/rate-limit.ts'
import { eq, sql } from 'drizzle-orm'
import { userPasskeys } from '../db/schema.ts'
import { verifyAndUpdate } from '../services/password.ts'
import { issueTempToken } from '../services/two-factor.ts'
import { readResetToken, writeAccessToken } from '../services/tokens.ts'
import { UserAlreadyExists, UUID_PATTERN, authenticate, getUserById, getUserByEmail, registerUser, toUserRead, updateUser } from '../services/users.ts'
import { userReadSchema } from './schemas.ts'

const loginForm = z.object({
  username: z.string(),
  password: z.string(),
  grant_type: z.string().regex(/^password$/).nullish(),
  scope: z.string().default(''),
  client_id: z.string().nullish(),
  client_secret: z.string().nullish(),
})

const registerBody = z.object({
  email: z.email(),
  password: z.string(),
  is_active: z.boolean().nullish(),
  is_superuser: z.boolean().nullish(),
  is_verified: z.boolean().nullish(),
  preferences: z.record(z.string(), z.unknown()).nullish(),
})

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | undefined)
  return code?.code === '23505' || code?.cause?.code === '23505'
}

export function authRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const login = rateLimit(ctx, LOGIN_LIMIT.maxRequests, LOGIN_LIMIT.windowSeconds)
    const register = rateLimit(ctx, REGISTER_LIMIT.maxRequests, REGISTER_LIMIT.windowSeconds)
    const reset = rateLimit(ctx, PASSWORD_RESET_LIMIT.maxRequests, PASSWORD_RESET_LIMIT.windowSeconds)

    // The Python login takes an OAuth2 password form only: any other body is "missing" fields.
    const formOnly = async (request: { headers: Record<string, unknown>; body: unknown }) => {
      const type = String(request.headers['content-type'] ?? '')
      if (!type.startsWith('application/x-www-form-urlencoded')) request.body = {}
    }

    typed.post(
      '/api/auth/login',
      {
        schema: { body: loginForm },
        preValidation: [login, requireLocalAuth(ctx), formOnly as never],
      },
      async (request) => {
        const user = await authenticate(ctx.db, request.body.username, request.body.password)
        if (!user || !user.isActive) throw new HttpError(400, 'LOGIN_BAD_CREDENTIALS')

        const availableMethods: string[] = []
        if (user.is2faEnabled && user.totpSecret) {
          availableMethods.push('totp')
          // A passkey is a second factor only for someone who turned 2FA on; on its own it is a
          // passwordless alternative, and demanding it on top of the password could lock them out.
          const [passkeys] = await ctx.db
            .select({ n: sql<number>`count(*)::int` })
            .from(userPasskeys)
            .where(eq(userPasskeys.userId, user.id))
          if ((passkeys?.n ?? 0) > 0) availableMethods.push('passkey')
        }
        if (availableMethods.length > 0) {
          const tempToken = await issueTempToken(ctx.keyValueStore, user.id, availableMethods)
          return { requires_2fa: true, temp_token: tempToken, available_methods: availableMethods }
        }

        return { access_token: await writeAccessToken(ctx.config, user.id), token_type: 'bearer' }
      },
    )

    typed.post('/api/auth/logout', { preValidation: [login] }, async () => ({ detail: 'Logged out' }))

    typed.post(
      '/api/auth/register',
      {
        schema: { body: registerBody, response: { 201: userReadSchema } },
        preValidation: [requireLocalAuth(ctx), requireRegistrationEnabled(ctx), register],
      },
      async (request, reply) => {
        const { email, password, preferences } = request.body
        try {
          const user = await registerUser(ctx.db, { email, password, preferences: preferences ?? undefined })
          return reply.code(201).send(toUserRead(user))
        } catch (error) {
          if (error instanceof UserAlreadyExists || isUniqueViolation(error)) {
            throw new HttpError(400, 'REGISTER_USER_ALREADY_EXISTS')
          }
          throw error
        }
      },
    )

    // Mounted like the Python backend mounts it, and like it, no token is ever sent to anyone.
    typed.post(
      '/api/auth/forgot-password',
      {
        schema: { body: z.object({ email: z.email() }) },
        preValidation: [requireLocalAuth(ctx), reset],
      },
      async (request, reply) => {
        await getUserByEmail(ctx.db, request.body.email)
        return reply.code(202).type('application/json').send('null')
      },
    )

    typed.post(
      '/api/auth/reset-password',
      {
        schema: { body: z.object({ token: z.string(), password: z.string() }) },
        preValidation: [requireLocalAuth(ctx), reset],
      },
      async (request, reply) => {
        const bad = () => new HttpError(400, 'RESET_PASSWORD_BAD_TOKEN')
        const claims = await readResetToken(ctx.config, request.body.token)
        if (!claims || !UUID_PATTERN.test(claims.sub)) throw bad()
        const user = await getUserById(ctx.db, claims.sub)
        if (!user) throw bad()
        const fingerprint = await verifyAndUpdate(user.hashedPassword, claims.passwordFingerprint)
        if (!fingerprint.valid || !user.isActive) throw bad()

        await updateUser(ctx.db, ctx.config, user, { password: request.body.password }, { safe: true })
        return reply.type('application/json').send('null')
      },
    )
  }
}
