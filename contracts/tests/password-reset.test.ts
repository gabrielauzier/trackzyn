import { beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { registerUser, subject } from './support/http'
import { appKeys } from './support/redis'

describe('password reset', () => {
  beforeAll(resetData)

  it('C15 forgot-password is 202 and writes nothing to Redis', async () => {
    const api = subject()
    const user = await registerUser(api)
    const before = await appKeys()

    const reply = await api.post('/api/auth/forgot-password', { json: { email: user.email } })
    expect(reply.status).toBe(202)
    expect(reply.text === '' || reply.text === 'null').toBe(true)

    expect(await appKeys()).toEqual(before)
  })

  it('C15 reset-password with a bad token is 400 RESET_PASSWORD_BAD_TOKEN', async () => {
    const reply = await subject().post('/api/auth/reset-password', {
      json: { token: 'not-a-real-token', password: 'a-brand-new-password-1' },
    })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'RESET_PASSWORD_BAD_TOKEN' })
  })
})
