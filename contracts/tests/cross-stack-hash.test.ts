import { beforeAll, describe, expect, it } from 'vitest'
import { hashOf, resetData, seedUser } from './support/db'
import { PASSWORD, login, peer, registerUser, subject, uniqueEmail } from './support/http'

describe('password hashes across stacks', () => {
  beforeAll(resetData)

  async function expectLogin(api: ReturnType<typeof subject>, email: string) {
    const reply = await login(api, email, PASSWORD)
    expect(reply.status).toBe(200)
    expect(reply.json.token_type).toBe('bearer')
    const me = await api.get('/api/users/me', { token: reply.json.access_token })
    expect(me.status).toBe(200)
    expect(me.json.email).toBe(email)
  }

  it('C9 argon2 user created on the peer logs in on the subject', async () => {
    const user = await registerUser(peer())
    expect(await hashOf(user.email)).toMatch(/^\$argon2/)
    await expectLogin(subject(), user.email)
  })

  it('C9 argon2 user created on the subject logs in on the peer', async () => {
    const user = await registerUser(subject())
    expect(await hashOf(user.email)).toMatch(/^\$argon2/)
    await expectLogin(peer(), user.email)
  })

  it('C9 bcrypt user logs in on the subject', async () => {
    const email = uniqueEmail('bcrypt')
    await seedUser({ email, password: PASSWORD })
    await expectLogin(subject(), email)
  })

  it('C9 bcrypt user logs in on the peer', async () => {
    const email = uniqueEmail('bcrypt')
    await seedUser({ email, password: PASSWORD })
    await expectLogin(peer(), email)
  })
})
