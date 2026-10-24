import { eq } from 'drizzle-orm'
import { Secret, TOTP } from 'otpauth'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '../../src/db/schema.ts'
import { type TestApp, bearer, createTestApp, freshIp, register } from '../support/test-app.ts'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(async () => {
  await t.close()
})

const code = (secret: string, offsetSeconds = 0) =>
  new TOTP({ secret: Secret.fromBase32(secret) }).generate({ timestamp: Date.now() + offsetSeconds * 1000 })

const post = (url: string, payload: unknown, token?: string) =>
  t.app.inject({
    method: 'POST',
    url,
    headers: token ? bearer(token) : { 'x-forwarded-for': freshIp() },
    payload: payload as object,
  })

async function userWith2fa() {
  const user = await register(t)
  const setup = await post('/api/auth/2fa/setup', undefined, user.token)
  const secret = setup.json().secret as string
  expect((await post('/api/auth/2fa/enable', { code: code(secret) }, user.token)).statusCode).toBe(200)
  return { ...user, secret }
}

const login = (email: string, password: string) =>
  t.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'x-forwarded-for': freshIp(), 'content-type': 'application/x-www-form-urlencoded' },
    payload: new URLSearchParams({ username: email, password }).toString(),
  })

describe('TOTP second factor', () => {
  it('stores a 32 character base32 secret and an otpauth uri on setup', async () => {
    const user = await register(t)
    const reply = await post('/api/auth/2fa/setup', undefined, user.token)
    expect(reply.statusCode).toBe(200)
    expect(reply.json().secret).toMatch(/^[A-Z2-7]{32}$/)
    expect(reply.json().otpauth_uri).toContain('otpauth://totp/')
    expect(reply.json().otpauth_uri).toContain(`secret=${reply.json().secret}`)
  })

  it('enable needs setup first, a valid code, and accepts the adjacent windows', async () => {
    const user = await register(t)
    const early = await post('/api/auth/2fa/enable', { code: '123456' }, user.token)
    expect(early.json()).toEqual({ detail: 'Call /2fa/setup first' })

    const secret = (await post('/api/auth/2fa/setup', undefined, user.token)).json().secret as string
    expect((await post('/api/auth/2fa/enable', { code: '000000' }, user.token)).json()).toEqual({ detail: 'Invalid 2FA code' })
    expect((await post('/api/auth/2fa/enable', { code: code(secret, -30) }, user.token)).statusCode).toBe(200)
    expect((await post('/api/auth/2fa/enable', { code: code(secret, -90) }, user.token)).statusCode).toBe(400)
  })

  it('login answers requires_2fa, verify turns the temp token into an access token once', async () => {
    const user = await userWith2fa()
    const first = await login(user.email, user.password)
    expect(first.json()).toMatchObject({ requires_2fa: true, available_methods: ['totp'] })
    const temp = first.json().temp_token as string

    const stored = JSON.parse((await t.ctx.keyValueStore.get(`2fa_temp:${temp}`)) as string)
    expect(stored).toEqual({ user_id: user.id, available_methods: ['totp'] })

    const wrong = await post('/api/auth/2fa/verify', { temp_token: temp, code: '000000' })
    expect(wrong.json()).toEqual({ detail: 'Invalid 2FA code' })
    const ok = await post('/api/auth/2fa/verify', { temp_token: temp, code: code(user.secret) })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().token_type).toBe('bearer')
    const again = await post('/api/auth/2fa/verify', { temp_token: temp, code: code(user.secret) })
    expect(again.statusCode).toBe(401)
    expect(again.json()).toEqual({ detail: 'Invalid or expired token' })
  })

  it('verify accepts a legacy temp token holding only the user id and refuses one without totp', async () => {
    const user = await userWith2fa()
    await t.ctx.keyValueStore.set('2fa_temp:legacy', user.id, { ttlSeconds: 60 })
    expect((await post('/api/auth/2fa/verify', { temp_token: 'legacy', code: code(user.secret) })).statusCode).toBe(200)

    await t.ctx.keyValueStore.set(
      '2fa_temp:passkey-only',
      JSON.stringify({ user_id: user.id, available_methods: ['passkey'] }),
      { ttlSeconds: 60 },
    )
    const refused = await post('/api/auth/2fa/verify', { temp_token: 'passkey-only', code: code(user.secret) })
    expect(refused.json()).toEqual({ detail: 'Invalid token' })

    await t.ctx.keyValueStore.set('2fa_temp:garbage', '[1]', { ttlSeconds: 60 })
    expect((await post('/api/auth/2fa/verify', { temp_token: 'garbage', code: '123456' })).json()).toEqual({
      detail: 'Invalid token',
    })
  })

  it('disable checks the password, that 2FA is set up and the code, then clears both columns', async () => {
    const user = await userWith2fa()
    const badPassword = await post('/api/auth/2fa/disable', { password: 'nope', code: code(user.secret) }, user.token)
    expect(badPassword.json()).toEqual({ detail: 'Invalid password' })
    const badCode = await post('/api/auth/2fa/disable', { password: user.password, code: '000000' }, user.token)
    expect(badCode.json()).toEqual({ detail: 'Invalid 2FA code' })

    const ok = await post('/api/auth/2fa/disable', { password: user.password, code: code(user.secret) }, user.token)
    expect(ok.json()).toEqual({ detail: '2FA disabled' })
    const [row] = await t.ctx.db.select().from(users).where(eq(users.id, user.id))
    expect(row?.totpSecret).toBeNull()
    expect(row?.is2faEnabled).toBe(false)

    const notSetUp = await post('/api/auth/2fa/disable', { password: user.password, code: '123456' }, user.token)
    expect(notSetUp.json()).toEqual({ detail: '2FA is not set up' })
  })
})

describe('with local sign-in switched off', () => {
  it('setup and enable are 403 LOCAL_AUTH_DISABLED', async () => {
    const off = await createTestApp({
      LOCAL_AUTH_ENABLED: 'false',
      OIDC_ENABLED: 'true',
      OIDC_CLIENT_ID: 'x',
      OIDC_DISCOVERY_URL: 'http://127.0.0.1:1/.well-known/openid-configuration',
    })
    try {
      const reply = await off.app.inject({ method: 'POST', url: '/api/auth/2fa/setup', headers: bearer('x') })
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
    } finally {
      await off.close()
    }
  })
})
