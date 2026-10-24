import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  linkOidcIdentity,
  memberRoleOf,
  resetData,
  setAppSetting,
  setMemberRole,
  setSuperuser,
  userRow,
} from './support/db'
import { oidcSignIn, tokenFromFragment } from './support/flows'
import { Api, registerUser, subject } from './support/http'
import { FakeIdp } from './support/idp'
import { type RunningStack, startSubject } from './support/stacks'

// One case for each case of backend/tests/test_oidc_auth.py (see parity-map.json).

let idp: FakeIdp
const stacks: RunningStack[] = []

async function instance(env: Record<string, string> = {}): Promise<Api> {
  const stack = await startSubject(idp.env(env))
  stacks.push(stack)
  return new Api(stack.url)
}

beforeAll(async () => {
  idp = await FakeIdp.start()
})
afterAll(async () => {
  await Promise.all(stacks.map((stack) => stack.stop()))
  await idp?.stop()
})

async function existingUser() {
  return registerUser(subject())
}

describe('default link mode (disabled), verified email required', () => {
  let api: Api
  beforeAll(async () => {
    await resetData()
    api = await instance()
  })

  it('C25 an id_token carrying at_hash from the provider is accepted', async () => {
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'google-sub-123', email: 'user@gmail.com', email_verified: true },
      atHash: true,
    })
    expect(reply.status).toBe(307)
    const me = await api.get('/api/users/me', { token: tokenFromFragment(reply) as string })
    expect(me.json.email).toBe('user@gmail.com')
  })

  it('C25 an id_token whose at_hash does not match the access token is 400 Invalid OIDC id_token', async () => {
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'at-hash-sub', email: 'athash@example.com', email_verified: true },
      atHash: 'not-the-hash',
    })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid OIDC id_token' })
  })

  it('C25 the callback creates a user, a personal workspace and redirects with an app token', async () => {
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'user-sub', email: 'oidc@example.com', email_verified: true, name: 'OIDC User' },
    })
    expect(reply.status).toBe(307)
    expect(reply.headers.get('location')).toMatch(/^http:\/\/localhost:5173\/auth\/oidc\/callback#access_token=/)
    const token = tokenFromFragment(reply) as string
    const me = await api.get('/api/users/me', { token })
    expect(me.status).toBe(200)
    expect(me.json.email).toBe('oidc@example.com')
    // `create(..., safe=True)` ignores is_verified, so a provider-created user starts unverified.
    expect(me.json.is_verified).toBe(false)
    expect(me.json.is_superuser).toBe(false)
    expect(me.json.preferences).toEqual({
      language: 'en',
      date_format: 'MM/DD/YYYY',
      timezone: 'UTC',
      display_name: 'OIDC User',
      auth_provider: 'Pocket ID',
    })
    const workspaces = await api.get('/api/workspaces', { token })
    expect(workspaces.json).toHaveLength(1)
    expect(workspaces.json[0].role).toBe('owner')
  })

  it('C25 the callback rejects a userinfo subject that differs from the id_token subject', async () => {
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'signed-sub', email: 'mismatch@example.com', email_verified: true },
      userinfo: { sub: 'different-sub', email: 'mismatch@example.com', email_verified: true },
    })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'OIDC userinfo subject does not match id_token subject' })
  })

  it('C25 the callback requires a verified email claim when enabled', async () => {
    const reply = await oidcSignIn(api, idp, { claims: { sub: 'signed-sub-2', email: 'unverified@example.com' } })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'OIDC email is not verified' })
  })

  it('C25 the callback rejects an unlinked existing user by default', async () => {
    const user = await existingUser()
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'new-sub', email: user.email, email_verified: true },
    })
    expect(reply.status).toBe(403)
    expect(reply.json).toEqual({ detail: 'Existing account is not linked to this OIDC identity' })
  })

  it('C25 the callback respects the disabled registration setting', async () => {
    await setAppSetting('registration_enabled', 'false')
    try {
      const reply = await oidcSignIn(api, idp, {
        claims: { sub: 'new-sub-reg', email: 'new@example.com', email_verified: true },
      })
      expect(reply.status).toBe(403)
      expect(reply.json).toEqual({ detail: 'Registration is disabled' })
    } finally {
      await setAppSetting('registration_enabled', null)
    }
  })

  it('C25 a linked user can sign in without an email claim', async () => {
    const user = await existingUser()
    await linkOidcIdentity(user.email, idp.issuer, 'linked-no-email')
    const reply = await oidcSignIn(api, idp, { claims: { sub: 'linked-no-email' } })
    expect(reply.status).toBe(307)
    const me = await api.get('/api/users/me', { token: tokenFromFragment(reply) as string })
    expect(me.json.email).toBe(user.email)
  })
})

describe('link mode verified_email', () => {
  let api: Api
  beforeAll(async () => {
    await resetData()
    api = await instance({ OIDC_EXISTING_USER_LINK_MODE: 'verified_email' })
  })

  it('C25 verified_email mode links an existing user', async () => {
    const user = await existingUser()
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'linked-sub', email: user.email, email_verified: true },
    })
    expect(reply.status).toBe(307)
    const row = await userRow(user.email)
    expect(row.oidc_issuer).toBe(idp.issuer)
    expect(row.oidc_subject).toBe('linked-sub')
  })

  it('C25 verified_email mode does not link an unverified email', async () => {
    const user = await existingUser()
    const reply = await oidcSignIn(api, idp, { claims: { sub: 'unverified-sub', email: user.email } })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'OIDC email is not verified' })
  })

  it('C25 the callback rejects an existing user linked to a different subject', async () => {
    const user = await existingUser()
    await linkOidcIdentity(user.email, idp.issuer, 'original-sub')
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'different-sub', email: user.email, email_verified: true },
    })
    expect(reply.status).toBe(403)
    expect(reply.json).toEqual({ detail: 'OIDC identity is linked to a different account' })
  })

  it('C25 a linked user can sign in without a verified email when one is required', async () => {
    const user = await existingUser()
    await linkOidcIdentity(user.email, idp.issuer, 'linked-sub-2')
    const reply = await oidcSignIn(api, idp, { claims: { sub: 'linked-sub-2', email: user.email } })
    expect(reply.status).toBe(307)
  })
})

describe('link mode email', () => {
  let api: Api
  beforeAll(async () => {
    await resetData()
    api = await instance({ OIDC_EXISTING_USER_LINK_MODE: 'email' })
  })

  it('C25 email mode links an existing user without a verified email', async () => {
    const user = await existingUser()
    const reply = await oidcSignIn(api, idp, { claims: { sub: 'unverified-linked-sub', email: user.email } })
    expect(reply.status).toBe(307)
    const row = await userRow(user.email)
    expect(row.oidc_issuer).toBe(idp.issuer)
    expect(row.oidc_subject).toBe('unverified-linked-sub')
  })

  it('C25 disabled registration does not block linking an existing email', async () => {
    const user = await existingUser()
    await setAppSetting('registration_enabled', 'false')
    try {
      const reply = await oidcSignIn(api, idp, {
        claims: { sub: 'linked-with-registration-disabled', email: user.email },
      })
      expect(reply.status).toBe(307)
      const row = await userRow(user.email)
      expect(row.oidc_subject).toBe('linked-with-registration-disabled')
    } finally {
      await setAppSetting('registration_enabled', null)
    }
  })
})

describe('role synchronisation', () => {
  let api: Api
  beforeAll(async () => {
    await resetData()
    api = await instance({
      OIDC_SYNC_ROLES: 'true',
      OIDC_ADMIN_ROLES: 'launchkit-admins',
      OIDC_WORKSPACE_ROLE_MAP: JSON.stringify({
        'launchkit-viewers': 'viewer',
        'launchkit-editors': 'editor',
        'launchkit-owners': 'owner',
      }),
    })
  })

  it('C25 the callback syncs an existing user admin flag and workspace role', async () => {
    const user = await existingUser()
    await linkOidcIdentity(user.email, idp.issuer, 'user-sub-sync')
    const reply = await oidcSignIn(api, idp, {
      claims: {
        sub: 'user-sub-sync',
        email: user.email,
        email_verified: true,
        groups: ['launchkit-admins', 'launchkit-editors'],
      },
    })
    expect(reply.status).toBe(307)
    const token = tokenFromFragment(reply) as string
    const me = await api.get('/api/users/me', { token })
    expect(me.json.is_superuser).toBe(true)
    const current = await api.get('/api/workspaces/current', { token })
    expect(current.status).toBe(200)
    expect(current.json.role).toBe('owner')
    expect(await memberRoleOf(user.id)).toEqual(['owner'])
  })

  it('C25 a mapped role changes a non-owner membership in the personal workspace', async () => {
    const user = await existingUser()
    await linkOidcIdentity(user.email, idp.issuer, 'user-sub-viewer')
    await setMemberRole(user.id, 'viewer')
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'user-sub-viewer', email: user.email, email_verified: true, groups: ['launchkit-editors'] },
    })
    expect(reply.status).toBe(307)
    expect(await memberRoleOf(user.id)).toEqual(['editor'])
  })

  it('C25 the callback can revoke the admin flag', async () => {
    const user = await existingUser()
    await setSuperuser(user.email, true)
    await linkOidcIdentity(user.email, idp.issuer, 'user-sub-revoke')
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'user-sub-revoke', email: user.email, email_verified: true, groups: ['launchkit-users'] },
    })
    expect(reply.status).toBe(307)
    const me = await api.get('/api/users/me', { token: tokenFromFragment(reply) as string })
    expect(me.json.is_superuser).toBe(false)
  })

  it('C25 signed claims win over userinfo for email and roles', async () => {
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'signed-sub-win', email: 'userinfo-override@example.com', email_verified: true, groups: ['launchkit-users'] },
      userinfo: {
        sub: 'signed-sub-win',
        email: 'attacker@example.com',
        email_verified: true,
        groups: ['launchkit-admins'],
      },
    })
    expect(reply.status).toBe(307)
    const me = await api.get('/api/users/me', { token: tokenFromFragment(reply) as string })
    expect(me.json.email).toBe('userinfo-override@example.com')
    expect(me.json.is_superuser).toBe(false)
  })

  it('C25 a new user with an admin role is created as a superuser', async () => {
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'admin-sub', email: 'new-admin@example.com', email_verified: true, groups: ['launchkit-admins'] },
    })
    expect(reply.status).toBe(307)
    const me = await api.get('/api/users/me', { token: tokenFromFragment(reply) as string })
    expect(me.json.is_superuser).toBe(true)
  })
})
