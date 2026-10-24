import { beforeAll, describe, expect, it } from 'vitest'
import { resetData, userRow } from './support/db'
import { type Api, PASSWORD, bootstrapAdmin, login, registerUser, subject, uniqueEmail } from './support/http'

const UNKNOWN_ID = '00000000-0000-4000-8000-0000000000aa'

describe('admin operations', () => {
  let admin: { email: string; token: string }
  let api: Api

  beforeAll(async () => {
    await resetData()
    api = subject()
    admin = await bootstrapAdmin(api)
  })

  async function createManaged(overrides: Record<string, unknown> = {}) {
    const email = uniqueEmail('managed')
    const reply = await api.post('/api/admin/users', {
      token: admin.token,
      json: { email, password: PASSWORD, ...overrides },
    })
    expect(reply.status).toBe(201)
    return { email, id: reply.json.id as string, reply }
  }

  it('C32 GET /api/admin/users', async () => {
    const marker = `listing-${Date.now().toString(36)}`
    for (const letter of ['a', 'b', 'c']) {
      await api.post('/api/admin/users', { token: admin.token, json: { email: `${marker}-${letter}@example.com`, password: PASSWORD } })
    }
    const all = await api.get('/api/admin/users', { token: admin.token })
    expect(all.status).toBe(200)
    expect(all.json.total).toBeGreaterThanOrEqual(4)
    expect(Object.keys(all.json.items[0]).sort()).toEqual(['email', 'id', 'is_active', 'is_superuser', 'is_verified', 'preferences'])

    const searched = await api.get(`/api/admin/users?search=${marker.toUpperCase()}`, { token: admin.token })
    expect(searched.json.total).toBe(3)
    expect(searched.json.items.map((u: { email: string }) => u.email)).toEqual([
      `${marker}-a@example.com`,
      `${marker}-b@example.com`,
      `${marker}-c@example.com`,
    ])

    const paged = await api.get(`/api/admin/users?search=${marker}&page=2&limit=2`, { token: admin.token })
    expect(paged.json.total).toBe(3)
    expect(paged.json.items.map((u: { email: string }) => u.email)).toEqual([`${marker}-c@example.com`])

    expect((await api.get('/api/admin/users?limit=101', { token: admin.token })).status).toBe(422)
    expect((await api.get('/api/admin/users?page=0', { token: admin.token })).status).toBe(422)
  })

  it('C32 POST /api/admin/users', async () => {
    const { email, id, reply } = await createManaged({ is_superuser: true, preferences: { language: 'pt' } })
    expect(reply.json).toEqual({
      id,
      email,
      is_active: true,
      is_superuser: true,
      is_verified: true,
      preferences: { language: 'pt' },
    })
    const session = await login(api, email, PASSWORD)
    expect(session.status).toBe(200)
    const workspaces = await api.get('/api/workspaces', { token: session.json.access_token })
    expect(workspaces.json).toHaveLength(1)

    const duplicate = await api.post('/api/admin/users', { token: admin.token, json: { email, password: PASSWORD } })
    expect(duplicate.status).toBe(400)
    expect(duplicate.json).toEqual({ detail: 'A user with this email already exists' })
  })

  it('C32 GET /api/admin/users/{id}', async () => {
    const { email, id } = await createManaged()
    const found = await api.get(`/api/admin/users/${id}`, { token: admin.token })
    expect(found.status).toBe(200)
    expect(found.json).toMatchObject({ id, email, is_active: true, is_superuser: false, is_verified: true })
    expect(found.json.preferences).toEqual({ language: 'en', date_format: 'MM/DD/YYYY' })

    const missing = await api.get(`/api/admin/users/${UNKNOWN_ID}`, { token: admin.token })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'User not found' })
  })

  it('C32 PATCH /api/admin/users/{id}', async () => {
    const { email, id } = await createManaged()
    const other = await createManaged()
    const changed = await api.patch(`/api/admin/users/${id}`, {
      token: admin.token,
      json: { is_active: false, is_superuser: true, preferences: { language: 'fr' } },
    })
    expect(changed.status).toBe(200)
    expect(changed.json).toMatchObject({ id, email, is_active: false, is_superuser: true, preferences: { language: 'fr' } })
    expect((await login(api, email, PASSWORD)).status).toBe(400)

    const renamed = uniqueEmail('renamed')
    const moved = await api.patch(`/api/admin/users/${id}`, { token: admin.token, json: { email: renamed, password: 'another-pass-456' } })
    expect(moved.status).toBe(200)
    expect(moved.json.email).toBe(renamed)
    expect((await userRow(renamed)).is_verified).toBe(true)

    const taken = await api.patch(`/api/admin/users/${id}`, { token: admin.token, json: { email: other.email } })
    expect(taken.status).toBe(400)
    expect(taken.json).toEqual({ detail: 'A user with this email already exists' })

    const adminId = (await userRow(admin.email)).id as string
    const demote = await api.patch(`/api/admin/users/${adminId}`, { token: admin.token, json: { is_superuser: false } })
    expect(demote.status).toBe(400)
    expect(demote.json).toEqual({ detail: 'Cannot remove your own admin privileges' })
    const deactivate = await api.patch(`/api/admin/users/${adminId}`, { token: admin.token, json: { is_active: false } })
    expect(deactivate.status).toBe(400)
    expect(deactivate.json).toEqual({ detail: 'Cannot deactivate your own account' })

    const missing = await api.patch(`/api/admin/users/${UNKNOWN_ID}`, { token: admin.token, json: { is_active: true } })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'User not found' })
  })

  it('C32 DELETE /api/admin/users/{id}', async () => {
    const { id } = await createManaged()
    const removed = await api.delete(`/api/admin/users/${id}`, { token: admin.token })
    expect(removed.status).toBe(204)
    expect(removed.text).toBe('')
    expect((await api.get(`/api/admin/users/${id}`, { token: admin.token })).status).toBe(404)

    const missing = await api.delete(`/api/admin/users/${UNKNOWN_ID}`, { token: admin.token })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'User not found' })

    const adminId = (await userRow(admin.email)).id as string
    const self = await api.delete(`/api/admin/users/${adminId}`, { token: admin.token })
    expect(self.status).toBe(400)
    expect(self.json).toEqual({ detail: 'Cannot delete your own account' })
  })

  it('C32 GET /api/admin/settings/{key}', async () => {
    const missing = await api.get('/api/admin/settings/theme_color_light', { token: admin.token })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'Setting not found' })
    await api.patch('/api/admin/settings/theme_color_light', { token: admin.token, json: { value: '#112233' } })
    const found = await api.get('/api/admin/settings/theme_color_light', { token: admin.token })
    expect(found.status).toBe(200)
    expect(found.json).toEqual({ key: 'theme_color_light', value: '#112233' })
    await api.delete('/api/admin/settings/theme_color_light', { token: admin.token })
  })

  it('C32 PATCH /api/admin/settings/{key}', async () => {
    const saved = await api.patch('/api/admin/settings/number_format', { token: admin.token, json: { value: 'dot_comma' } })
    expect(saved.status).toBe(200)
    expect(saved.json).toEqual({ key: 'number_format', value: 'dot_comma' })
    const overwritten = await api.patch('/api/admin/settings/number_format', { token: admin.token, json: { value: 'space_comma' } })
    expect(overwritten.json).toEqual({ key: 'number_format', value: 'space_comma' })

    const unknownKey = await api.patch('/api/admin/settings/nope', { token: admin.token, json: { value: 'x' } })
    expect(unknownKey.status).toBe(400)
    expect(unknownKey.json).toEqual({ detail: "Setting 'nope' is not configurable" })

    const badChoice = await api.patch('/api/admin/settings/date_format', { token: admin.token, json: { value: 'nope' } })
    expect(badChoice.status).toBe(400)
    expect(badChoice.json.detail).toMatch(/^Invalid value for 'date_format'\. Allowed: \{.*\}$/)

    const badColor = await api.patch('/api/admin/settings/theme_color_dark', { token: admin.token, json: { value: 'red' } })
    expect(badColor.status).toBe(400)
    expect(badColor.json).toEqual({ detail: "Invalid hex color code for 'theme_color_dark'. Expected format: #RRGGBB" })

    const badZone = await api.patch('/api/admin/settings/timezone', { token: admin.token, json: { value: 'Mars/Olympus' } })
    expect(badZone.status).toBe(400)
    expect(badZone.json).toEqual({ detail: 'Invalid IANA timezone' })

    await api.delete('/api/admin/settings/number_format', { token: admin.token })
  })

  it('C32 DELETE /api/admin/settings/{key}', async () => {
    await api.patch('/api/admin/settings/date_format', { token: admin.token, json: { value: 'ymd' } })
    const removed = await api.delete('/api/admin/settings/date_format', { token: admin.token })
    expect(removed.status).toBe(204)
    expect(removed.text).toBe('')
    expect((await api.get('/api/admin/settings/date_format', { token: admin.token })).status).toBe(404)

    const again = await api.delete('/api/admin/settings/date_format', { token: admin.token })
    expect(again.status).toBe(204)
    const unknownKey = await api.delete('/api/admin/settings/nope', { token: admin.token })
    expect(unknownKey.status).toBe(400)
    expect(unknownKey.json).toEqual({ detail: "Setting 'nope' is not configurable" })
  })

  it('C32 GET /api/admin/timezone', async () => {
    const before = await api.get('/api/admin/timezone', { token: admin.token })
    expect(before.status).toBe(200)
    expect(before.json.saved).toBeNull()
    expect(before.json.timezone).toBe(before.json.fallback)
    expect(before.json.available).toContain('UTC')
    expect(before.json.available).toContain('America/Sao_Paulo')
    expect(before.json.available).toEqual([...before.json.available].sort())

    await api.patch('/api/admin/settings/timezone', { token: admin.token, json: { value: 'America/Sao_Paulo' } })
    const after = await api.get('/api/admin/timezone', { token: admin.token })
    expect(after.json.saved).toBe('America/Sao_Paulo')
    expect(after.json.timezone).toBe('America/Sao_Paulo')
    expect(after.json.fallback).toBe(before.json.fallback)
    await api.delete('/api/admin/settings/timezone', { token: admin.token })
    const restored = await api.get('/api/admin/timezone', { token: admin.token })
    expect(restored.json.saved).toBeNull()
  })

  it('C32 GET /api/admin/registration-status', async () => {
    expect((await api.get('/api/admin/registration-status')).json).toEqual({ enabled: true })
    await api.patch('/api/admin/settings/registration_enabled', { token: admin.token, json: { value: 'false' } })
    expect((await api.get('/api/admin/registration-status')).json).toEqual({ enabled: false })
    await api.delete('/api/admin/settings/registration_enabled', { token: admin.token })
    expect((await api.get('/api/admin/registration-status')).json).toEqual({ enabled: true })
  })

  it('C32 GET /api/admin/default-colors', async () => {
    await api.patch('/api/admin/settings/theme_color_light', { token: admin.token, json: { value: '#AABBCC' } })
    await api.patch('/api/admin/settings/theme_color_dark', { token: admin.token, json: { value: '#001122' } })
    const reply = await api.get('/api/admin/default-colors')
    expect(reply.status).toBe(200)
    expect(reply.json).toEqual({ light: '#AABBCC', dark: '#001122' })
    await api.delete('/api/admin/settings/theme_color_light', { token: admin.token })
    await api.delete('/api/admin/settings/theme_color_dark', { token: admin.token })
    expect((await api.get('/api/admin/default-colors')).json).toEqual({ light: null, dark: null })
  })

  it('C32 GET /api/admin/number-format', async () => {
    const user = await registerUser(api)
    expect((await api.get('/api/admin/number-format', { token: user.token })).json).toEqual({ format: 'auto' })
    await api.patch('/api/admin/settings/number_format', { token: admin.token, json: { value: 'comma_dot' } })
    expect((await api.get('/api/admin/number-format', { token: user.token })).json).toEqual({ format: 'comma_dot' })
    await api.delete('/api/admin/settings/number_format', { token: admin.token })
  })

  it('C32 GET /api/admin/date-format', async () => {
    const user = await registerUser(api)
    expect((await api.get('/api/admin/date-format', { token: user.token })).json).toEqual({ format: 'auto' })
    await api.patch('/api/admin/settings/date_format', { token: admin.token, json: { value: 'mdy' } })
    expect((await api.get('/api/admin/date-format', { token: user.token })).json).toEqual({ format: 'mdy' })
    await api.delete('/api/admin/settings/date_format', { token: admin.token })
  })
})
