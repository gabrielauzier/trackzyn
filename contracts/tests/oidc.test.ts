import { createHash } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { oidcSignIn, tokenFromFragment } from './support/flows'
import { Api, subject } from './support/http'
import { FakeIdp } from './support/idp'
import { redis } from './support/redis'
import { type RunningStack, startSubject } from './support/stacks'

describe('OpenID Connect login and callback', () => {
  let idp: FakeIdp
  let oidc: RunningStack
  let api: Api

  beforeAll(async () => {
    await resetData()
    idp = await FakeIdp.start()
    oidc = await startSubject(idp.env())
    api = new Api(oidc.url)
  })
  afterAll(async () => {
    await oidc?.stop()
    await idp?.stop()
  })

  it('C23 login redirects with the eight parameters', async () => {
    const reply = await api.get('/api/auth/oidc/login')
    expect(reply.status).toBe(307)
    const location = new URL(reply.headers.get('location') as string)
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
    expect(location.searchParams.get('client_id')).toBe('launchkit')
    expect(location.searchParams.get('redirect_uri')).toBe('http://localhost:5173/api/auth/oidc/callback')
    expect(location.searchParams.get('response_type')).toBe('code')
    expect(location.searchParams.get('scope')).toBe('openid email profile')
    expect(location.searchParams.get('code_challenge_method')).toBe('S256')
    expect(location.searchParams.get('state')).toBeTruthy()
    expect(location.searchParams.get('nonce')).toBeTruthy()
  })

  it('C23 state is stored as oidc_state:<state> with nonce and code_verifier', async () => {
    const reply = await api.get('/api/auth/oidc/login')
    const location = new URL(reply.headers.get('location') as string)
    const state = location.searchParams.get('state') as string
    const key = `oidc_state:${state}`
    const stored = JSON.parse((await redis().get(key)) as string)
    expect(Object.keys(stored).sort()).toEqual(['code_verifier', 'nonce'])
    expect(stored.nonce).toBe(location.searchParams.get('nonce'))
    expect(location.searchParams.get('code_challenge')).toBe(
      createHash('sha256').update(stored.code_verifier).digest('base64url'),
    )
    const ttl = await redis().ttl(key)
    expect(ttl).toBeGreaterThan(590)
    expect(ttl).toBeLessThanOrEqual(600)
  })

  it('C24 callback redirects to the frontend with an app token in the fragment', async () => {
    const reply = await oidcSignIn(api, idp, {
      claims: { sub: 'oidc-c24', email: 'c24@example.com', email_verified: true },
    })
    expect(reply.status).toBe(307)
    const location = reply.headers.get('location') as string
    expect(location.startsWith('http://localhost:5173/auth/oidc/callback#access_token=')).toBe(true)
    expect(location.endsWith('&token_type=bearer')).toBe(true)
    const me = await api.get('/api/users/me', { token: tokenFromFragment(reply) as string })
    expect(me.status).toBe(200)
    expect(me.json.email).toBe('c24@example.com')
  })

  it('C24 a state is single use: the second callback is 400 Invalid or expired OIDC state', async () => {
    const begin = await api.get('/api/auth/oidc/login')
    const location = new URL(begin.headers.get('location') as string)
    const state = location.searchParams.get('state') as string
    const stored = JSON.parse((await redis().get(`oidc_state:${state}`)) as string)
    idp.grant('single-use-code', stored.nonce, location.searchParams.get('code_challenge') as string, {
      claims: { sub: 'oidc-c24-once', email: 'c24-once@example.com', email_verified: true },
    })
    const first = await api.get(`/api/auth/oidc/callback?code=single-use-code&state=${state}`)
    expect(first.status).toBe(307)
    const second = await api.get(`/api/auth/oidc/callback?code=single-use-code&state=${state}`)
    expect(second.status).toBe(400)
    expect(second.json).toEqual({ detail: 'Invalid or expired OIDC state' })
  })

  it('C24 an unknown state is 400 Invalid or expired OIDC state', async () => {
    const reply = await api.get('/api/auth/oidc/callback?code=anything&state=never-issued')
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid or expired OIDC state' })
  })
})

describe('OpenID Connect configuration endpoint', () => {
  let idp: FakeIdp
  beforeAll(async () => {
    idp = await FakeIdp.start()
  })
  afterAll(async () => {
    await idp?.stop()
  })

  it('C25 oidc config is disabled by default', async () => {
    const reply = await subject().get('/api/auth/oidc/config')
    expect(reply.status).toBe(200)
    expect(reply.json.enabled).toBe(false)
    expect(reply.json.local_auth_enabled).toBe(true)
  })

  it('C25 oidc config exposes the provider name and local auth switched off', async () => {
    const stack = await startSubject(idp.env({ LOCAL_AUTH_ENABLED: 'false' }))
    try {
      const reply = await new Api(stack.url).get('/api/auth/oidc/config')
      expect(reply.status).toBe(200)
      expect(reply.json).toEqual({ enabled: true, provider_name: 'Pocket ID', local_auth_enabled: false })
    } finally {
      await stack.stop()
    }
  })
})

