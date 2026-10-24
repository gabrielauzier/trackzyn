import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { VirtualAuthenticator } from './support/authenticator'
import { passkeyRows, resetData } from './support/db'
import { rawRequestWithoutHost } from './support/flows'
import { Api, registerUser, subject } from './support/http'
import { redis } from './support/redis'
import { type RunningStack, startSubject } from './support/stacks'

type User = Awaited<ReturnType<typeof registerUser>>

function registerOptions(api: Api, user: User, origin: string | null, extra: Record<string, string> = {}) {
  return api.post('/api/auth/passkeys/register/options', {
    token: user.token,
    headers: { ...(origin ? { origin } : {}), ...extra },
    json: { name: 'YubiKey' },
  })
}

describe('relying party resolution', () => {
  let user: User
  beforeAll(async () => {
    await resetData()
    user = await registerUser(subject())
  })

  it('C22 rp id and origin follow the request origin', async () => {
    const reply = await registerOptions(subject(), user, 'https://money.example.com')
    expect(reply.status).toBe(200)
    expect(reply.json.options.rp.id).toBe('money.example.com')
    const stored = JSON.parse((await redis().get(`passkey_register:${reply.json.challenge_id}`)) as string)
    expect(stored.rp_id).toBe('money.example.com')
    expect(stored.origin).toBe('https://money.example.com')
  })

  it('C22 http localhost is allowed and is its own rp id', async () => {
    const reply = await registerOptions(subject(), user, 'http://localhost:3000')
    expect(reply.status).toBe(200)
    expect(reply.json.options.rp.id).toBe('localhost')
  })

  it('C22 an IP address origin is 400 passkey_origin_ip', async () => {
    const reply = await registerOptions(subject(), user, 'http://192.168.4.10:3000')
    expect(reply.status).toBe(400)
    expect(reply.json.detail.code).toBe('passkey_origin_ip')
    expect(reply.json.detail.message).toEqual(expect.any(String))
  })

  it('C22 a loopback IP origin is 400 passkey_origin_ip', async () => {
    const reply = await registerOptions(subject(), user, 'http://127.0.0.1:3000')
    expect(reply.status).toBe(400)
    expect(reply.json.detail.code).toBe('passkey_origin_ip')
  })

  it('C22 a plain http origin on a domain is 400 passkey_origin_insecure', async () => {
    const reply = await registerOptions(subject(), user, 'http://launchkit.example.com')
    expect(reply.status).toBe(400)
    expect(reply.json.detail.code).toBe('passkey_origin_insecure')
  })

  it('C22 forwarded host and proto stand in for a missing origin', async () => {
    const reply = await registerOptions(subject(), user, null, {
      'x-forwarded-host': 'money.example.com',
      'x-forwarded-proto': 'https',
    })
    expect(reply.status).toBe(200)
    expect(reply.json.options.rp.id).toBe('money.example.com')
  })

  it('C22 an origin that is not an origin is 400 passkey_origin_invalid', async () => {
    const reply = await registerOptions(subject(), user, 'not-an-origin')
    expect(reply.status).toBe(400)
    expect(reply.json.detail.code).toBe('passkey_origin_invalid')
  })

  it('C22 a request with neither origin nor host is 400 passkey_origin_missing', async () => {
    const reply = await rawRequestWithoutHost(
      subject().baseUrl,
      '/api/auth/passkeys/register/options',
      { authorization: `Bearer ${user.token}`, 'x-forwarded-for': subject().ip },
      { name: 'YubiKey' },
    )
    expect(reply.status).toBe(400)
    expect(reply.json.detail.code).toBe('passkey_origin_missing')
  })

  it('C22 authenticate options derive the rp id from the request origin', async () => {
    const reply = await subject().post('/api/auth/passkeys/authenticate/options', {
      headers: { origin: 'https://money.example.com' },
      json: {},
    })
    expect(reply.status).toBe(200)
    expect(reply.json.options.rpId).toBe('money.example.com')
  })

  it('C22 register verify uses the origin the challenge was issued for', async () => {
    const authenticator = new VirtualAuthenticator()
    const origin = 'https://money.example.com'
    const begin = await registerOptions(subject(), user, origin)
    const credential = authenticator.createCredential(begin.json.options, origin)
    // The verify request comes from a different origin than the options request did.
    const verify = await subject().post('/api/auth/passkeys/register/verify', {
      token: user.token,
      headers: { origin: 'https://elsewhere.example.org' },
      json: { challenge_id: begin.json.challenge_id, name: 'YubiKey', credential },
    })
    expect(verify.status).toBe(200)
    const rows = await passkeyRows(user.id)
    expect(rows.map((row) => row.credential_id)).toContain(authenticator.id)
  })

  describe('with WEBAUTHN_RP_ID pinned', () => {
    let pinned: RunningStack
    beforeAll(async () => {
      pinned = await startSubject({ WEBAUTHN_RP_ID: 'example.com' })
    })
    afterAll(async () => {
      await pinned?.stop()
    })

    it('C22 a pinned rp id is used for an origin on a subdomain', async () => {
      const reply = await registerOptions(new Api(pinned.url), user, 'https://money.example.com')
      expect(reply.status).toBe(200)
      expect(reply.json.options.rp.id).toBe('example.com')
    })

    it('C22 origin outside the pinned rp id is 400 passkey_origin_mismatch', async () => {
      const reply = await registerOptions(new Api(pinned.url), user, 'https://not-example.com')
      expect(reply.status).toBe(400)
      expect(reply.json.detail.code).toBe('passkey_origin_mismatch')
    })
  })

  describe('with WEBAUTHN_ORIGIN fixed', () => {
    let fixed: RunningStack
    beforeAll(async () => {
      fixed = await startSubject({ WEBAUTHN_ORIGIN: 'https://app.example.com' })
    })
    afterAll(async () => {
      await fixed?.stop()
    })

    it('C22 WEBAUTHN_ORIGIN replaces the origin stored with the challenge', async () => {
      const reply = await registerOptions(new Api(fixed.url), user, 'https://money.example.com')
      expect(reply.status).toBe(200)
      expect(reply.json.options.rp.id).toBe('money.example.com')
      const stored = JSON.parse((await redis().get(`passkey_register:${reply.json.challenge_id}`)) as string)
      expect(stored.origin).toBe('https://app.example.com')
      expect(stored.rp_id).toBe('money.example.com')
    })
  })
})
