import { beforeAll, describe, expect, it } from 'vitest'
import { resetData, setAppSetting } from './support/db'
import { PASSWORD, login, subject, uniqueEmail } from './support/http'

describe('registration', () => {
  beforeAll(resetData)

  it('C14 registration disabled is 403', async () => {
    await setAppSetting('registration_enabled', 'false')
    try {
      const reply = await subject().post('/api/auth/register', {
        json: { email: uniqueEmail(), password: PASSWORD },
      })
      expect(reply.status).toBe(403)
      expect(reply.json).toEqual({ detail: 'Registration is currently disabled' })
    } finally {
      await setAppSetting('registration_enabled', null)
    }
  })

  it('C14 registration enabled is 201 and lists one personal workspace', async () => {
    const api = subject()
    const email = uniqueEmail()
    const created = await api.post('/api/auth/register', { json: { email, password: PASSWORD } })
    expect(created.status).toBe(201)
    expect(created.json).toMatchObject({
      email,
      is_active: true,
      is_superuser: false,
      is_verified: false,
      is_2fa_enabled: false,
    })

    const session = await login(api, email, PASSWORD)
    const workspaces = await api.get('/api/workspaces', { token: session.json.access_token })
    expect(workspaces.status).toBe(200)
    expect(workspaces.json).toHaveLength(1)
    expect(workspaces.json[0]).toMatchObject({ name: 'Personal', role: 'owner', is_archived: false })
  })
})
