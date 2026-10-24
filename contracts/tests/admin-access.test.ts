import { beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { type Api, type Reply, bootstrapAdmin, registerUser, subject } from './support/http'

const SOME_ID = '00000000-0000-4000-8000-000000000001'

const SUPERUSER_OPERATIONS: Array<{ name: string; call: (api: Api, token?: string) => Promise<Reply> }> = [
  { name: 'GET /api/admin/users', call: (a, token) => a.get('/api/admin/users', { token }) },
  {
    name: 'POST /api/admin/users',
    call: (a, token) =>
      a.post('/api/admin/users', { token, json: { email: 'nobody-access@example.com', password: 'contract-pass-123' } }),
  },
  { name: 'GET /api/admin/users/{id}', call: (a, token) => a.get(`/api/admin/users/${SOME_ID}`, { token }) },
  { name: 'PATCH /api/admin/users/{id}', call: (a, token) => a.patch(`/api/admin/users/${SOME_ID}`, { token, json: {} }) },
  { name: 'DELETE /api/admin/users/{id}', call: (a, token) => a.delete(`/api/admin/users/${SOME_ID}`, { token }) },
  { name: 'GET /api/admin/settings/{key}', call: (a, token) => a.get('/api/admin/settings/number_format', { token }) },
  {
    name: 'PATCH /api/admin/settings/{key}',
    call: (a, token) => a.patch('/api/admin/settings/number_format', { token, json: { value: 'auto' } }),
  },
  { name: 'DELETE /api/admin/settings/{key}', call: (a, token) => a.delete('/api/admin/settings/number_format', { token }) },
  { name: 'GET /api/admin/timezone', call: (a, token) => a.get('/api/admin/timezone', { token }) },
]

describe('admin access', () => {
  let user: { token: string }

  beforeAll(async () => {
    await resetData()
    await bootstrapAdmin(subject())
    user = await registerUser(subject())
  })

  it('C31 non-superuser is 403 and anonymous is 401 on the 9 superuser operations', async () => {
    expect(SUPERUSER_OPERATIONS).toHaveLength(9)
    for (const operation of SUPERUSER_OPERATIONS) {
      const forbidden = await operation.call(subject(), user.token)
      expect(forbidden.status, `${operation.name} as a regular user`).toBe(403)
      const anonymous = await operation.call(subject())
      expect(anonymous.status, `${operation.name} without a token`).toBe(401)
    }
  })

  it('C31 registration-status and default-colors are public', async () => {
    const status = await subject().get('/api/admin/registration-status')
    expect(status.status).toBe(200)
    expect(status.json).toEqual({ enabled: true })
    const colors = await subject().get('/api/admin/default-colors')
    expect(colors.status).toBe(200)
    expect(colors.json).toEqual({ light: null, dark: null })
  })

  it('C31 number-format and date-format need an active user (401 without a token, 200 with one)', async () => {
    for (const path of ['/api/admin/number-format', '/api/admin/date-format']) {
      expect((await subject().get(path)).status, `${path} without a token`).toBe(401)
      const reply = await subject().get(path, { token: user.token })
      expect(reply.status, `${path} as a regular user`).toBe(200)
      expect(reply.json).toEqual({ format: 'auto' })
    }
  })
})
