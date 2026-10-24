import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { Api, PASSWORD, registerUser, subject, uniqueEmail } from './support/http'
import { type RunningStack, startSubject } from './support/stacks'

const OIDC_ONLY = {
  LOCAL_AUTH_ENABLED: 'false',
  OIDC_ENABLED: 'true',
  OIDC_CLIENT_ID: 'launchkit',
  OIDC_DISCOVERY_URL: 'http://127.0.0.1:1/.well-known/openid-configuration',
}

describe('LOCAL_AUTH_ENABLED=false with a complete OIDC configuration', () => {
  let oidcOnly: RunningStack
  let user: Awaited<ReturnType<typeof registerUser>>

  beforeAll(async () => {
    await resetData()
    user = await registerUser(subject())
    oidcOnly = await startSubject(OIDC_ONLY)
  })
  afterAll(async () => {
    await oidcOnly?.stop()
  })

  it('C7 login is 403 LOCAL_AUTH_DISABLED', async () => {
    const api = new Api(oidcOnly.url)
    const reply = await api.post('/api/auth/login', { form: { username: user.email, password: user.password } })
    expect(reply.status).toBe(403)
    expect(reply.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
  })

  it('C7 create-admin is 403 LOCAL_AUTH_DISABLED', async () => {
    const api = new Api(oidcOnly.url)
    const reply = await api.post('/api/setup/create-admin', {
      json: { email: uniqueEmail('admin'), password: PASSWORD },
    })
    expect(reply.status).toBe(403)
    expect(reply.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
  })

  it('C7 password change on PATCH /api/users/me is 403 LOCAL_AUTH_DISABLED', async () => {
    const api = new Api(oidcOnly.url)
    const reply = await api.patch('/api/users/me', {
      token: user.token,
      json: { password: 'a-brand-new-password-1' },
    })
    expect(reply.status).toBe(403)
    expect(reply.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })

    // A profile change without a password stays allowed.
    const profile = await api.patch('/api/users/me', { token: user.token, json: { preferences: { language: 'pt' } } })
    expect(profile.status).toBe(200)
  })
})
