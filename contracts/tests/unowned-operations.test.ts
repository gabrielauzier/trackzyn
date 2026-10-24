import { beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { uploadFile } from './support/flows'
import { type Api, bootstrapAdmin, registerUser, subject } from './support/http'

const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000cc'

// The operations no other criterion owns: one case each, status and body.
describe('operations without a criterion of their own', () => {
  let api: Api
  let admin: { token: string }
  let user: Awaited<ReturnType<typeof registerUser>>
  let workspaceId: string
  let workspaceHeaders: Record<string, string>

  beforeAll(async () => {
    await resetData()
    api = subject()
    admin = await bootstrapAdmin(api)
    user = await registerUser(api)
    workspaceId = (await api.get('/api/workspaces', { token: user.token })).json[0].id
    workspaceHeaders = { 'x-workspace-id': workspaceId }
  })

  it('C43 POST /api/auth/logout', async () => {
    const reply = await api.post('/api/auth/logout', { token: user.token })
    expect(reply.status).toBe(200)
    expect(reply.json).toEqual({ detail: 'Logged out' })
  })

  it('C43 GET /api/info', async () => {
    const reply = await api.get('/api/info')
    expect(reply.status).toBe(200)
    expect(reply.json).toEqual({ app_name: expect.any(String), features: {}, update_check_repo: null })
  })

  it('C43 GET /api/timezones', async () => {
    expect((await api.get('/api/timezones')).status).toBe(401)
    const reply = await api.get('/api/timezones', { token: user.token })
    expect(reply.status).toBe(200)
    expect(Object.keys(reply.json).sort()).toEqual(['available', 'default'])
    expect(reply.json.available).toContain('UTC')
    expect(reply.json.available).toContain('Europe/London')
    expect(reply.json.available).toContain(reply.json.default)
    expect(reply.json.available).toEqual([...reply.json.available].sort())
  })

  it('C43 GET /api/settings/files', async () => {
    const reply = await api.get('/api/settings/files')
    expect(reply.status).toBe(200)
    expect(reply.json).toEqual({
      allowed_extensions: ['gif', 'heic', 'jpeg', 'jpg', 'pdf', 'png', 'webp'],
      max_file_size_mb: 10,
    })
  })

  it('C43 GET /api/auth/oidc/config', async () => {
    const reply = await api.get('/api/auth/oidc/config')
    expect(reply.status).toBe(200)
    expect(reply.json).toEqual({ enabled: false, provider_name: 'OIDC', local_auth_enabled: true })
  })

  it('C43 GET /api/users/{id}', async () => {
    const found = await api.get(`/api/users/${user.id}`, { token: admin.token })
    expect(found.status).toBe(200)
    expect(found.json).toEqual({
      id: user.id,
      email: user.email,
      is_active: true,
      is_superuser: false,
      is_verified: false,
      preferences: { language: 'en', date_format: 'MM/DD/YYYY' },
      is_2fa_enabled: false,
    })
    const missing = await api.get(`/api/users/${UNKNOWN_ID}`, { token: admin.token })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'Not Found' })
  })

  it('C43 DELETE /api/users/{id}', async () => {
    const doomed = await registerUser(api)
    const removed = await api.delete(`/api/users/${doomed.id}`, { token: admin.token })
    expect(removed.status).toBe(204)
    expect(removed.text).toBe('')
    const gone = await api.get(`/api/users/${doomed.id}`, { token: admin.token })
    expect(gone.status).toBe(404)
    const missing = await api.delete(`/api/users/${UNKNOWN_ID}`, { token: admin.token })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'Not Found' })
  })

  it('C43 GET /api/files', async () => {
    const empty = await api.get('/api/files', { token: user.token, headers: workspaceHeaders })
    expect(empty.status).toBe(200)
    expect(empty.json).toEqual([])
    const first = await uploadFile(api, user.token, workspaceId, { name: 'first.pdf' })
    const second = await uploadFile(api, user.token, workspaceId, { name: 'second.pdf' })
    const listed = await api.get('/api/files', { token: user.token, headers: workspaceHeaders })
    expect(listed.status).toBe(200)
    expect(listed.json.map((file: { id: string }) => file.id).sort()).toEqual([first.json.id, second.json.id].sort())
    expect(Object.keys(listed.json[0]).sort()).toEqual([
      'content_type',
      'created_at',
      'filename',
      'id',
      'size',
      'uploaded_by_user_id',
      'workspace_id',
    ])
    expect((await api.get('/api/files')).status).toBe(401)
  })

  it('C43 PATCH /api/files/{id}', async () => {
    const uploaded = await uploadFile(api, user.token, workspaceId, { name: 'before.pdf' })
    const renamed = await api.patch(`/api/files/${uploaded.json.id}`, {
      token: user.token,
      headers: workspaceHeaders,
      json: { filename: 'after.pdf' },
    })
    expect(renamed.status).toBe(200)
    expect(renamed.json).toEqual({ ...uploaded.json, filename: 'after.pdf' })
    const missing = await api.patch(`/api/files/${UNKNOWN_ID}`, {
      token: user.token,
      headers: workspaceHeaders,
      json: { filename: 'x.pdf' },
    })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'File not found' })
  })

  it('C43 DELETE /api/files/{id}', async () => {
    const uploaded = await uploadFile(api, user.token, workspaceId, { name: 'doomed.pdf' })
    const removed = await api.delete(`/api/files/${uploaded.json.id}`, { token: user.token, headers: workspaceHeaders })
    expect(removed.status).toBe(204)
    expect(removed.text).toBe('')
    const download = await api.get(`/api/files/${uploaded.json.id}/download`, { token: user.token, headers: workspaceHeaders })
    expect(download.status).toBe(404)
    expect(download.json).toEqual({ detail: 'File not found' })
    const missing = await api.delete(`/api/files/${UNKNOWN_ID}`, { token: user.token, headers: workspaceHeaders })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'File not found' })
  })
})
