import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { VirtualAuthenticator } from './support/authenticator'
import { resetData } from './support/db'
import { enableTotp, loginForTempToken, registerPasskey, totpCode } from './support/flows'
import { Api, freshIp, login, registerUser, stackApi, subject, uniqueEmail } from './support/http'
import { redis } from './support/redis'
import { trackSecret } from './support/secrets'
import { type RunningStack, startSubject } from './support/stacks'

const OIDC_ONLY = {
  LOCAL_AUTH_ENABLED: 'false',
  OIDC_ENABLED: 'true',
  OIDC_CLIENT_ID: 'launchkit',
  OIDC_DISCOVERY_URL: 'http://127.0.0.1:1/.well-known/openid-configuration',
}

async function userWith2fa(api: Api = subject()) {
  const user = await registerUser(api)
  const secret = await enableTotp(api, user.token)
  return { ...user, secret }
}

async function tempTokenFor(api: Api, user: { email: string; password: string }): Promise<string> {
  const reply = await loginForTempToken(api, user.email, user.password)
  return trackSecret(reply.json.temp_token)
}

describe('login with two-factor authentication', () => {
  beforeAll(resetData)

  it('C17 2fa on, no passkey -> ["totp"]', async () => {
    const user = await userWith2fa()
    const reply = await login(subject(), user.email, user.password)
    expect(reply.status).toBe(200)
    expect(Object.keys(reply.json).sort()).toEqual(['available_methods', 'requires_2fa', 'temp_token'])
    expect(reply.json.requires_2fa).toBe(true)
    expect(reply.json.available_methods).toEqual(['totp'])
    expect(reply.json.temp_token).toEqual(expect.any(String))
  })

  it('C17 2fa on, one passkey -> ["totp","passkey"]', async () => {
    const user = await userWith2fa()
    const registered = await registerPasskey(subject(), user.token, new VirtualAuthenticator())
    expect(registered.status).toBe(200)
    const reply = await login(subject(), user.email, user.password)
    expect(reply.status).toBe(200)
    expect(reply.json.requires_2fa).toBe(true)
    expect(reply.json.available_methods).toEqual(['totp', 'passkey'])
    expect(reply.json.access_token).toBeUndefined()
  })

  it('C17 2fa off, one passkey -> plain token', async () => {
    const user = await registerUser(subject())
    const registered = await registerPasskey(subject(), user.token, new VirtualAuthenticator())
    expect(registered.status).toBe(200)
    const reply = await login(subject(), user.email, user.password)
    expect(reply.status).toBe(200)
    expect(Object.keys(reply.json).sort()).toEqual(['access_token', 'token_type'])
    expect(reply.json.requires_2fa).toBeUndefined()
  })

  it('C17 2fa off, no passkey -> plain token', async () => {
    const user = await registerUser(subject())
    const reply = await login(subject(), user.email, user.password)
    expect(reply.status).toBe(200)
    expect(Object.keys(reply.json).sort()).toEqual(['access_token', 'token_type'])
    expect(reply.json.token_type).toBe('bearer')
  })
})

describe('the temporary token', () => {
  beforeAll(resetData)

  it('C18 temp token is stored as 2fa_temp:<token> with JSON and TTL 300', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(subject(), user)
    const key = `2fa_temp:${temp}`
    const stored = await redis().get(key)
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored as string)).toEqual({ user_id: user.id, available_methods: ['totp'] })
    const ttl = await redis().ttl(key)
    expect(ttl).toBeGreaterThan(290)
    expect(ttl).toBeLessThanOrEqual(300)
  })

  it('C18 temp token from python verifies on node', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(stackApi('python'), user)
    const verified = await stackApi('node').post('/api/auth/2fa/verify', {
      json: { temp_token: temp, code: totpCode(user.secret) },
    })
    expect(verified.status).toBe(200)
    expect(verified.json.token_type).toBe('bearer')
    trackSecret(verified.json.access_token)
    const me = await stackApi('node').get('/api/users/me', { token: verified.json.access_token })
    expect(me.json.email).toBe(user.email)
  })

  it('C18 temp token from node verifies on python', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(stackApi('node'), user)
    const verified = await stackApi('python').post('/api/auth/2fa/verify', {
      json: { temp_token: temp, code: totpCode(user.secret) },
    })
    expect(verified.status).toBe(200)
    expect(verified.json.token_type).toBe('bearer')
    trackSecret(verified.json.access_token)
    const me = await stackApi('python').get('/api/users/me', { token: verified.json.access_token })
    expect(me.json.email).toBe(user.email)
  })

  it('C18 a temp token used once is 401 Invalid or expired token', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(subject(), user)
    const first = await subject().post('/api/auth/2fa/verify', { json: { temp_token: temp, code: totpCode(user.secret) } })
    expect(first.status).toBe(200)
    trackSecret(first.json.access_token)
    const second = await subject().post('/api/auth/2fa/verify', {
      json: { temp_token: temp, code: totpCode(user.secret) },
    })
    expect(second.status).toBe(401)
    expect(second.json).toEqual({ detail: 'Invalid or expired token' })
  })
})

describe('verify and disable', () => {
  beforeAll(resetData)

  it('C19 wrong code is 400 Invalid 2FA code', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(subject(), user)
    const reply = await subject().post('/api/auth/2fa/verify', { json: { temp_token: temp, code: '000000' } })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid 2FA code' })
  })

  it('C19 sixth verify in 60 s is 429', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(subject(), user)
    const ip = freshIp()
    for (let attempt = 1; attempt <= 5; attempt++) {
      const reply = await subject().post('/api/auth/2fa/verify', { ip, json: { temp_token: temp, code: '000000' } })
      expect(reply.status, `attempt ${attempt}`).toBe(400)
    }
    const sixth = await subject().post('/api/auth/2fa/verify', { ip, json: { temp_token: temp, code: '000000' } })
    expect(sixth.status).toBe(429)
    expect(sixth.json).toEqual({ detail: 'Too many requests' })
  })

  it('C20 disable with a wrong password is 400 Invalid password', async () => {
    const user = await userWith2fa()
    const reply = await subject().post('/api/auth/2fa/disable', {
      token: user.token,
      json: { password: 'not-the-password', code: totpCode(user.secret) },
    })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid password' })
  })

  it('C20 disable without 2FA set up is 400 2FA is not set up', async () => {
    const user = await registerUser(subject())
    const reply = await subject().post('/api/auth/2fa/disable', {
      token: user.token,
      json: { password: user.password, code: '123456' },
    })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: '2FA is not set up' })
  })
})

// One case for each case of backend/tests/test_two_factor.py (see parity-map.json).
describe('parity with test_two_factor.py', () => {
  beforeAll(resetData)

  it('C25 2fa setup returns a secret and an otpauth uri', async () => {
    const user = await registerUser(subject())
    const reply = await subject().post('/api/auth/2fa/setup', { token: user.token })
    expect(reply.status).toBe(200)
    expect(Object.keys(reply.json).sort()).toEqual(['otpauth_uri', 'secret'])
    expect(reply.json.otpauth_uri).toContain('otpauth://totp/')
    expect(reply.json.otpauth_uri).toContain(`secret=${reply.json.secret}`)
  })

  describe('with local sign-in switched off', () => {
    let oidcOnly: RunningStack
    beforeAll(async () => {
      oidcOnly = await startSubject(OIDC_ONLY)
    })
    afterAll(async () => {
      await oidcOnly?.stop()
    })

    it('C25 2fa setup is 403 LOCAL_AUTH_DISABLED when local auth is off', async () => {
      const user = await registerUser(subject())
      const reply = await new Api(oidcOnly.url).post('/api/auth/2fa/setup', { token: user.token })
      expect(reply.status).toBe(403)
      expect(reply.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
    })

    it('C25 2fa enable is 403 LOCAL_AUTH_DISABLED when local auth is off', async () => {
      const user = await registerUser(subject())
      const reply = await new Api(oidcOnly.url).post('/api/auth/2fa/enable', {
        token: user.token,
        json: { code: '123456' },
      })
      expect(reply.status).toBe(403)
      expect(reply.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
    })

    it('C25 2fa disable stays allowed for cleanup when local auth is off', async () => {
      const user = await userWith2fa()
      const reply = await new Api(oidcOnly.url).post('/api/auth/2fa/disable', {
        token: user.token,
        json: { password: user.password, code: totpCode(user.secret) },
      })
      expect(reply.status).toBe(200)
      expect(reply.json).toEqual({ detail: '2FA disabled' })
    })
  })

  it('C25 2fa enable with a valid code is 200 2FA enabled', async () => {
    const user = await registerUser(subject())
    const setup = await subject().post('/api/auth/2fa/setup', { token: user.token })
    const reply = await subject().post('/api/auth/2fa/enable', {
      token: user.token,
      json: { code: totpCode(setup.json.secret) },
    })
    expect(reply.status).toBe(200)
    expect(reply.json).toEqual({ detail: '2FA enabled' })
    const me = await subject().get('/api/users/me', { token: user.token })
    expect(me.json.is_2fa_enabled).toBe(true)
  })

  it('C25 2fa enable with an invalid code is 400', async () => {
    const user = await registerUser(subject())
    await subject().post('/api/auth/2fa/setup', { token: user.token })
    const reply = await subject().post('/api/auth/2fa/enable', { token: user.token, json: { code: '000000' } })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid 2FA code' })
  })

  it('C25 a code from the previous or next 30 s window is accepted, two windows away is not', async () => {
    const user = await registerUser(subject())
    const setup = await subject().post('/api/auth/2fa/setup', { token: user.token })
    const secret = setup.json.secret as string
    const attempt = (offset: number) =>
      subject().post('/api/auth/2fa/enable', { token: user.token, json: { code: totpCode(secret, offset) } })
    expect((await attempt(-30)).status).toBe(200)
    expect((await attempt(30)).status).toBe(200)
    expect((await attempt(-90)).status).toBe(400)
    expect((await attempt(90)).status).toBe(400)
  })

  it('C25 login with 2fa on answers requires_2fa and a temp token', async () => {
    const user = await userWith2fa()
    const reply = await login(subject(), user.email, user.password)
    expect(reply.status).toBe(200)
    expect(reply.json.requires_2fa).toBe(true)
    expect(reply.json.temp_token).toBeTruthy()
  })

  it('C25 verify with the temp token and a valid code returns a bearer token', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(subject(), user)
    const reply = await subject().post('/api/auth/2fa/verify', {
      json: { temp_token: temp, code: totpCode(user.secret) },
    })
    expect(reply.status).toBe(200)
    expect(reply.json.token_type).toBe('bearer')
    expect(reply.json.access_token).toBeTruthy()
    trackSecret(reply.json.access_token)
  })

  it('C25 verify with an invalid code is 400', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(subject(), user)
    const reply = await subject().post('/api/auth/2fa/verify', { json: { temp_token: temp, code: '000000' } })
    expect(reply.status).toBe(400)
  })

  it('C25 verify with a token that never existed is 401 Invalid or expired token', async () => {
    const reply = await subject().post('/api/auth/2fa/verify', {
      json: { temp_token: 'nonexistent-token', code: '123456' },
    })
    expect(reply.status).toBe(401)
    expect(reply.json).toEqual({ detail: 'Invalid or expired token' })
  })

  it('C25 disable after a full 2fa login is 200 and the next login is plain', async () => {
    const user = await userWith2fa()
    const temp = await tempTokenFor(subject(), user)
    const verified = await subject().post('/api/auth/2fa/verify', {
      json: { temp_token: temp, code: totpCode(user.secret) },
    })
    trackSecret(verified.json.access_token)
    const disabled = await subject().post('/api/auth/2fa/disable', {
      token: verified.json.access_token,
      json: { password: user.password, code: totpCode(user.secret) },
    })
    expect(disabled.status).toBe(200)
    expect(disabled.json).toEqual({ detail: '2FA disabled' })
    const again = await login(subject(), user.email, user.password)
    expect(again.json.access_token).toBeTruthy()
    expect(again.json.requires_2fa).toBeUndefined()
  })

  it('C25 enable without calling setup first is 400 and names setup', async () => {
    const user = await registerUser(subject())
    const reply = await subject().post('/api/auth/2fa/enable', { token: user.token, json: { code: '123456' } })
    expect(reply.status).toBe(400)
    expect(String(reply.json.detail).toLowerCase()).toContain('setup')
  })

  it('C25 verify with a made-up token is 401', async () => {
    const reply = await subject().post('/api/auth/2fa/verify', { json: { temp_token: 'fake-token', code: '123456' } })
    expect(reply.status).toBe(401)
  })

  it('C25 verify accepts a legacy temp token that stores only the user id', async () => {
    const user = await userWith2fa()
    const legacy = `legacy-${uniqueEmail('t')}`
    trackSecret(legacy)
    await redis().set(`2fa_temp:${legacy}`, user.id, 'EX', 300)
    const reply = await subject().post('/api/auth/2fa/verify', {
      json: { temp_token: legacy, code: totpCode(user.secret) },
    })
    expect(reply.status).toBe(200)
    expect(reply.json.token_type).toBe('bearer')
    trackSecret(reply.json.access_token)
  })
})
