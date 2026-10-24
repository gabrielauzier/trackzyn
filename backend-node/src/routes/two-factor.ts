import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireLocalAuth } from '../plugins/policy.ts'
import { LOGIN_LIMIT, rateLimit } from '../plugins/rate-limit.ts'
import { generateTotpSecret, provisioningUri, verifyTotp } from '../services/totp.ts'
import { payloadOffering } from '../services/two-factor.ts'
import { writeAccessToken } from '../services/tokens.ts'
import { UUID_PATTERN, authenticate, getUserById } from '../services/users.ts'

const code = z.string().length(6).regex(/^\d{6}$/)

/** `/api/auth/2fa/*`: TOTP enrolment, verification of a pending login, and removal. */
export function twoFactorRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const login = rateLimit(ctx, LOGIN_LIMIT.maxRequests, LOGIN_LIMIT.windowSeconds)

    typed.post(
      '/api/auth/2fa/setup',
      {
        schema: { response: { 200: z.object({ secret: z.string(), otpauth_uri: z.string() }) } },
        preValidation: [requireLocalAuth(ctx), requireUser],
      },
      async (request) => {
        const secret = generateTotpSecret()
        await ctx.db.update(users).set({ totpSecret: secret }).where(eq(users.id, request.user.id))
        return { secret, otpauth_uri: provisioningUri(secret, request.user.email, ctx.config.appName) }
      },
    )

    typed.post(
      '/api/auth/2fa/enable',
      { schema: { body: z.object({ code }) }, preValidation: [requireLocalAuth(ctx), requireUser] },
      async (request) => {
        const user = request.user
        if (!user.totpSecret) throw new HttpError(400, 'Call /2fa/setup first')
        if (!verifyTotp(user.totpSecret, request.body.code)) throw new HttpError(400, 'Invalid 2FA code')
        await ctx.db.update(users).set({ is2faEnabled: true }).where(eq(users.id, user.id))
        return { detail: '2FA enabled' }
      },
    )

    // Not behind the local-auth policy: turning 2FA off is allowed as cleanup in OIDC-only mode.
    typed.post(
      '/api/auth/2fa/disable',
      { schema: { body: z.object({ password: z.string(), code }) }, preValidation: [requireUser] },
      async (request) => {
        const user = request.user
        const authenticated = await authenticate(ctx.db, user.email, request.body.password)
        if (!authenticated) throw new HttpError(400, 'Invalid password')
        if (!user.totpSecret) throw new HttpError(400, '2FA is not set up')
        if (!verifyTotp(user.totpSecret, request.body.code)) throw new HttpError(400, 'Invalid 2FA code')
        await ctx.db.update(users).set({ totpSecret: null, is2faEnabled: false }).where(eq(users.id, user.id))
        return { detail: '2FA disabled' }
      },
    )

    typed.post(
      '/api/auth/2fa/verify',
      { schema: { body: z.object({ temp_token: z.string(), code }) }, preValidation: [login] },
      async (request) => {
        const key = `2fa_temp:${request.body.temp_token}`
        const raw = await ctx.keyValueStore.get(key)
        if (!raw) throw new HttpError(401, 'Invalid or expired token')

        const payload = payloadOffering(raw, 'totp')
        if (!payload) throw new HttpError(401, 'Invalid token')
        const user = UUID_PATTERN.test(payload.user_id) ? await getUserById(ctx.db, payload.user_id.toLowerCase()) : null
        if (!user || !(user.is2faEnabled && user.totpSecret)) throw new HttpError(401, 'Invalid token')

        if (!verifyTotp(user.totpSecret, request.body.code)) throw new HttpError(400, 'Invalid 2FA code')
        await ctx.keyValueStore.del(key)
        return { access_token: await writeAccessToken(ctx.config, user.id), token_type: 'bearer' }
      },
    )
  }
}
