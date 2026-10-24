import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { VirtualAuthenticator } from './support/authenticator'
import { passkeyRows, resetData, seedPasskey } from './support/db'
import { ORIGIN, enableTotp, loginForTempToken, passkeySecondFactor, passkeySignIn } from './support/flows'
import { Api, login, registerUser, subject } from './support/http'
import { redis } from './support/redis'
import { trackSecret } from './support/secrets'
import { type RunningStack, startSubject } from './support/stacks'

const OIDC_ONLY = {
  LOCAL_AUTH_ENABLED: 'false',
  OIDC_ENABLED: 'true',
  OIDC_CLIENT_ID: 'launchkit',
  OIDC_DISCOVERY_URL: 'http://127.0.0.1:1/.well-known/openid-configuration',
}

async function userWith2fa() {
  const user = await registerUser(subject())
  const secret = await enableTotp(subject(), user.token)
  return { ...user, secret }
}

async function userWithSeededPasskey(
  user: { id: string },
  options: { signCount?: number; backedUp?: boolean | null; name?: string } = {},
) {
  const authenticator = new VirtualAuthenticator({ backedUp: options.backedUp === true })
  await seedPasskey({
    userId: user.id,
    credentialId: authenticator.id,
    publicKey: authenticator.publicKey,
    signCount: options.signCount ?? 0,
    backedUp: options.backedUp ?? false,
    name: options.name,
  })
  return authenticator
}

// One case for each case of backend/tests/test_passkeys.py that is not about the relying
// party (those are in webauthn-origin.test.ts); see parity-map.json.
describe('passkeys', () => {
  beforeAll(resetData)

  it('C25 passkey registration options require authentication', async () => {
    const reply = await subject().post('/api/auth/passkeys/register/options', {
      headers: { origin: ORIGIN },
      json: { name: 'YubiKey' },
    })
    expect(reply.status).toBe(401)
  })

  it('C25 a passkey can be registered and listed', async () => {
    const user = await registerUser(subject())
    const authenticator = new VirtualAuthenticator()
    const begin = await subject().post('/api/auth/passkeys/register/options', {
      token: user.token,
      headers: { origin: ORIGIN },
      json: { name: 'YubiKey' },
    })
    expect(begin.status).toBe(200)
    expect(begin.json.challenge_id).toBeTruthy()
    expect(begin.json.options.rp.name).toEqual(expect.any(String))
    expect(begin.json.options.user.name).toBe(user.email)

    const credential = authenticator.createCredential(begin.json.options, ORIGIN, { transports: ['usb', 'nfc'] })
    const verify = await subject().post('/api/auth/passkeys/register/verify', {
      token: user.token,
      headers: { origin: ORIGIN },
      json: { challenge_id: begin.json.challenge_id, name: 'YubiKey', credential },
    })
    expect(verify.status).toBe(200)
    expect(Object.keys(verify.json).sort()).toEqual([
      'aaguid',
      'backed_up',
      'created_at',
      'device_type',
      'id',
      'last_used_at',
      'name',
      'transports',
    ])
    expect(verify.json.name).toBe('YubiKey')
    expect(verify.json.transports).toEqual(['usb', 'nfc'])
    expect(verify.json.last_used_at).toBeNull()

    const listed = await subject().get('/api/auth/passkeys', { token: user.token })
    expect(listed.status).toBe(200)
    expect(listed.json.map((item: { name: string }) => item.name)).toEqual(['YubiKey'])

    const [row] = await passkeyRows(user.id)
    expect(row.credential_id).toBe(authenticator.id)
    expect(row.public_key).toBe(authenticator.publicKey)
    expect(row.sign_count).toBe(0)
    expect(row.transports).toEqual(['usb', 'nfc'])
  })

  it('C25 authenticating with a passkey returns a token and bypasses 2fa', async () => {
    const user = await userWith2fa()
    const authenticator = await userWithSeededPasskey(user, { signCount: 3, name: 'Platform passkey' })

    const begin = await subject().post('/api/auth/passkeys/authenticate/options', {
      headers: { origin: ORIGIN },
      json: { email: user.email.toUpperCase() },
    })
    expect(begin.status).toBe(200)
    expect(begin.json.options.allowCredentials.map((c: { id: string }) => c.id)).toEqual([authenticator.id])

    const assertion = authenticator.getAssertion(begin.json.options, ORIGIN, { counter: 8 })
    const verify = await subject().post('/api/auth/passkeys/authenticate/verify', {
      headers: { origin: ORIGIN },
      json: { challenge_id: begin.json.challenge_id, credential: assertion },
    })
    expect(verify.status).toBe(200)
    expect(Object.keys(verify.json).sort()).toEqual(['access_token', 'token_type'])
    expect(verify.json.token_type).toBe('bearer')
    trackSecret(verify.json.access_token)

    const [row] = await passkeyRows(user.id)
    expect(row.sign_count).toBe(8)
    expect(row.last_used_at).toBeInstanceOf(Date)
  })

  it('C25 a backed-up passkey skips the sign count check', async () => {
    const user = await registerUser(subject())
    const authenticator = await userWithSeededPasskey(user, { signCount: 42, backedUp: true, name: '1Password passkey' })
    const reply = await passkeySignIn(subject(), authenticator, { counter: 1 })
    expect(reply.status).toBe(200)
  })

  it('C25 a device-bound passkey enforces the sign count', async () => {
    const user = await registerUser(subject())
    const authenticator = await userWithSeededPasskey(user, { signCount: 42, backedUp: false, name: 'Security key' })
    const stale = await passkeySignIn(subject(), authenticator, { counter: 1 })
    expect(stale.status).toBe(401)
    expect(stale.json).toEqual({ detail: 'Invalid passkey' })
    const fresh = await passkeySignIn(subject(), authenticator, { counter: 43 })
    expect(fresh.status).toBe(200)
  })

  it('C25 password login with a passkey but no 2fa returns a token', async () => {
    const user = await registerUser(subject())
    await userWithSeededPasskey(user, { signCount: 1 })
    const reply = await login(subject(), user.email, user.password)
    expect(reply.status).toBe(200)
    expect(reply.json.access_token).toBeTruthy()
    expect(reply.json.token_type).toBe('bearer')
    expect(reply.json.requires_2fa).toBeUndefined()
  })

  it('C25 password login with 2fa and a passkey offers both methods', async () => {
    const user = await userWith2fa()
    await userWithSeededPasskey(user, { signCount: 1 })
    const reply = await login(subject(), user.email, user.password)
    expect(reply.status).toBe(200)
    expect(reply.json.requires_2fa).toBe(true)
    expect(reply.json.temp_token).toBeTruthy()
    expect(reply.json.available_methods).toEqual(['totp', 'passkey'])
    expect(reply.json.access_token).toBeUndefined()
  })

  it("C25 the passkey second factor returns a token for the same user's passkey", async () => {
    const user = await userWith2fa()
    const authenticator = await userWithSeededPasskey(user, { signCount: 2, name: 'Security key' })
    const temp = trackSecret((await loginForTempToken(subject(), user.email, user.password)).json.temp_token)

    const { options, verify } = await passkeySecondFactor(subject(), temp, authenticator, { counter: 9 })
    expect(options.status).toBe(200)
    expect(options.json.options.allowCredentials[0].id).toBe(authenticator.id)
    expect(verify?.status).toBe(200)
    expect(verify?.json.token_type).toBe('bearer')

    const [row] = await passkeyRows(user.id)
    expect(row.sign_count).toBe(9)
    expect(row.last_used_at).toBeInstanceOf(Date)
    expect(await redis().exists(`2fa_temp:${temp}`)).toBe(0)
  })

  it("C25 the passkey second factor rejects another user's passkey", async () => {
    const owner = await userWith2fa()
    await userWithSeededPasskey(owner, { name: 'Own key' })
    const other = await registerUser(subject())
    const otherKey = await userWithSeededPasskey(other, { name: 'Other key' })
    const temp = trackSecret((await loginForTempToken(subject(), owner.email, owner.password)).json.temp_token)

    const { options, verify } = await passkeySecondFactor(subject(), temp, otherKey)
    expect(options.status).toBe(200)
    expect(verify?.status).toBe(401)
    expect(await redis().exists(`2fa_temp:${temp}`)).toBe(1)
  })

  it("C25 an email-bound challenge rejects another user's passkey", async () => {
    const expected = await userWith2fa()
    await userWithSeededPasskey(expected, { name: 'Expected key' })
    const other = await registerUser(subject())
    const otherKey = await userWithSeededPasskey(other, { name: 'Other key' })

    const reply = await passkeySignIn(subject(), otherKey, { email: expected.email })
    expect(reply.status).toBe(401)
  })

  it('C25 an email-bound challenge for an unknown email rejects every passkey', async () => {
    const user = await registerUser(subject())
    const authenticator = await userWithSeededPasskey(user, { name: 'Owner key' })
    const reply = await passkeySignIn(subject(), authenticator, { email: 'missing@example.com' })
    expect(reply.status).toBe(401)
  })

  it('C25 deleting a passkey is scoped to its owner', async () => {
    const owner = await registerUser(subject())
    const stranger = await registerUser(subject())
    await userWithSeededPasskey(owner, { name: 'Own key' })
    await userWithSeededPasskey(stranger, { name: 'Other key' })
    const [own] = await passkeyRows(owner.id)
    const [theirs] = await passkeyRows(stranger.id)

    const forbidden = await subject().delete(`/api/auth/passkeys/${theirs.id}`, { token: owner.token })
    expect(forbidden.status).toBe(404)
    expect(forbidden.json).toEqual({ detail: 'Passkey not found' })

    const deleted = await subject().delete(`/api/auth/passkeys/${own.id}`, { token: owner.token })
    expect(deleted.status).toBe(204)
    expect(deleted.text).toBe('')
    expect(await passkeyRows(owner.id)).toEqual([])
    expect(await passkeyRows(stranger.id)).toHaveLength(1)
  })

  it('C25 a failed registration verify consumes the challenge', async () => {
    const user = await registerUser(subject())
    const begin = await subject().post('/api/auth/passkeys/register/options', {
      token: user.token,
      headers: { origin: ORIGIN },
      json: { name: 'Key' },
    })
    const key = `passkey_register:${begin.json.challenge_id}`
    expect(await redis().exists(key)).toBe(1)

    const credential = {
      id: 'bad',
      rawId: 'YmFk',
      response: { attestationObject: 'bad', clientDataJSON: 'bad' },
      type: 'public-key',
      clientExtensionResults: {},
    }
    const failed = await subject().post('/api/auth/passkeys/register/verify', {
      token: user.token,
      headers: { origin: ORIGIN },
      json: { challenge_id: begin.json.challenge_id, name: 'Key', credential },
    })
    expect(failed.status).toBe(400)
    expect(failed.json).toEqual({ detail: 'Invalid passkey registration' })
    expect(await redis().exists(key)).toBe(0)

    const retried = await subject().post('/api/auth/passkeys/register/verify', {
      token: user.token,
      headers: { origin: ORIGIN },
      json: { challenge_id: begin.json.challenge_id, name: 'Key', credential },
    })
    expect(retried.status).toBe(400)
    expect(retried.json).toEqual({ detail: 'Invalid or expired challenge' })
  })

  describe('with local sign-in switched off', () => {
    let oidcOnly: RunningStack
    beforeAll(async () => {
      oidcOnly = await startSubject(OIDC_ONLY)
    })
    afterAll(async () => {
      await oidcOnly?.stop()
    })

    it('C25 passkey registration is 403 LOCAL_AUTH_DISABLED when local auth is off', async () => {
      const user = await registerUser(subject())
      const api = new Api(oidcOnly.url)
      const options = await api.post('/api/auth/passkeys/register/options', {
        token: user.token,
        headers: { origin: ORIGIN },
        json: { name: 'Key' },
      })
      expect(options.status).toBe(403)
      expect(options.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
      const verify = await api.post('/api/auth/passkeys/register/verify', {
        token: user.token,
        json: { challenge_id: 'missing', name: 'Key', credential: {} },
      })
      expect(verify.status).toBe(403)
      expect(verify.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
    })

    it('C25 deleting a passkey stays allowed when local auth is off', async () => {
      const user = await registerUser(subject())
      await userWithSeededPasskey(user, { name: 'Cleanup key' })
      const [row] = await passkeyRows(user.id)
      const reply = await new Api(oidcOnly.url).delete(`/api/auth/passkeys/${row.id}`, { token: user.token })
      expect(reply.status).toBe(204)
      expect(await passkeyRows(user.id)).toEqual([])
    })

    it('C25 passkey login is 403 LOCAL_AUTH_DISABLED when local auth is off', async () => {
      const api = new Api(oidcOnly.url)
      const options = await api.post('/api/auth/passkeys/authenticate/options', {
        json: { email: 'test@example.com' },
      })
      expect(options.status).toBe(403)
      expect(options.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
      const verify = await api.post('/api/auth/passkeys/authenticate/verify', {
        json: { challenge_id: 'missing', credential: {} },
      })
      expect(verify.status).toBe(403)
      expect(verify.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
    })

    it('C25 the passkey second factor is 403 LOCAL_AUTH_DISABLED when local auth is off', async () => {
      const api = new Api(oidcOnly.url)
      const options = await api.post('/api/auth/passkeys/2fa/options', { json: { temp_token: 'missing' } })
      expect(options.status).toBe(403)
      expect(options.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
      const verify = await api.post('/api/auth/passkeys/2fa/verify', {
        json: { temp_token: 'missing', challenge_id: 'missing', credential: {} },
      })
      expect(verify.status).toBe(403)
      expect(verify.json).toEqual({ detail: 'LOCAL_AUTH_DISABLED' })
    })
  })
})
