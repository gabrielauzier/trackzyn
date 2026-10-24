import { describe, expect, it } from 'vitest'
import { hashOf, seedUser } from './support/db'
import { PASSWORD, login, registerUser, subject, uniqueEmail } from './support/http'

describe('login', () => {
  it('C6 valid login returns a bearer token', async () => {
    const api = subject()
    const user = await registerUser(api)

    const reply = await login(api, user.email, user.password)
    expect(reply.status).toBe(200)
    expect(Object.keys(reply.json).sort()).toEqual(['access_token', 'token_type'])
    expect(reply.json.token_type).toBe('bearer')

    const me = await api.get('/api/users/me', { token: reply.json.access_token })
    expect(me.status).toBe(200)
    expect(me.json.email).toBe(user.email)
  })

  it('C6 wrong password returns 400 LOGIN_BAD_CREDENTIALS', async () => {
    const api = subject()
    const user = await registerUser(api)

    const reply = await login(api, user.email, 'not-the-password')
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'LOGIN_BAD_CREDENTIALS' })
  })

  it('C10 a bcrypt hash is replaced by an argon2 hash after a successful login', async () => {
    const api = subject()
    const email = uniqueEmail('legacy')
    await seedUser({ email, password: PASSWORD })
    expect(await hashOf(email)).toMatch(/^\$2[aby]\$/)

    const reply = await login(api, email, PASSWORD)
    expect(reply.status).toBe(200)
    expect(await hashOf(email)).toMatch(/^\$argon2/)

    // The upgraded hash keeps working.
    const again = await login(api, email, PASSWORD)
    expect(again.status).toBe(200)
  })
})
