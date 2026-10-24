import { beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { type Api, bootstrapAdmin, registerUser, stackApi, subject } from './support/http'

// The Python stack reads the pinned tzdata package (see support/stacks.ts), so what is compared
// is the stack against the stack, never against the host's tzdata.
describe('timezone parity', () => {
  let admin: { token: string }
  let user: { token: string }
  let workspaceId: string
  let api: Api

  beforeAll(async () => {
    await resetData()
    api = subject()
    admin = await bootstrapAdmin(api)
    user = await registerUser(api)
    workspaceId = (await api.get('/api/workspaces', { token: user.token })).json[0].id
  })

  const patchWorkspace = (timezone: string) =>
    api.patch(`/api/workspaces/${workspaceId}`, { token: user.token, json: { timezone } })
  const patchSetting = (value: string) =>
    api.patch('/api/admin/settings/timezone', { token: admin.token, json: { value } })

  it('C44 PATCH /api/workspaces/{id} refuses a timezone with the wrong case', async () => {
    const reply = await patchWorkspace('America/sao_paulo')
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid IANA timezone' })
    expect((await patchWorkspace('america/sao_paulo')).status).toBe(400)
  })

  it('C44 PATCH /api/admin/settings/timezone refuses a timezone with the wrong case', async () => {
    const reply = await patchSetting('America/sao_paulo')
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid IANA timezone' })
    expect((await api.get('/api/admin/timezone', { token: admin.token })).json.saved).toBeNull()
  })

  it('C44 an alias the Python accepts (US/Pacific, GMT, Etc/GMT+3) is 200 in both endpoints', async () => {
    for (const name of ['US/Pacific', 'GMT', 'Etc/GMT+3']) {
      const workspace = await patchWorkspace(name)
      expect(workspace.status, `workspace ${name}`).toBe(200)
      expect(workspace.json.timezone).toBe(name)
      const setting = await patchSetting(name)
      expect(setting.status, `setting ${name}`).toBe(200)
      expect(setting.json).toEqual({ key: 'timezone', value: name })
    }
    await api.delete('/api/admin/settings/timezone', { token: admin.token })
  })

  it('C44 GET /api/timezones lists the same names in both stacks', async () => {
    const python = await stackApi('python').get('/api/timezones', { token: user.token })
    const node = await stackApi('node').get('/api/timezones', { token: user.token })
    expect(python.status).toBe(200)
    expect(node.status).toBe(200)
    expect(python.json.available.length).toBeGreaterThan(500)
    expect(python.json.available).toContain('US/Pacific')
    expect(node.json.available).toEqual(python.json.available)
  })
})
