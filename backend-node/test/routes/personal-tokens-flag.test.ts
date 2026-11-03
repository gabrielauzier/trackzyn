import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { generateToken } from '../../src/services/access-tokens.ts'
import { type TestApp, bearer, createTestApp, register } from '../support/test-app.ts'

describe('PERSONAL_TOKENS_ENABLED', () => {
  describe('off', () => {
    let t: TestApp
    beforeAll(async () => {
      t = await createTestApp({ PERSONAL_TOKENS_ENABLED: 'false' })
    })
    afterAll(async () => {
      await t.close()
    })

    it('TOKEN-13 /api/tokens answers 404 to a valid session', async () => {
      const user = await register(t)
      const reply = await t.app.inject({ method: 'GET', url: '/api/tokens', headers: bearer(user.token) })
      expect(reply.statusCode).toBe(404)
    })

    it('TOKEN-13 the hook is gone: a tkz_ value is just an invalid JWT, and public routes ignore it', async () => {
      const value = generateToken().plaintext
      const guarded = await t.app.inject({ method: 'GET', url: '/api/users/me', headers: bearer(value) })
      expect(guarded.statusCode).toBe(401)
      expect(guarded.headers['www-authenticate']).toBeUndefined()
      expect((await t.app.inject({ method: 'GET', url: '/api/health', headers: bearer(value) })).statusCode).toBe(200)
    })

    it('TOKEN-13 /api/info reports it off', async () => {
      const reply = await t.app.inject({ method: 'GET', url: '/api/info' })
      expect(reply.json().features.personal_tokens).toBe(false)
    })
  })

  describe('by default', () => {
    let t: TestApp
    beforeAll(async () => {
      t = await createTestApp()
    })
    afterAll(async () => {
      await t.close()
    })

    it('TOKEN-13 /api/info reports it on and the routes exist', async () => {
      const reply = await t.app.inject({ method: 'GET', url: '/api/info' })
      expect(reply.json().features.personal_tokens).toBe(true)
      const user = await register(t)
      expect((await t.app.inject({ method: 'GET', url: '/api/tokens', headers: bearer(user.token) })).statusCode).toBe(200)
    })
  })
})
