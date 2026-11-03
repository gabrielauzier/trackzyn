import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users, workspaceMembers } from '../../src/db/schema.ts'
import { FakeIdp, type Grant } from '../support/idp.ts'
import { type TestApp, bearer, createTestApp, register } from '../support/test-app.ts'

let idp: FakeIdp
beforeAll(async () => {
  idp = await FakeIdp.start()
})
afterAll(async () => {
  await idp.stop()
})

async function signIn(t: TestApp, grant: Grant) {
  const begin = await t.app.inject({ method: 'GET', url: '/api/auth/oidc/login' })
  expect(begin.statusCode).toBe(307)
  const location = new URL(begin.headers.location as string)
  const state = location.searchParams.get('state') as string
  const stored = JSON.parse((await t.ctx.keyValueStore.get(`oidc_state:${state}`)) as string)
  const code = `code-${Math.random().toString(36).slice(2)}`
  idp.grant(code, stored.nonce, location.searchParams.get('code_challenge') as string, grant)
  const reply = await t.app.inject({ method: 'GET', url: `/api/auth/oidc/callback?code=${code}&state=${state}` })
  const token = reply.headers.location
    ? new URLSearchParams(new URL(reply.headers.location as string).hash.slice(1)).get('access_token')
    : null
  return { reply, token }
}

const appWith = (env: Record<string, string> = {}) => createTestApp(idp.env(env))
const me = (t: TestApp, token: string) => t.app.inject({ method: 'GET', url: '/api/users/me', headers: bearer(token) })

describe('OpenID Connect', () => {
  it('redirects to the provider with the eight parameters and stores the state', async () => {
    const t = await appWith()
    try {
      const begin = await t.app.inject({ method: 'GET', url: '/api/auth/oidc/login' })
      const location = new URL(begin.headers.location as string)
      expect(`${location.origin}${location.pathname}`).toBe(`${idp.issuer}/authorize`)
      expect([...location.searchParams.keys()].sort()).toEqual([
        'client_id',
        'code_challenge',
        'code_challenge_method',
        'nonce',
        'redirect_uri',
        'response_type',
        'scope',
        'state',
      ])
      expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/auth/oidc/callback')
      const stored = JSON.parse(
        (await t.ctx.keyValueStore.get(`oidc_state:${location.searchParams.get('state')}`)) as string,
      )
      expect(Object.keys(stored).sort()).toEqual(['code_verifier', 'nonce'])
    } finally {
      await t.close()
    }
  })

  it('creates a user, validates at_hash and rejects bad states, subjects and unverified e-mails', async () => {
    const t = await appWith()
    try {
      const created = await signIn(t, {
        claims: { sub: 'sub-1', email: 'New@Example.com', email_verified: true, name: 'New User' },
        atHash: true,
      })
      expect(created.reply.headers.location).toMatch(/^http:\/\/localhost:5173\/auth\/oidc\/callback#access_token=.+&token_type=bearer$/)
      const profile = await me(t, created.token as string)
      expect(profile.json()).toMatchObject({ email: 'new@example.com', is_superuser: false })
      expect(profile.json().preferences).toMatchObject({ display_name: 'New User', auth_provider: 'Pocket ID' })

      const badHash = await signIn(t, { claims: { sub: 's2', email: 'a@example.com', email_verified: true }, atHash: 'wrong' })
      expect(badHash.reply.json()).toEqual({ detail: 'Invalid OIDC id_token' })
      const mismatch = await signIn(t, {
        claims: { sub: 's3', email: 'b@example.com', email_verified: true },
        userinfo: { sub: 'other' },
      })
      expect(mismatch.reply.json()).toEqual({ detail: 'OIDC userinfo subject does not match id_token subject' })
      const unverified = await signIn(t, { claims: { sub: 's4', email: 'c@example.com' } })
      expect(unverified.reply.json()).toEqual({ detail: 'OIDC email is not verified' })
      const noEmail = await signIn(t, { claims: { sub: 's5', email_verified: true } })
      expect(noEmail.reply.json()).toEqual({ detail: 'OIDC provider did not return an email claim' })

      const unknownState = await t.app.inject({ method: 'GET', url: '/api/auth/oidc/callback?code=x&state=never' })
      expect(unknownState.json()).toEqual({ detail: 'Invalid or expired OIDC state' })
    } finally {
      await t.close()
    }
  })

  it('links an existing account by link mode and refuses mismatches', async () => {
    const disabled = await appWith()
    const verifiedEmail = await appWith({ OIDC_EXISTING_USER_LINK_MODE: 'verified_email' })
    const byEmail = await appWith({ OIDC_EXISTING_USER_LINK_MODE: 'email' })
    try {
      const user = await register(disabled)
      const refused = await signIn(disabled, { claims: { sub: 'x', email: user.email, email_verified: true } })
      expect(refused.reply.statusCode).toBe(403)
      expect(refused.reply.json()).toEqual({ detail: 'Existing account is not linked to this OIDC identity' })

      // The three apps share nothing, so give each its own copy of the account.
      const other = await register(verifiedEmail)
      const notVerified = await signIn(verifiedEmail, { claims: { sub: 'v1', email: other.email } })
      expect(notVerified.reply.json()).toEqual({ detail: 'OIDC email is not verified' })
      const linked = await signIn(verifiedEmail, { claims: { sub: 'v1', email: other.email, email_verified: true } })
      expect(linked.reply.statusCode).toBe(307)
      const differentSubject = await signIn(verifiedEmail, { claims: { sub: 'v2', email: other.email, email_verified: true } })
      expect(differentSubject.reply.json()).toEqual({ detail: 'OIDC identity is linked to a different account' })

      const third = await register(byEmail)
      const viaEmail = await signIn(byEmail, { claims: { sub: 'e1', email: third.email } })
      expect(viaEmail.reply.statusCode).toBe(307)
      const [row] = await byEmail.ctx.db.select().from(users).where(eq(users.id, third.id))
      expect(row).toMatchObject({ oidcIssuer: idp.issuer, oidcSubject: 'e1' })

      // A linked user signs in with the subject alone.
      expect((await signIn(byEmail, { claims: { sub: 'e1' } })).reply.statusCode).toBe(307)
    } finally {
      await Promise.all([disabled.close(), verifiedEmail.close(), byEmail.close()])
    }
  })

  it('honours the registration setting and the auto-register switch', async () => {
    const t = await appWith({ OIDC_AUTO_REGISTER: 'false' })
    try {
      const reply = await signIn(t, { claims: { sub: 'r1', email: 'r1@example.com', email_verified: true } })
      expect(reply.reply.json()).toEqual({ detail: 'No local account is linked to this OIDC identity' })
    } finally {
      await t.close()
    }
    const closed = await appWith({ REGISTRATION_ENABLED: 'false' })
    try {
      const reply = await signIn(closed, { claims: { sub: 'r2', email: 'r2@example.com', email_verified: true } })
      expect(reply.reply.json()).toEqual({ detail: 'Registration is disabled' })
    } finally {
      await closed.close()
    }
  })

  it('syncs admin and workspace roles from the provider claims', async () => {
    const t = await appWith({
      OIDC_SYNC_ROLES: 'true',
      OIDC_ADMIN_ROLES: 'admins',
      OIDC_EXISTING_USER_LINK_MODE: 'email',
      OIDC_WORKSPACE_ROLE_MAP: JSON.stringify({ editors: 'editor', viewers: 'viewer', owners: 'owner' }),
    })
    try {
      const user = await register(t)
      await t.ctx.db.update(workspaceMembers).set({ role: 'viewer' }).where(eq(workspaceMembers.userId, user.id))
      const upgraded = await signIn(t, {
        claims: { sub: 'u1', email: user.email, groups: ['admins', 'editors', 'viewers'] },
      })
      expect((await me(t, upgraded.token as string)).json().is_superuser).toBe(true)
      const [member] = await t.ctx.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, user.id))
      expect(member?.role).toBe('editor')

      // An owner of their Personal workspace is never demoted.
      await t.ctx.db.update(workspaceMembers).set({ role: 'owner' }).where(eq(workspaceMembers.userId, user.id))
      const revoked = await signIn(t, { claims: { sub: 'u1', groups: ['users', 'viewers'] } })
      expect((await me(t, revoked.token as string)).json().is_superuser).toBe(false)
      const [kept] = await t.ctx.db.select().from(workspaceMembers).where(eq(workspaceMembers.userId, user.id))
      expect(kept?.role).toBe('owner')

      const created = await signIn(t, {
        claims: { sub: 'u2', email: 'admin-new@example.com', email_verified: true, groups: ['admins'] },
      })
      expect((await me(t, created.token as string)).json().is_superuser).toBe(true)
    } finally {
      await t.close()
    }
  })

  it('fails the way the Python backend does with a broken role map, a provider outage or no OIDC', async () => {
    const broken = await appWith({ OIDC_SYNC_ROLES: 'true', OIDC_WORKSPACE_ROLE_MAP: '{"a":"emperor"}' })
    try {
      const reply = await signIn(broken, { claims: { sub: 'b1', email: 'b1@example.com', email_verified: true, groups: ['a'] } })
      expect(reply.reply.statusCode).toBe(500)
      expect(reply.reply.json()).toEqual({ detail: 'OIDC_WORKSPACE_ROLE_MAP contains invalid workspace roles: emperor' })
    } finally {
      await broken.close()
    }

    const plain = await createTestApp()
    try {
      const config = await plain.app.inject({ method: 'GET', url: '/api/auth/oidc/config' })
      expect(config.json()).toEqual({ enabled: false, provider_name: 'OIDC', local_auth_enabled: true })
      const login = await plain.app.inject({ method: 'GET', url: '/api/auth/oidc/login' })
      expect(login.statusCode).toBe(500)
    } finally {
      await plain.close()
    }

    const down = await FakeIdp.start()
    const stack = await createTestApp(down.env())
    await down.stop()
    try {
      const reply = await stack.app.inject({ method: 'GET', url: '/api/auth/oidc/login' })
      expect(reply.statusCode).toBe(500)
      expect(reply.body).toBe('Internal Server Error')
    } finally {
      await stack.close()
    }
  })
})

describe('OpenID Connect desktop sign-in', () => {
  const TARGET = 'trackzyn://auth/callback'
  const login = (t: TestApp, query: string) => t.app.inject({ method: 'GET', url: `/api/auth/oidc/login?${query}` })

  it('rejects a missing or short desktop_nonce and stores nothing (desktop_nonce)', async () => {
    const t = await appWith({ OIDC_DESKTOP_REDIRECT: TARGET })
    try {
      const target = `redirect_target=${encodeURIComponent(TARGET)}`
      for (const query of [target, `${target}&desktop_nonce=`, `${target}&desktop_nonce=${'x'.repeat(31)}`, `${target}&desktop_nonce=${'x'.repeat(129)}`]) {
        const reply = await login(t, query)
        expect(reply.statusCode, query).toBe(400)
        expect(reply.json()).toEqual({ detail: 'Invalid desktop_nonce' })
        expect(reply.headers.location).toBeUndefined()
      }
      expect((await login(t, `${target}&desktop_nonce=${'x'.repeat(32)}`)).statusCode).toBe(307)
    } finally {
      await t.close()
    }
  })

  it('keeps the desktop_nonce in the state and returns it in the deep link (desktop_nonce)', async () => {
    const t = await appWith({ OIDC_DESKTOP_REDIRECT: TARGET })
    try {
      const nonce = 'n'.repeat(43)
      const begin = await login(t, `redirect_target=${encodeURIComponent(TARGET)}&desktop_nonce=${nonce}`)
      expect(begin.statusCode).toBe(307)
      const location = new URL(begin.headers.location as string)
      const state = location.searchParams.get('state') as string
      const stored = JSON.parse((await t.ctx.keyValueStore.get(`oidc_state:${state}`)) as string)
      expect(Object.keys(stored).sort()).toEqual(['code_verifier', 'desktop_nonce', 'nonce', 'redirect_target'])

      const code = 'code-desktop-nonce'
      idp.grant(code, stored.nonce, location.searchParams.get('code_challenge') as string, {
        claims: { sub: 'sub-desktop', email: 'desktop@example.com', email_verified: true },
      })
      const reply = await t.app.inject({ method: 'GET', url: `/api/auth/oidc/callback?code=${code}&state=${state}` })
      expect(reply.statusCode).toBe(307)
      const target = reply.headers.location as string
      expect(target.startsWith(`${TARGET}#access_token=`)).toBe(true)
      expect(target.endsWith(`&token_type=bearer&desktop_nonce=${nonce}`)).toBe(true)
    } finally {
      await t.close()
    }
  })
})
