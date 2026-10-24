import { beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { ADMIN_PASSWORD, subject, uniqueEmail } from './support/http'
import { trackSecret } from './support/secrets'

describe('first-run setup', () => {
  beforeAll(resetData)

  it('C5 setup status, create-admin and the second create-admin', async () => {
    const api = subject()

    const before = await api.get('/api/setup/status')
    expect(before.status).toBe(200)
    expect(before.json).toEqual({ has_users: false })

    trackSecret(ADMIN_PASSWORD)
    const created = await api.post('/api/setup/create-admin', {
      json: { email: uniqueEmail('admin'), password: ADMIN_PASSWORD },
    })
    expect(created.status).toBe(200)
    expect(Object.keys(created.json).sort()).toEqual(['access_token', 'token_type'])
    expect(created.json.token_type).toBe('bearer')
    expect(created.json.access_token).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/)
    trackSecret(created.json.access_token)

    const after = await api.get('/api/setup/status')
    expect(after.json).toEqual({ has_users: true })

    const again = await api.post('/api/setup/create-admin', {
      json: { email: uniqueEmail('admin'), password: ADMIN_PASSWORD },
    })
    expect(again.status).toBe(403)
    expect(again.json).toEqual({ detail: 'Setup already completed' })
  })
})
