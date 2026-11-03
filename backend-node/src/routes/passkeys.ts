import { randomUUID } from 'node:crypto'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { type User, type UserPasskey, userPasskeys, users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireLocalAuth } from '../plugins/policy.ts'
import { LOGIN_LIMIT, rateLimit } from '../plugins/rate-limit.ts'
import { writeAccessToken } from '../services/tokens.ts'
import { payloadOffering, tokenUrlsafe } from '../services/two-factor.ts'
import { UUID_PATTERN, getUserById } from '../services/users.ts'
import { resolveWebAuthnContext } from '../services/webauthn-context.ts'

const REGISTER_CHALLENGE_PREFIX = 'passkey_register'
const AUTHENTICATE_CHALLENGE_PREFIX = 'passkey_authenticate'
const SECOND_FACTOR_CHALLENGE_PREFIX = 'passkey_2fa'

const passkeyReadSchema = z.object({
  id: z.string(),
  name: z.string(),
  transports: z.array(z.string()).nullable(),
  aaguid: z.string().nullable(),
  device_type: z.string().nullable(),
  backed_up: z.boolean().nullable(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
})

const credentialBody = z.record(z.string(), z.unknown())
const optionsResponse = z.object({ challenge_id: z.string(), options: z.record(z.string(), z.unknown()) })

function toPasskeyRead(passkey: UserPasskey) {
  return {
    id: passkey.id,
    name: passkey.name,
    transports: passkey.transports ?? null,
    aaguid: passkey.aaguid,
    device_type: passkey.deviceType,
    backed_up: passkey.backedUp,
    created_at: passkey.createdAt.toISOString(),
    last_used_at: passkey.lastUsedAt ? passkey.lastUsedAt.toISOString() : null,
  }
}

interface Challenge {
  challenge: string
  rp_id: string
  origin: string
  [key: string]: unknown
}

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | undefined
  return e?.code === '23505' || e?.cause?.code === '23505'
}

const fromBase64Url = (value: string): Uint8Array<ArrayBuffer> => new Uint8Array(Buffer.from(value, 'base64url'))

export function passkeyRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const login = rateLimit(ctx, LOGIN_LIMIT.maxRequests, LOGIN_LIMIT.windowSeconds)
    const localAuth = requireLocalAuth(ctx)

    async function storeChallenge(prefix: string, payload: Challenge): Promise<string> {
      const challengeId = tokenUrlsafe(32)
      await ctx.keyValueStore.set(`${prefix}:${challengeId}`, JSON.stringify(payload), {
        ttlSeconds: ctx.config.webauthnChallengeTtlSeconds,
      })
      return challengeId
    }

    /** Reads and consumes a challenge; one issued without an origin binding cannot be verified. */
    async function popChallenge(prefix: string, challengeId: string): Promise<Challenge | null> {
      const raw = await ctx.keyValueStore.getdel(`${prefix}:${challengeId}`)
      if (!raw) return null
      let payload: unknown
      try {
        payload = JSON.parse(raw)
      } catch {
        return null
      }
      if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
      const challenge = payload as Challenge
      if (!challenge.rp_id || !challenge.origin) return null
      return challenge
    }

    async function secondFactorUserId(tempToken: string): Promise<string> {
      const raw = await ctx.keyValueStore.get(`2fa_temp:${tempToken}`)
      if (!raw) throw new HttpError(401, 'Invalid or expired token')
      const payload = payloadOffering(raw, 'passkey')
      if (!payload) throw new HttpError(401, 'Invalid token')
      return payload.user_id
    }

    function credentialIdOf(credential: Record<string, unknown>): string | null {
      const value = credential.rawId || credential.id
      return typeof value === 'string' && value ? value : null
    }

    async function verifyPasskeyCredential(
      request: FastifyRequest,
      credential: Record<string, unknown>,
      challenge: Challenge,
      passkey: UserPasskey,
    ): Promise<User> {
      let newCounter: number
      try {
        const verification = await verifyAuthenticationResponse({
          response: credential as unknown as AuthenticationResponseJSON,
          expectedChallenge: challenge.challenge,
          expectedOrigin: challenge.origin,
          expectedRPID: challenge.rp_id,
          credential: {
            id: passkey.credentialId,
            publicKey: fromBase64Url(passkey.publicKey),
            // Synced passkeys legitimately report a stale counter from another device, so the
            // anti-clone regression check only applies to device-bound credentials.
            counter: passkey.backedUp ? 0 : passkey.signCount,
          },
          requireUserVerification: true,
        })
        if (!verification.verified) throw new Error('assertion not verified')
        newCounter = verification.authenticationInfo.newCounter
      } catch (error) {
        request.log.warn({ err: error, credentialId: passkey.credentialId }, 'passkey verification failed')
        throw new HttpError(401, 'Invalid passkey')
      }

      const user = await getUserById(ctx.db, passkey.userId)
      if (!user || !user.isActive) throw new HttpError(401, 'Invalid passkey')

      await ctx.db
        .update(userPasskeys)
        .set({ signCount: newCounter, lastUsedAt: new Date() })
        .where(eq(userPasskeys.id, passkey.id))
      return user
    }

    async function passkeysOf(userId: string): Promise<UserPasskey[]> {
      return ctx.db.select().from(userPasskeys).where(eq(userPasskeys.userId, userId)).orderBy(asc(userPasskeys.createdAt))
    }

    typed.get(
      '/api/auth/passkeys',
      { schema: { response: { 200: z.array(passkeyReadSchema) } }, preValidation: [requireUser] },
      async (request) => (await passkeysOf(request.user.id)).map(toPasskeyRead),
    )

    typed.post(
      '/api/auth/passkeys/register/options',
      {
        schema: { body: z.object({ name: z.string().min(1).max(100).default('Passkey') }), response: { 200: optionsResponse } },
        preValidation: [localAuth, requireUser],
      },
      async (request) => {
        const user = request.user
        const context = resolveWebAuthnContext(request as FastifyRequest, ctx.config)
        const existing = await passkeysOf(user.id)

        const options = await generateRegistrationOptions({
          rpID: context.rpId,
          rpName: ctx.config.webauthnRpName,
          userID: new TextEncoder().encode(user.id),
          userName: user.email,
          userDisplayName: user.email,
          attestationType: 'none',
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
          excludeCredentials: existing.map((passkey) => ({ id: passkey.credentialId })),
        })

        const challengeId = await storeChallenge(REGISTER_CHALLENGE_PREFIX, {
          challenge: options.challenge,
          user_id: user.id,
          name: request.body.name,
          rp_id: context.rpId,
          origin: context.origin,
        })
        return { challenge_id: challengeId, options: options as unknown as Record<string, unknown> }
      },
    )

    typed.post(
      '/api/auth/passkeys/register/verify',
      {
        schema: {
          body: z.object({
            challenge_id: z.string(),
            name: z.string().min(1).max(100).default('Passkey'),
            credential: credentialBody,
          }),
          response: { 200: passkeyReadSchema },
        },
        preValidation: [localAuth, requireUser],
      },
      async (request) => {
        const user = request.user
        const challenge = await popChallenge(REGISTER_CHALLENGE_PREFIX, request.body.challenge_id)
        if (!challenge || challenge.user_id !== user.id) throw new HttpError(400, 'Invalid or expired challenge')

        const credential = request.body.credential
        let info
        try {
          const verification = await verifyRegistrationResponse({
            response: credential as unknown as RegistrationResponseJSON,
            expectedChallenge: challenge.challenge,
            expectedOrigin: challenge.origin,
            expectedRPID: challenge.rp_id,
            requireUserVerification: true,
          })
          if (!verification.verified) throw new Error('not verified')
          info = verification.registrationInfo
        } catch {
          throw new HttpError(400, 'Invalid passkey registration')
        }

        const response = credential.response as { transports?: unknown } | undefined
        const transports = Array.isArray(credential.transports)
          ? credential.transports
          : Array.isArray(response?.transports)
            ? response.transports
            : null
        const passkey: UserPasskey = {
          id: randomUUID(),
          userId: user.id,
          credentialId: info.credential.id,
          publicKey: Buffer.from(info.credential.publicKey).toString('base64url'),
          signCount: info.credential.counter,
          name: request.body.name || (challenge.name as string | undefined) || 'Passkey',
          transports: transports ? transports.map(String) : null,
          aaguid: info.aaguid,
          deviceType: info.credentialDeviceType === 'multiDevice' ? 'multi_device' : 'single_device',
          backedUp: info.credentialBackedUp,
          createdAt: new Date(),
          lastUsedAt: null,
        }
        try {
          await ctx.db.insert(userPasskeys).values(passkey)
        } catch (error) {
          if (isUniqueViolation(error)) throw new HttpError(400, 'Passkey is already registered')
          throw error
        }
        return toPasskeyRead(passkey)
      },
    )

    typed.delete(
      '/api/auth/passkeys/:passkey_id',
      { schema: { params: z.object({ passkey_id: z.string().regex(UUID_PATTERN) }) }, preValidation: [requireUser] },
      async (request, reply) => {
        const [passkey] = await ctx.db
          .select()
          .from(userPasskeys)
          .where(and(eq(userPasskeys.id, request.params.passkey_id.toLowerCase()), eq(userPasskeys.userId, request.user.id)))
          .limit(1)
        if (!passkey) throw new HttpError(404, 'Passkey not found')
        await ctx.db.delete(userPasskeys).where(eq(userPasskeys.id, passkey.id))
        return reply.code(204).send()
      },
    )

    typed.post(
      '/api/auth/passkeys/authenticate/options',
      {
        schema: { body: z.object({ email: z.string().nullish() }), response: { 200: optionsResponse } },
        preValidation: [localAuth, login],
      },
      async (request) => {
        const context = resolveWebAuthnContext(request as FastifyRequest, ctx.config)
        const email = request.body.email ? request.body.email.trim().toLowerCase() : null
        let expectedUserId: string | null = null
        let allowCredentials: Array<{ id: string }> | undefined

        if (email) {
          const [loginUser] = await ctx.db
            .select()
            .from(users)
            .where(sql`lower(${users.email}) = ${email}`)
            .limit(1)
          if (loginUser) {
            expectedUserId = loginUser.id
            // Listing the credentials lets password managers surface the matching passkey; the
            // endpoint is rate-limited, which bounds credential enumeration.
            const list = (await passkeysOf(loginUser.id)).map((passkey) => ({ id: passkey.credentialId }))
            allowCredentials = list.length ? list : undefined
          }
        }

        const options = await generateAuthenticationOptions({
          rpID: context.rpId,
          userVerification: 'required',
          allowCredentials,
        })
        const challengeId = await storeChallenge(AUTHENTICATE_CHALLENGE_PREFIX, {
          challenge: options.challenge,
          email_bound: email !== null,
          expected_user_id: expectedUserId,
          rp_id: context.rpId,
          origin: context.origin,
        })
        return { challenge_id: challengeId, options: options as unknown as Record<string, unknown> }
      },
    )

    typed.post(
      '/api/auth/passkeys/authenticate/verify',
      {
        schema: { body: z.object({ challenge_id: z.string(), credential: credentialBody }) },
        preValidation: [localAuth, login],
      },
      async (request) => {
        const challenge = await popChallenge(AUTHENTICATE_CHALLENGE_PREFIX, request.body.challenge_id)
        if (!challenge) throw new HttpError(400, 'Invalid or expired challenge')

        const credentialId = credentialIdOf(request.body.credential)
        if (!credentialId) throw new HttpError(400, 'Missing credential ID')

        const [passkey] = await ctx.db
          .select()
          .from(userPasskeys)
          .where(eq(userPasskeys.credentialId, credentialId))
          .limit(1)
        if (!passkey) throw new HttpError(401, 'Invalid passkey')

        if (challenge.email_bound) {
          const expected = challenge.expected_user_id
          if (expected === null || expected === undefined || passkey.userId !== expected) {
            throw new HttpError(401, 'Invalid passkey')
          }
        }

        const user = await verifyPasskeyCredential(request, request.body.credential, challenge, passkey)
        return { access_token: await writeAccessToken(ctx.config, user.id), token_type: 'bearer' }
      },
    )

    typed.post(
      '/api/auth/passkeys/2fa/options',
      {
        schema: { body: z.object({ temp_token: z.string() }), response: { 200: optionsResponse } },
        preValidation: [localAuth, login],
      },
      async (request) => {
        const context = resolveWebAuthnContext(request as FastifyRequest, ctx.config)
        const userId = await secondFactorUserId(request.body.temp_token)
        const passkeys = UUID_PATTERN.test(userId) ? await passkeysOf(userId.toLowerCase()) : []
        if (passkeys.length === 0) throw new HttpError(401, 'Invalid token')

        const options = await generateAuthenticationOptions({
          rpID: context.rpId,
          userVerification: 'required',
          allowCredentials: passkeys.map((passkey) => ({ id: passkey.credentialId })),
        })
        const challengeId = await storeChallenge(SECOND_FACTOR_CHALLENGE_PREFIX, {
          challenge: options.challenge,
          user_id: userId,
          rp_id: context.rpId,
          origin: context.origin,
        })
        return { challenge_id: challengeId, options: options as unknown as Record<string, unknown> }
      },
    )

    typed.post(
      '/api/auth/passkeys/2fa/verify',
      {
        schema: {
          body: z.object({ temp_token: z.string(), challenge_id: z.string(), credential: credentialBody }),
        },
        preValidation: [localAuth, login],
      },
      async (request) => {
        const userId = await secondFactorUserId(request.body.temp_token)
        const challenge = await popChallenge(SECOND_FACTOR_CHALLENGE_PREFIX, request.body.challenge_id)
        if (!challenge || challenge.user_id !== userId) throw new HttpError(400, 'Invalid or expired challenge')

        const credentialId = credentialIdOf(request.body.credential)
        if (!credentialId) throw new HttpError(400, 'Missing credential ID')

        const [passkey] = UUID_PATTERN.test(userId)
          ? await ctx.db
              .select()
              .from(userPasskeys)
              .where(and(eq(userPasskeys.credentialId, credentialId), eq(userPasskeys.userId, userId.toLowerCase())))
              .limit(1)
          : []
        if (!passkey) throw new HttpError(401, 'Invalid passkey')

        const user = await verifyPasskeyCredential(request, request.body.credential, challenge, passkey)
        await ctx.keyValueStore.del(`2fa_temp:${request.body.temp_token}`)
        return { access_token: await writeAccessToken(ctx.config, user.id), token_type: 'bearer' }
      },
    )
  }
}
