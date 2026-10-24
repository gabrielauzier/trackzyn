import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { resetData, seedUser } from './support/db'
import { createWorkspace } from './support/flows'
import { PASSWORD, login, registerUser, subject, uniqueEmail } from './support/http'

const current = (token: string, workspaceId?: string) =>
  subject().get('/api/workspaces/current', {
    token,
    headers: workspaceId === undefined ? {} : { 'x-workspace-id': workspaceId },
  })

describe('resolving the workspace of a request', () => {
  beforeAll(resetData)

  it('C26 a non-UUID X-Workspace-Id is 400 Invalid X-Workspace-Id', async () => {
    const user = await registerUser(subject())
    const reply = await current(user.token, 'not-a-uuid')
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid X-Workspace-Id' })
  })

  it('C26 an unknown workspace is 404 Workspace not found', async () => {
    const user = await registerUser(subject())
    const reply = await current(user.token, randomUUID())
    expect(reply.status).toBe(404)
    expect(reply.json).toEqual({ detail: 'Workspace not found' })
  })

  it('C26 an archived workspace is 404 Workspace not found', async () => {
    const user = await registerUser(subject())
    const created = await createWorkspace(subject(), user.token, { name: 'To archive', self_membership: true })
    expect(created.status).toBe(201)
    expect((await current(user.token, created.json.id)).status).toBe(200)

    const archived = await subject().post(`/api/workspaces/${created.json.id}/archive`, { token: user.token })
    expect(archived.status).toBe(200)

    const reply = await current(user.token, created.json.id)
    expect(reply.status).toBe(404)
    expect(reply.json).toEqual({ detail: 'Workspace not found' })
  })

  it('C26 a workspace the user neither belongs to nor manages is 404 Workspace not found', async () => {
    const owner = await registerUser(subject())
    const stranger = await registerUser(subject())
    const created = await createWorkspace(subject(), owner.token, { self_membership: true })
    const reply = await current(stranger.token, created.json.id)
    expect(reply.status).toBe(404)
    expect(reply.json).toEqual({ detail: 'Workspace not found' })
  })

  it('C26 a missing header resolves to the default workspace', async () => {
    const user = await registerUser(subject())
    const listed = await subject().get('/api/workspaces', { token: user.token })
    expect(listed.json).toHaveLength(1)

    // A second, newer workspace does not displace the oldest one.
    await createWorkspace(subject(), user.token, { name: 'Newer', self_membership: true })
    const reply = await current(user.token)
    expect(reply.status).toBe(200)
    expect(reply.json.id).toBe(listed.json[0].id)
    expect(reply.json.name).toBe('Personal')
    expect(reply.json.role).toBe('owner')
    expect(Object.keys(reply.json).sort()).toEqual([
      'color',
      'created_at',
      'created_by_user_id',
      'icon',
      'id',
      'is_archived',
      'locale',
      'managed_by_user_id',
      'name',
      'role',
      'timezone',
    ])
  })

  it('C26 a missing header with no workspace at all is 404 No workspace available', async () => {
    const email = uniqueEmail('lonely')
    await seedUser({ email, password: PASSWORD })
    const session = await login(subject(), email, PASSWORD)
    expect(session.status).toBe(200)
    const reply = await current(session.json.access_token)
    expect(reply.status).toBe(404)
    expect(reply.json).toEqual({ detail: 'No workspace available' })
  })
})
