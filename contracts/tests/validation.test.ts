import { beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { type Api, type Reply, bootstrapAdmin, registerUser, subject } from './support/http'

interface Tokens {
  admin: string
  user: string
  userId: string
  workspaceId: string
}

interface Operation {
  name: string
  slice: string
  call: (api: Api, tokens: Tokens) => Promise<Reply>
}

// Every operation of the contract that takes a request body, with a body that cannot be valid.
// The table grows with the slices: the operations of a slice are added in the batch that builds it.
const OPERATIONS: Operation[] = [
  { name: 'POST /api/auth/forgot-password', slice: 'S2', call: (a) => a.post('/api/auth/forgot-password', { json: {} }) },
  { name: 'POST /api/auth/login', slice: 'S2', call: (a) => a.post('/api/auth/login', { form: {} }) },
  { name: 'POST /api/auth/register', slice: 'S2', call: (a) => a.post('/api/auth/register', { json: { email: 'bad' } }) },
  { name: 'POST /api/auth/reset-password', slice: 'S2', call: (a) => a.post('/api/auth/reset-password', { json: {} }) },
  { name: 'POST /api/setup/create-admin', slice: 'S2', call: (a) => a.post('/api/setup/create-admin', { json: { email: 'bad' } }) },
  { name: 'PATCH /api/users/me', slice: 'S2', call: (a, t) => a.patch('/api/users/me', { token: t.user, json: { email: 12 } }) },
  {
    name: 'PATCH /api/users/{id}',
    slice: 'S2',
    call: (a, t) => a.patch(`/api/users/${t.userId}`, { token: t.admin, json: { is_active: 'nope' } }),
  },
  { name: 'POST /api/auth/2fa/disable', slice: 'S3', call: (a, t) => a.post('/api/auth/2fa/disable', { token: t.user, json: {} }) },
  { name: 'POST /api/auth/2fa/enable', slice: 'S3', call: (a, t) => a.post('/api/auth/2fa/enable', { token: t.user, json: { code: 'abc' } }) },
  { name: 'POST /api/auth/2fa/verify', slice: 'S3', call: (a) => a.post('/api/auth/2fa/verify', { json: {} }) },
  { name: 'POST /api/auth/passkeys/2fa/options', slice: 'S3', call: (a) => a.post('/api/auth/passkeys/2fa/options', { json: {} }) },
  { name: 'POST /api/auth/passkeys/2fa/verify', slice: 'S3', call: (a) => a.post('/api/auth/passkeys/2fa/verify', { json: {} }) },
  {
    name: 'POST /api/auth/passkeys/authenticate/options',
    slice: 'S3',
    call: (a) => a.post('/api/auth/passkeys/authenticate/options', { json: { email: 12 } }),
  },
  {
    name: 'POST /api/auth/passkeys/authenticate/verify',
    slice: 'S3',
    call: (a) => a.post('/api/auth/passkeys/authenticate/verify', { json: {} }),
  },
  {
    name: 'POST /api/auth/passkeys/register/options',
    slice: 'S3',
    call: (a, t) => a.post('/api/auth/passkeys/register/options', { token: t.user, json: { name: '' } }),
  },
  {
    name: 'POST /api/auth/passkeys/register/verify',
    slice: 'S3',
    call: (a, t) => a.post('/api/auth/passkeys/register/verify', { token: t.user, json: {} }),
  },
  { name: 'POST /api/workspaces', slice: 'S4', call: (a, t) => a.post('/api/workspaces', { token: t.user, json: {} }) },
  {
    name: 'PATCH /api/workspaces/{id}',
    slice: 'S4',
    call: (a, t) => a.patch(`/api/workspaces/${t.workspaceId}`, { token: t.user, json: { name: '' } }),
  },
  {
    name: 'POST /api/workspaces/{id}/members',
    slice: 'S4',
    call: (a, t) => a.post(`/api/workspaces/${t.workspaceId}/members`, { token: t.user, json: { email: 'bad' } }),
  },
  {
    name: 'PATCH /api/workspaces/{id}/members/{uid}',
    slice: 'S4',
    call: (a, t) => a.patch(`/api/workspaces/${t.workspaceId}/members/${t.userId}`, { token: t.user, json: {} }),
  },
  {
    name: 'POST /api/admin/users',
    slice: 'S5',
    call: (a, t) => a.post('/api/admin/users', { token: t.admin, json: { email: 'bad' } }),
  },
  {
    name: 'PATCH /api/admin/users/{id}',
    slice: 'S5',
    call: (a, t) => a.patch(`/api/admin/users/${t.userId}`, { token: t.admin, json: { is_active: 'nope' } }),
  },
  {
    name: 'PATCH /api/admin/settings/{key}',
    slice: 'S5',
    call: (a, t) => a.patch('/api/admin/settings/number_format', { token: t.admin, json: {} }),
  },
  { name: 'POST /api/files', slice: 'S5', call: (a, t) => a.post('/api/files', { token: t.user, body: new FormData() }) },
  {
    name: 'PATCH /api/files/{file_id}',
    slice: 'S5',
    call: (a, t) =>
      a.patch('/api/files/00000000-0000-4000-8000-0000000000dd', {
        token: t.user,
        headers: { 'x-workspace-id': t.workspaceId },
        json: { filename: '' },
      }),
  },
]

describe('request validation', () => {
  let tokens: Tokens

  beforeAll(async () => {
    await resetData()
    const api = subject()
    const admin = await bootstrapAdmin(api)
    const user = await registerUser(api)
    const workspaces = await api.get('/api/workspaces', { token: user.token })
    tokens = { admin: admin.token, user: user.token, userId: user.id, workspaceId: workspaces.json[0].id }
  })

  it.each(OPERATIONS)('C16 invalid body is 422 in FastAPI shape: $name', async ({ call }) => {
    const reply = await call(subject(), tokens)
    expect(reply.status).toBe(422)
    expect(Array.isArray(reply.json.detail)).toBe(true)
    expect(reply.json.detail.length).toBeGreaterThan(0)
    for (const item of reply.json.detail) {
      expect(item.loc[0]).toBe('body')
      expect(typeof item.msg).toBe('string')
      expect(typeof item.type).toBe('string')
    }
  })
})
