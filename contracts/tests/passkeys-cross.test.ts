import { beforeAll, describe, expect, it } from 'vitest'
import { VirtualAuthenticator } from './support/authenticator'
import { passkeyRows, resetData } from './support/db'
import { ORIGIN, enableTotp, loginForTempToken, passkeySignIn, registerPasskey } from './support/flows'
import { type Api, registerUser, stackApi } from './support/http'
import { redis } from './support/redis'
import { trackSecret } from './support/secrets'

async function registeredOn(registrar: Api, signer: Api) {
  const user = await registerUser(registrar)
  const authenticator = new VirtualAuthenticator()
  const created = await registerPasskey(registrar, user.token, authenticator)
  expect(created.status).toBe(200)
  const signedIn = await passkeySignIn(signer, authenticator, { email: user.email })
  return { user, signedIn }
}

async function challengeOf(prefix: string, id: string) {
  const key = `${prefix}:${id}`
  const raw = await redis().get(key)
  expect(raw, key).not.toBeNull()
  return { json: JSON.parse(raw as string), ttl: await redis().ttl(key) }
}

describe('passkeys across stacks', () => {
  beforeAll(resetData)

  it('C21 passkey registered on python authenticates on node', async () => {
    const { user, signedIn } = await registeredOn(stackApi('python'), stackApi('node'))
    expect(signedIn.status).toBe(200)
    expect(signedIn.json.token_type).toBe('bearer')
    const me = await stackApi('node').get('/api/users/me', { token: signedIn.json.access_token })
    expect(me.json.email).toBe(user.email)
    const [row] = await passkeyRows(user.id)
    expect(row.sign_count).toBe(1)
  })

  it('C21 passkey registered on node authenticates on python', async () => {
    const { user, signedIn } = await registeredOn(stackApi('node'), stackApi('python'))
    expect(signedIn.status).toBe(200)
    expect(signedIn.json.token_type).toBe('bearer')
    const me = await stackApi('python').get('/api/users/me', { token: signedIn.json.access_token })
    expect(me.json.email).toBe(user.email)
    const [row] = await passkeyRows(user.id)
    expect(row.sign_count).toBe(1)
  })

  it('C21 challenges are stored as passkey_register|passkey_authenticate|passkey_2fa:<id> with the same JSON keys on both stacks', async () => {
    const user = await registerUser(stackApi('python'))
    const secret = await enableTotp(stackApi('python'), user.token)
    expect(secret).toBeTruthy()
    const authenticator = new VirtualAuthenticator()
    expect((await registerPasskey(stackApi('python'), user.token, authenticator)).status).toBe(200)

    const shapes: Record<string, string[]>[] = []
    for (const name of ['python', 'node'] as const) {
      const api = stackApi(name)
      const register = await api.post('/api/auth/passkeys/register/options', {
        token: user.token,
        headers: { origin: ORIGIN },
        json: { name: 'Second key' },
      })
      const authenticate = await api.post('/api/auth/passkeys/authenticate/options', {
        headers: { origin: ORIGIN },
        json: { email: user.email },
      })
      const temp = trackSecret((await loginForTempToken(api, user.email, user.password)).json.temp_token)
      const second = await api.post('/api/auth/passkeys/2fa/options', {
        headers: { origin: ORIGIN },
        json: { temp_token: temp },
      })
      expect([register.status, authenticate.status, second.status]).toEqual([200, 200, 200])

      const registerChallenge = await challengeOf('passkey_register', register.json.challenge_id)
      const authenticateChallenge = await challengeOf('passkey_authenticate', authenticate.json.challenge_id)
      const secondChallenge = await challengeOf('passkey_2fa', second.json.challenge_id)
      for (const { ttl } of [registerChallenge, authenticateChallenge, secondChallenge]) {
        expect(ttl).toBeGreaterThan(290)
        expect(ttl).toBeLessThanOrEqual(300)
      }
      expect(registerChallenge.json).toEqual({
        challenge: register.json.options.challenge,
        user_id: user.id,
        name: 'Second key',
        rp_id: 'launchkit.test',
        origin: ORIGIN,
      })
      expect(authenticateChallenge.json).toEqual({
        challenge: authenticate.json.options.challenge,
        email_bound: true,
        expected_user_id: user.id,
        rp_id: 'launchkit.test',
        origin: ORIGIN,
      })
      expect(secondChallenge.json).toEqual({
        challenge: second.json.options.challenge,
        user_id: user.id,
        rp_id: 'launchkit.test',
        origin: ORIGIN,
      })
      shapes.push({
        register: Object.keys(registerChallenge.json).sort(),
        authenticate: Object.keys(authenticateChallenge.json).sort(),
        second: Object.keys(secondChallenge.json).sort(),
      })
    }
    expect(shapes[0]).toEqual(shapes[1])
  })
})
