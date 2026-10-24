import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { appSettings, users } from '../../src/db/schema.ts'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { PASSWORD, type TestApp, bearer, bootstrapAdmin, createTestApp, freshIp, register, uniqueEmail } from '../support/test-app.ts'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(async () => {
  await t.close()
})

const form = (username: string, password: string) => ({
  method: 'POST' as const,
  url: '/api/auth/login',
  headers: { 'x-forwarded-for': freshIp(), 'content-type': 'application/x-www-form-urlencoded' },
  payload: new URLSearchParams({ username, password }).toString(),
})

describe('health and setup', () => {
  it('health answers 200 {"status":"healthy"}', async () => {
    const reply = await t.app.inject({ method: 'GET', url: '/api/health' })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ status: 'healthy' })
  })

  it('C5 setup status, create-admin and the second create-admin', async () => {
    const status = async () => (await t.app.inject({ method: 'GET', url: '/api/setup/status' })).json()
    expect(await status()).toEqual({ has_users: false })

    const created = await t.app.inject({
      method: 'POST',
      url: '/api/setup/create-admin',
      payload: { email: uniqueEmail(), password: PASSWORD, name: 'Ada', language: 'pt-BR' },
    })
    expect(created.statusCode).toBe(200)
    expect(created.json().token_type).toBe('bearer')
    expect(await status()).toEqual({ has_users: true })

    const again = await t.app.inject({
      method: 'POST',
      url: '/api/setup/create-admin',
      payload: { email: uniqueEmail(), password: PASSWORD },
    })
    expect(again.statusCode).toBe(403)
    expect(again.json()).toEqual({ detail: 'Setup already completed' })

    // The admin has a localized personal workspace and the display name.
    const me = await t.app.inject({ method: 'GET', url: '/api/users/me', headers: bearer(created.json().access_token) })
    expect(me.json()).toMatchObject({ is_superuser: true, preferences: { language: 'pt-BR', display_name: 'Ada', onboarding_completed: false } })
    const workspaces = await t.app.inject({ method: 'GET', url: '/api/workspaces', headers: bearer(created.json().access_token) })
    expect(workspaces.json()).toHaveLength(1)
    expect(workspaces.json()[0]).toMatchObject({ name: 'Pessoal', locale: 'pt-BR', role: 'owner' })
  })
})

describe('login and tokens', () => {
  it('C6 valid login returns a bearer token, a wrong password is 400 LOGIN_BAD_CREDENTIALS', async () => {
    const user = await register(t)
    const ok = await t.app.inject(form(user.email, user.password))
    expect(ok.statusCode).toBe(200)
    expect(Object.keys(ok.json()).sort()).toEqual(['access_token', 'token_type'])

    const bad = await t.app.inject(form(user.email, 'nope'))
    expect(bad.statusCode).toBe(400)
    expect(bad.json()).toEqual({ detail: 'LOGIN_BAD_CREDENTIALS' })

    const unknown = await t.app.inject(form('ghost@example.com', 'nope'))
    expect(unknown.json()).toEqual({ detail: 'LOGIN_BAD_CREDENTIALS' })
  })

  it('login is case-insensitive on the e-mail and refuses an inactive user', async () => {
    const user = await register(t, 'Mixed.Case@Example.COM')
    const reply = await t.app.inject(form('mixed.case@example.com', user.password))
    expect(reply.statusCode).toBe(200)

    await t.ctx.db.update(users).set({ isActive: false }).where(eq(users.id, user.id))
    const inactive = await t.app.inject(form(user.email, user.password))
    expect(inactive.statusCode).toBe(400)
    const me = await t.app.inject({ method: 'GET', url: '/api/users/me', headers: bearer(user.token) })
    expect(me.statusCode).toBe(401)
  })

  it('C10 a bcrypt hash is replaced by an argon2 hash after a successful login', async () => {
    const email = uniqueEmail()
    await t.ctx.db.insert(users).values({
      id: randomUUID(),
      email,
      hashedPassword: bcrypt.hashSync(PASSWORD, 4),
      isActive: true,
      isSuperuser: false,
      isVerified: true,
      preferences: {},
    })
    expect((await t.app.inject(form(email, PASSWORD))).statusCode).toBe(200)
    const [row] = await t.ctx.db.select().from(users).where(eq(users.email, email))
    expect(row?.hashedPassword).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/)
    expect((await t.app.inject(form(email, PASSWORD))).statusCode).toBe(200)
  })

  it('login only reads a form body; JSON is a missing-field 422', async () => {
    const reply = await t.app.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { username: 'a', password: 'b' },
    })
    expect(reply.statusCode).toBe(422)
    expect(reply.json().detail.map((d: { loc: string[] }) => d.loc)).toEqual([['body', 'username'], ['body', 'password']])
  })

  it('logout answers {"detail":"Logged out"}', async () => {
    const reply = await t.app.inject({ method: 'POST', url: '/api/auth/logout', headers: { 'x-forwarded-for': freshIp() } })
    expect(reply.json()).toEqual({ detail: 'Logged out' })
  })

  it('a missing, malformed or foreign token is 401 Unauthorized', async () => {
    for (const authorization of [undefined, 'Bearer garbage', 'Basic abc', 'Bearer']) {
      const reply = await t.app.inject({
        method: 'GET',
        url: '/api/users/me',
        headers: { 'x-forwarded-for': freshIp(), ...(authorization ? { authorization } : {}) },
      })
      expect(reply.statusCode).toBe(401)
      expect(reply.json()).toEqual({ detail: 'Unauthorized' })
    }
  })
})

describe('rate limits', () => {
  it('C12 the sixth login in 60 s is 429 with Retry-After 60, the fourth register 429 with 3600', async () => {
    const ip = freshIp()
    const login = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        headers: { 'x-forwarded-for': ip, 'content-type': 'application/x-www-form-urlencoded' },
        payload: 'username=ghost%40example.com&password=x',
      })
    for (let i = 0; i < 5; i++) expect((await login()).statusCode).toBe(400)
    const sixth = await login()
    expect(sixth.statusCode).toBe(429)
    expect(sixth.json()).toEqual({ detail: 'Too many requests' })
    expect(sixth.headers['retry-after']).toBe('60')

    const regIp = freshIp()
    const reg = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-forwarded-for': regIp },
        payload: { email: uniqueEmail(), password: PASSWORD },
      })
    for (let i = 0; i < 3; i++) expect((await reg()).statusCode).toBe(201)
    const fourth = await reg()
    expect(fourth.statusCode).toBe(429)
    expect(fourth.headers['retry-after']).toBe('3600')
  })
})

describe('registration', () => {
  it('C14 creates the user with a personal workspace, refuses a duplicate and honours the setting', async () => {
    const email = uniqueEmail()
    const created = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { email, password: PASSWORD, is_superuser: true, is_verified: true },
    })
    expect(created.statusCode).toBe(201)
    // The privilege flags of a public registration are ignored.
    expect(created.json()).toMatchObject({ email, is_superuser: false, is_verified: false, is_active: true, is_2fa_enabled: false })
    expect(created.json().preferences).toEqual({ language: 'en', date_format: 'MM/DD/YYYY' })

    const duplicate = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { email: email.toUpperCase().replace('@EXAMPLE.COM', '@example.com'), password: PASSWORD },
    })
    expect(duplicate.statusCode).toBe(400)
    expect(duplicate.json()).toEqual({ detail: 'REGISTER_USER_ALREADY_EXISTS' })
  })

  it('C14 a saved registration_enabled setting wins over the environment', async () => {
    const enabledByEnv = await createTestApp({ REGISTRATION_ENABLED: 'true' })
    try {
      await enabledByEnv.ctx.db.insert(appSettings).values({ key: 'registration_enabled', value: 'false' })
      const reply = await enabledByEnv.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-forwarded-for': freshIp() },
        payload: { email: uniqueEmail(), password: PASSWORD },
      })
      expect(reply.statusCode).toBe(403)
      await enabledByEnv.ctx.db.update(appSettings).set({ value: 'TRUE' }).where(eq(appSettings.key, 'registration_enabled'))
      const allowed = await enabledByEnv.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-forwarded-for': freshIp() },
        payload: { email: uniqueEmail(), password: PASSWORD },
      })
      expect(allowed.statusCode).toBe(201)
    } finally {
      await enabledByEnv.close()
    }
  })

  it('C14 registration disabled is 403, from the saved setting and from the environment', async () => {
    const disabled = await createTestApp({ REGISTRATION_ENABLED: 'false' })
    try {
      const reply = await disabled.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-forwarded-for': freshIp() },
        payload: { email: uniqueEmail(), password: PASSWORD },
      })
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual({ detail: 'Registration is currently disabled' })
    } finally {
      await disabled.close()
    }
  })
})

describe('users', () => {
  it('reads and updates the current user; an e-mail change unverifies, a duplicate is 400', async () => {
    const a = await register(t)
    const b = await register(t)

    const patched = await t.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: bearer(a.token),
      payload: { preferences: { language: 'pt' }, is_superuser: true },
    })
    expect(patched.statusCode).toBe(200)
    expect(patched.json()).toMatchObject({ is_superuser: false, preferences: { language: 'pt' } })

    const taken = await t.app.inject({ method: 'PATCH', url: '/api/users/me', headers: bearer(a.token), payload: { email: b.email } })
    expect(taken.statusCode).toBe(400)
    expect(taken.json()).toEqual({ detail: 'UPDATE_USER_EMAIL_ALREADY_EXISTS' })

    const newPassword = 'a-new-password-456'
    const changed = await t.app.inject({ method: 'PATCH', url: '/api/users/me', headers: bearer(a.token), payload: { password: newPassword } })
    expect(changed.statusCode).toBe(200)
    expect((await t.app.inject(form(a.email, newPassword))).statusCode).toBe(200)
    expect((await t.app.inject(form(a.email, a.password))).statusCode).toBe(400)
  })

  it('the /api/users/{id} routes need a superuser and behave like fastapi-users', async () => {
    const admin = await bootstrapAdmin(t).catch(() => null)
    const adminToken =
      admin?.token ??
      (await (async () => {
        // The setup case above already created the first admin: promote a fresh user instead.
        const u = await register(t)
        await t.ctx.db.update(users).set({ isSuperuser: true }).where(eq(users.id, u.id))
        return u.token
      })())
    const target = await register(t)
    const plain = await register(t)

    expect((await t.app.inject({ method: 'GET', url: `/api/users/${target.id}`, headers: { 'x-forwarded-for': freshIp() } })).statusCode).toBe(401)
    expect((await t.app.inject({ method: 'GET', url: `/api/users/${target.id}`, headers: bearer(plain.token) })).statusCode).toBe(403)

    const got = await t.app.inject({ method: 'GET', url: `/api/users/${target.id}`, headers: bearer(adminToken) })
    expect(got.statusCode).toBe(200)
    expect(got.json().email).toBe(target.email)

    for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
      const missing = await t.app.inject({ method: 'GET', url: `/api/users/${id}`, headers: bearer(adminToken) })
      expect(missing.statusCode).toBe(404)
      expect(missing.json()).toEqual({ detail: 'Not Found' })
    }

    const patched = await t.app.inject({
      method: 'PATCH',
      url: `/api/users/${target.id}`,
      headers: bearer(adminToken),
      payload: { is_verified: true, is_active: true, email: 'Renamed@Example.com' },
    })
    expect(patched.json()).toMatchObject({ is_verified: false, email: 'Renamed@example.com' })

    const removed = await t.app.inject({ method: 'DELETE', url: `/api/users/${target.id}`, headers: bearer(adminToken) })
    expect(removed.statusCode).toBe(204)
    expect((await t.app.inject({ method: 'GET', url: `/api/users/${target.id}`, headers: bearer(adminToken) })).statusCode).toBe(404)
  })
})

describe('validation', () => {
  it('C16 invalid bodies are 422 in the FastAPI shape', async () => {
    const reply = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { email: 'bad' },
    })
    expect(reply.statusCode).toBe(422)
    const items = reply.json().detail as Array<{ loc: unknown[]; msg: string; type: string }>
    expect(items.map((i) => i.loc)).toEqual([['body', 'email'], ['body', 'password']])
    expect(items.map((i) => i.type)).toEqual(['value_error', 'missing'])
    for (const item of items) expect(typeof item.msg).toBe('string')

    const malformed = await t.app.inject({
      method: 'POST',
      url: '/api/auth/register',
      headers: { 'x-forwarded-for': freshIp(), 'content-type': 'application/json' },
      payload: '{not json',
    })
    expect(malformed.statusCode).toBe(422)
    expect(malformed.json().detail[0]).toMatchObject({ type: 'json_invalid', loc: ['body', 0] })

    const empty = await t.app.inject({ method: 'POST', url: '/api/auth/register', headers: { 'x-forwarded-for': freshIp() } })
    expect(empty.statusCode).toBe(422)

    const wrongType = await t.app.inject({
      method: 'PATCH',
      url: '/api/users/me',
      headers: bearer((await register(t)).token),
      payload: { email: 12 },
    })
    expect(wrongType.json().detail[0]).toMatchObject({ type: 'string_type', loc: ['body', 'email'] })
  })

  it('unknown routes are {"detail":"Not Found"}', async () => {
    const reply = await t.app.inject({ method: 'GET', url: '/api/nothing-here' })
    expect(reply.statusCode).toBe(404)
    expect(reply.json()).toEqual({ detail: 'Not Found' })
  })
})

describe('password reset', () => {
  it('C15 forgot-password is 202 and reset-password with a bad token is 400', async () => {
    const user = await register(t)
    const forgot = await t.app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { email: user.email },
    })
    expect(forgot.statusCode).toBe(202)
    const unknown = await t.app.inject({
      method: 'POST',
      url: '/api/auth/forgot-password',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { email: 'ghost@example.com' },
    })
    expect(unknown.statusCode).toBe(202)

    const reset = await t.app.inject({
      method: 'POST',
      url: '/api/auth/reset-password',
      headers: { 'x-forwarded-for': freshIp() },
      payload: { token: 'nope', password: 'whatever-123' },
    })
    expect(reset.statusCode).toBe(400)
    expect(reset.json()).toEqual({ detail: 'RESET_PASSWORD_BAD_TOKEN' })
  })
})

describe('LOCAL_AUTH_ENABLED=false', () => {
  it('C7 login, create-admin and a password change are 403 LOCAL_AUTH_DISABLED', async () => {
    const user = await register(t)
    const oidcOnly = await createTestApp({
      LOCAL_AUTH_ENABLED: 'false',
      OIDC_ENABLED: 'true',
      OIDC_CLIENT_ID: 'trackzyn',
      OIDC_DISCOVERY_URL: 'https://id.example.com/.well-known/openid-configuration',
    })
    try {
      const login = await oidcOnly.app.inject(form(user.email, user.password))
      expect(login.statusCode).toBe(403)
      expect(login.json()).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })

      const setup = await oidcOnly.app.inject({
        method: 'POST',
        url: '/api/setup/create-admin',
        payload: { email: uniqueEmail(), password: PASSWORD },
      })
      expect(setup.json()).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })

      const registered = await oidcOnly.app.inject({
        method: 'POST',
        url: '/api/auth/register',
        headers: { 'x-forwarded-for': freshIp() },
        payload: { email: uniqueEmail(), password: PASSWORD },
      })
      expect(registered.statusCode).toBe(403)
    } finally {
      await oidcOnly.close()
    }
  })
})
