import { eq } from 'drizzle-orm'
import { Secret, TOTP } from 'otpauth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { userPasskeys, users } from '../../src/db/schema.ts'
import { VirtualAuthenticator } from '../support/authenticator.ts'
import { type TestApp, bearer, createTestApp, freshIp, register } from '../support/test-app.ts'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(async () => {
  await t.close()
})

const ORIGIN = 'https://trackzyn.test'

const post = (url: string, payload: unknown, token?: string, headers: Record<string, string> = {}) =>
  t.app.inject({
    method: 'POST',
    url,
    headers: { ...(token ? bearer(token) : { 'x-forwarded-for': freshIp() }), origin: ORIGIN, ...headers },
    payload: payload as object,
  })

async function registerPasskey(token: string, authenticator: VirtualAuthenticator, name = 'Key') {
  const begin = await post('/api/auth/passkeys/register/options', { name }, token)
  expect(begin.statusCode).toBe(200)
  const credential = authenticator.createCredential(begin.json().options, ORIGIN, { transports: ['usb'] })
  return post('/api/auth/passkeys/register/verify', { challenge_id: begin.json().challenge_id, name, credential }, token)
}

async function signIn(authenticator: VirtualAuthenticator, email?: string, counter?: number) {
  const begin = await post('/api/auth/passkeys/authenticate/options', email ? { email } : {})
  expect(begin.statusCode).toBe(200)
  const credential = authenticator.getAssertion(begin.json().options, ORIGIN, { counter })
  return post('/api/auth/passkeys/authenticate/verify', { challenge_id: begin.json().challenge_id, credential })
}

describe('passkeys', () => {
  it('registers a passkey with the columns the Python backend writes and lists it', async () => {
    const user = await register(t)
    const authenticator = new VirtualAuthenticator({ backedUp: true })
    const created = await registerPasskey(user.token, authenticator, 'YubiKey')
    expect(created.statusCode).toBe(200)
    expect(created.json()).toMatchObject({ name: 'YubiKey', transports: ['usb'], device_type: 'multi_device', backed_up: true })
    expect(created.json().credential_id).toBeUndefined()

    const [row] = await t.ctx.db.select().from(userPasskeys).where(eq(userPasskeys.userId, user.id))
    expect(row).toMatchObject({ credentialId: authenticator.id, publicKey: authenticator.publicKey, signCount: 0 })

    const listed = await t.app.inject({ method: 'GET', url: '/api/auth/passkeys', headers: bearer(user.token) })
    expect(listed.json().map((p: { name: string }) => p.name)).toEqual(['YubiKey'])

    const again = await registerPasskey(user.token, authenticator)
    expect(again.statusCode).toBe(400)
  })

  it('stores challenges as passkey_register|passkey_authenticate:<id> with an origin binding', async () => {
    const user = await register(t)
    const begin = await post('/api/auth/passkeys/register/options', { name: 'Key' }, user.token)
    const stored = JSON.parse((await t.ctx.keyValueStore.get(`passkey_register:${begin.json().challenge_id}`)) as string)
    expect(stored).toEqual({
      challenge: begin.json().options.challenge,
      user_id: user.id,
      name: 'Key',
      rp_id: 'trackzyn.test',
      origin: ORIGIN,
    })
    const failed = await post(
      '/api/auth/passkeys/register/verify',
      { challenge_id: begin.json().challenge_id, name: 'Key', credential: { id: 'x', rawId: 'x', response: {} } },
      user.token,
    )
    expect(failed.json()).toEqual({ detail: 'Invalid passkey registration' })
    expect(await t.ctx.keyValueStore.get(`passkey_register:${begin.json().challenge_id}`)).toBeNull()
  })

  it('signs in with a passkey, tracks the counter, and enforces it only for device-bound keys', async () => {
    const user = await register(t)
    const device = new VirtualAuthenticator()
    await registerPasskey(user.token, device)

    const first = await signIn(device, user.email.toUpperCase(), 5)
    expect(first.statusCode).toBe(200)
    expect(first.json().token_type).toBe('bearer')
    const [row] = await t.ctx.db.select().from(userPasskeys).where(eq(userPasskeys.userId, user.id))
    expect(row?.signCount).toBe(5)
    expect(row?.lastUsedAt).toBeInstanceOf(Date)

    const stale = await signIn(device, undefined, 2)
    expect(stale.statusCode).toBe(401)
    expect(stale.json()).toEqual({ detail: 'Invalid passkey' })

    const synced = new VirtualAuthenticator({ backedUp: true })
    await registerPasskey(user.token, synced)
    expect((await signIn(synced, undefined, 3)).statusCode).toBe(200)
    expect((await signIn(synced, undefined, 1)).statusCode).toBe(200)
  })

  it('rejects another user passkey on an email-bound challenge and an unknown credential', async () => {
    const owner = await register(t)
    const other = await register(t)
    const otherKey = new VirtualAuthenticator()
    await registerPasskey(other.token, otherKey)

    expect((await signIn(otherKey, owner.email)).statusCode).toBe(401)
    expect((await signIn(otherKey, 'missing@example.com')).statusCode).toBe(401)
    expect((await signIn(new VirtualAuthenticator())).statusCode).toBe(401)

    const missing = await post('/api/auth/passkeys/authenticate/verify', { challenge_id: 'nope', credential: {} })
    expect(missing.json()).toEqual({ detail: 'Invalid or expired challenge' })
    const begin = await post('/api/auth/passkeys/authenticate/options', {})
    const noId = await post('/api/auth/passkeys/authenticate/verify', { challenge_id: begin.json().challenge_id, credential: {} })
    expect(noId.json()).toEqual({ detail: 'Missing credential ID' })
  })

  it('deletes only the owner passkeys', async () => {
    const owner = await register(t)
    const stranger = await register(t)
    await registerPasskey(owner.token, new VirtualAuthenticator())
    await registerPasskey(stranger.token, new VirtualAuthenticator())
    const [own] = await t.ctx.db.select().from(userPasskeys).where(eq(userPasskeys.userId, owner.id))
    const [theirs] = await t.ctx.db.select().from(userPasskeys).where(eq(userPasskeys.userId, stranger.id))

    const hidden = await t.app.inject({ method: 'DELETE', url: `/api/auth/passkeys/${theirs?.id}`, headers: bearer(owner.token) })
    expect(hidden.statusCode).toBe(404)
    const deleted = await t.app.inject({ method: 'DELETE', url: `/api/auth/passkeys/${own?.id}`, headers: bearer(owner.token) })
    expect(deleted.statusCode).toBe(204)
  })

  it('offers passkey as a second factor only when 2FA is on, and verifies it', async () => {
    const user = await register(t)
    const authenticator = new VirtualAuthenticator()
    await registerPasskey(user.token, authenticator)

    const plain = await post('/api/auth/login', undefined)
    expect(plain.statusCode).toBe(422)
    const loginForm = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-forwarded-for': freshIp(), 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ username: user.email, password: user.password }).toString(),
      })
    expect((await loginForm()).json().access_token).toBeTruthy()

    const secret = (await post('/api/auth/2fa/setup', undefined, user.token)).json().secret as string
    const totp = new TOTP({ secret: Secret.fromBase32(secret) }).generate()
    await post('/api/auth/2fa/enable', { code: totp }, user.token)

    const pending = await loginForm()
    expect(pending.json().available_methods).toEqual(['totp', 'passkey'])
    const temp = pending.json().temp_token as string

    const begin = await post('/api/auth/passkeys/2fa/options', { temp_token: temp })
    expect(begin.statusCode).toBe(200)
    expect(begin.json().options.allowCredentials[0].id).toBe(authenticator.id)
    const credential = authenticator.getAssertion(begin.json().options, ORIGIN)
    const verified = await post('/api/auth/passkeys/2fa/verify', {
      temp_token: temp,
      challenge_id: begin.json().challenge_id,
      credential,
    })
    expect(verified.statusCode).toBe(200)
    expect(await t.ctx.keyValueStore.get(`2fa_temp:${temp}`)).toBeNull()

    const nothing = await post('/api/auth/passkeys/2fa/options', { temp_token: 'unknown' })
    expect(nothing.json()).toEqual({ detail: 'Invalid or expired token' })
    await t.ctx.keyValueStore.set('2fa_temp:totp-only', JSON.stringify({ user_id: user.id, available_methods: ['totp'] }), {
      ttlSeconds: 60,
    })
    expect((await post('/api/auth/passkeys/2fa/options', { temp_token: 'totp-only' })).json()).toEqual({ detail: 'Invalid token' })
    await t.ctx.db.update(users).set({ is2faEnabled: false }).where(eq(users.id, user.id))
  })
})

describe('relying party resolution', () => {
  const options = (headers: Record<string, string>, user: { token: string }) =>
    t.app.inject({
      method: 'POST',
      url: '/api/auth/passkeys/register/options',
      headers: { ...bearer(user.token), ...headers },
      payload: { name: 'Key' },
    })

  it('answers the same codes as the Python backend', async () => {
    const user = await register(t)
    expect((await options({ origin: 'http://localhost:3000' }, user)).json().options.rp.id).toBe('localhost')
    expect((await options({ 'x-forwarded-host': 'money.example.com', 'x-forwarded-proto': 'https' }, user)).json().options.rp.id).toBe(
      'money.example.com',
    )
    for (const [origin, code] of [
      ['http://192.168.4.10:3000', 'passkey_origin_ip'],
      ['http://[::1]:3000', 'passkey_origin_ip'],
      ['http://trackzyn.example.com', 'passkey_origin_insecure'],
      ['not-an-origin', 'passkey_origin_invalid'],
      ['https://', 'passkey_origin_invalid'],
      ['https://[broken', 'passkey_origin_invalid'],
      ['https://host:port', 'passkey_origin_invalid'],
    ] as const) {
      const reply = await options({ origin }, user)
      expect([reply.statusCode, reply.json().detail.code], origin).toEqual([400, code])
    }
  })

  it('pins the rp id and the origin when configured', async () => {
    const pinned = await createTestApp({ WEBAUTHN_RP_ID: 'example.com', WEBAUTHN_ORIGIN: 'https://app.example.com' })
    try {
      const email = `pin-${freshIp()}@example.com`
      await pinned.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-forwarded-for': freshIp() },
        payload: { email, password: 'pinned-pass-123' },
      })
      const session = await pinned.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-forwarded-for': freshIp(), 'content-type': 'application/x-www-form-urlencoded' },
        payload: new URLSearchParams({ username: email, password: 'pinned-pass-123' }).toString(),
      })
      const token = session.json().access_token as string
      const ok = await pinned.app.inject({
        method: 'POST',
        url: '/api/auth/passkeys/register/options',
        headers: { ...bearer(token), origin: 'https://money.example.com' },
        payload: { name: 'Key' },
      })
      expect(ok.json().options.rp.id).toBe('example.com')
      const stored = JSON.parse((await pinned.ctx.keyValueStore.get(`passkey_register:${ok.json().challenge_id}`)) as string)
      expect(stored.origin).toBe('https://app.example.com')

      const outside = await pinned.app.inject({
        method: 'POST',
        url: '/api/auth/passkeys/register/options',
        headers: { ...bearer(token), origin: 'https://not-example.com' },
        payload: { name: 'Key' },
      })
      expect(outside.json().detail.code).toBe('passkey_origin_mismatch')
    } finally {
      await pinned.close()
    }
  })
})
