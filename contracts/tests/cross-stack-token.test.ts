import { SignJWT, decodeJwt, decodeProtectedHeader } from 'jose'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { SECRET_KEY } from './support/config'
import { resetData } from './support/db'
import { Api, login, peer, registerUser, subject } from './support/http'
import { type RunningStack, startSubject } from './support/stacks'

describe('access tokens across stacks', () => {
  beforeAll(resetData)

  it('C11 token from the peer is accepted by the subject', async () => {
    const user = await registerUser(peer())
    const me = await subject().get('/api/users/me', { token: user.token })
    expect(me.status).toBe(200)
    expect(me.json.email).toBe(user.email)
  })

  it('C11 token from the subject is accepted by the peer', async () => {
    const user = await registerUser(subject())
    const me = await peer().get('/api/users/me', { token: user.token })
    expect(me.status).toBe(200)
    expect(me.json.email).toBe(user.email)
  })

  it('C11 token claims are sub=<uuid>, aud=["fastapi-users:auth"], alg HS256', async () => {
    const user = await registerUser(subject())
    const header = decodeProtectedHeader(user.token)
    const claims = decodeJwt(user.token)
    expect(header.alg).toBe('HS256')
    expect(claims.sub).toBe(user.id)
    expect(claims.aud).toEqual(['fastapi-users:auth'])
    const lifetime = (claims.exp as number) - Math.floor(Date.now() / 1000)
    expect(lifetime).toBeGreaterThan(24 * 3600 - 30)
    expect(lifetime).toBeLessThanOrEqual(24 * 3600 + 5)
  })

  describe('expiry', () => {
    let shortLived: RunningStack
    beforeAll(async () => {
      shortLived = await startSubject({ ACCESS_TOKEN_EXPIRE_MINUTES: '-1' })
    })
    afterAll(async () => {
      await shortLived?.stop()
    })

    it('C11 token issued with ACCESS_TOKEN_EXPIRE_MINUTES=-1 is rejected with 401', async () => {
      const user = await registerUser(subject())
      const api = new Api(shortLived.url)
      const session = await login(api, user.email, user.password)
      expect(session.status).toBe(200)
      const me = await api.get('/api/users/me', { token: session.json.access_token })
      expect(me.status).toBe(401)
    })

    it('C11 a token whose exp is in the past is rejected by the subject with 401', async () => {
      const user = await registerUser(subject())
      const forged = await new SignJWT({ aud: ['fastapi-users:auth'] })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(user.id)
        .setExpirationTime(Math.floor(Date.now() / 1000) - 120)
        .sign(new TextEncoder().encode(SECRET_KEY))
      const me = await subject().get('/api/users/me', { token: forged })
      expect(me.status).toBe(401)
    })
  })
})
