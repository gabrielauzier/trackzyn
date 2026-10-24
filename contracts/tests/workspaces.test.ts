import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { membershipRows, resetData } from './support/db'
import { createWorkspace, inviteMember, uploadFile } from './support/flows'
import { registerUser, subject, uniqueEmail } from './support/http'

type User = Awaited<ReturnType<typeof registerUser>>

const WORKSPACE_KEYS = [
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
]
const MEMBER_KEYS = ['display_name', 'email', 'id', 'joined_at', 'role', 'user_id']

async function ownedWorkspace(owner: User, name = 'Shared') {
  const created = await createWorkspace(subject(), owner.token, { name, self_membership: true })
  expect(created.status).toBe(201)
  return created.json.id as string
}

describe('workspaces and users: one case per operation', () => {
  beforeAll(resetData)

  it('C28 GET /api/workspaces', async () => {
    const user = await registerUser(subject())
    const managed = await createWorkspace(subject(), user.token, { name: 'Managed only' })
    const reply = await subject().get('/api/workspaces', { token: user.token })
    expect(reply.status).toBe(200)
    expect(reply.json).toHaveLength(2)
    const [personal, extra] = reply.json
    expect(Object.keys(personal).sort()).toEqual(WORKSPACE_KEYS)
    expect(personal).toMatchObject({
      name: 'Personal',
      is_archived: false,
      locale: 'en',
      created_by_user_id: user.id,
      managed_by_user_id: null,
      role: 'owner',
    })
    expect(extra).toMatchObject({ id: managed.json.id, name: 'Managed only', role: 'manager', managed_by_user_id: user.id })
    expect((await subject().get('/api/workspaces')).status).toBe(401)
  })

  it('C28 POST /api/workspaces', async () => {
    const user = await registerUser(subject())
    const manager = await createWorkspace(subject(), user.token, {
      name: '  Team  ',
      locale: 'pt-BR',
      icon: 'rocket',
      color: '#112233',
    })
    expect(manager.status).toBe(201)
    expect(Object.keys(manager.json).sort()).toEqual(WORKSPACE_KEYS)
    expect(manager.json).toMatchObject({
      name: 'Team',
      locale: 'pt-BR',
      icon: 'rocket',
      color: '#112233',
      is_archived: false,
      timezone: null,
      created_by_user_id: user.id,
      managed_by_user_id: user.id,
      role: 'manager',
    })

    const member = await createWorkspace(subject(), user.token, { name: 'Mine', self_membership: true })
    expect(member.status).toBe(201)
    expect(member.json.role).toBe('owner')
    expect(member.json.locale).toBe('en')
    expect((await membershipRows(member.json.id)).map((row) => row.user_id)).toEqual([user.id])
  })

  it('C28 GET /api/workspaces/current', async () => {
    const user = await registerUser(subject())
    const reply = await subject().get('/api/workspaces/current', { token: user.token })
    expect(reply.status).toBe(200)
    expect(reply.json).toMatchObject({ name: 'Personal', role: 'owner', created_by_user_id: user.id })
  })

  it('C28 PATCH /api/workspaces/{workspace_id}', async () => {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)
    const reply = await subject().patch(`/api/workspaces/${id}`, {
      token: owner.token,
      json: { name: 'Renamed', icon: 'star', color: '#abcdef', locale: 'pt', timezone: 'America/Sao_Paulo' },
    })
    expect(reply.status).toBe(200)
    expect(reply.json).toMatchObject({
      id,
      name: 'Renamed',
      icon: 'star',
      color: '#abcdef',
      locale: 'pt',
      timezone: 'America/Sao_Paulo',
      role: 'owner',
    })

    const cleared = await subject().patch(`/api/workspaces/${id}`, { token: owner.token, json: { timezone: null } })
    expect(cleared.status).toBe(200)
    expect(cleared.json.timezone).toBeNull()

    const bad = await subject().patch(`/api/workspaces/${id}`, { token: owner.token, json: { timezone: 'Mars/Olympus' } })
    expect(bad.status).toBe(400)
    expect(bad.json).toEqual({ detail: 'Invalid IANA timezone' })

    const stranger = await registerUser(subject())
    const hidden = await subject().patch(`/api/workspaces/${id}`, { token: stranger.token, json: { name: 'x' } })
    expect(hidden.status).toBe(404)
    expect(hidden.json).toEqual({ detail: 'Workspace not found' })
  })

  it('C28 GET /api/workspaces/{workspace_id}/members', async () => {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)
    const guest = await registerUser(subject())
    await inviteMember(subject(), owner.token, id, { email: guest.email, role: 'viewer' })

    const reply = await subject().get(`/api/workspaces/${id}/members`, { token: guest.token })
    expect(reply.status).toBe(200)
    expect(reply.json).toHaveLength(2)
    expect(Object.keys(reply.json[0]).sort()).toEqual(MEMBER_KEYS)
    expect(reply.json.map((m: { email: string; role: string }) => [m.email, m.role])).toEqual([
      [owner.email, 'owner'],
      [guest.email, 'viewer'],
    ])
    expect(reply.json[0].display_name).toBeNull()

    const stranger = await registerUser(subject())
    const hidden = await subject().get(`/api/workspaces/${id}/members`, { token: stranger.token })
    expect(hidden.status).toBe(404)
  })

  it('C28 POST /api/workspaces/{workspace_id}/members', async () => {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)
    const existing = await registerUser(subject())

    const added = await inviteMember(subject(), owner.token, id, { email: existing.email.toUpperCase(), role: 'editor' })
    expect(added.status).toBe(201)
    expect(Object.keys(added.json).sort()).toEqual(MEMBER_KEYS)
    expect(added.json).toMatchObject({ user_id: existing.id, email: existing.email, role: 'editor' })

    const created = await inviteMember(subject(), owner.token, id, {
      email: uniqueEmail('fresh'),
      password: 'brand-new-pass-1',
    })
    expect(created.status).toBe(201)
    expect(created.json.role).toBe('editor')

    const unknown = await inviteMember(subject(), owner.token, id, { email: uniqueEmail('nobody') })
    expect(unknown.status).toBe(400)
    expect(unknown.json).toEqual({ detail: 'User not found. Provide a password to create them.' })

    const badRole = await inviteMember(subject(), owner.token, id, { email: existing.email, role: 'emperor' })
    expect(badRole.status).toBe(400)

    const shortPassword = await inviteMember(subject(), owner.token, id, { email: uniqueEmail('short'), password: 'short' })
    expect(shortPassword.status).toBe(422)
    expect(shortPassword.json.detail[0].loc).toEqual(['body', 'password'])
  })

  it('C28 PATCH /api/workspaces/{workspace_id}/members/{member_user_id}', async () => {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)
    const guest = await registerUser(subject())
    await inviteMember(subject(), owner.token, id, { email: guest.email, role: 'viewer' })

    const reply = await subject().patch(`/api/workspaces/${id}/members/${guest.id}`, {
      token: owner.token,
      json: { role: 'editor' },
    })
    expect(reply.status).toBe(200)
    expect(Object.keys(reply.json).sort()).toEqual(MEMBER_KEYS)
    expect(reply.json).toMatchObject({ user_id: guest.id, role: 'editor' })

    const invalid = await subject().patch(`/api/workspaces/${id}/members/${guest.id}`, {
      token: owner.token,
      json: { role: 'emperor' },
    })
    expect(invalid.status).toBe(400)
    expect(invalid.json).toEqual({ detail: 'Invalid role: emperor' })

    const sole = await subject().patch(`/api/workspaces/${id}/members/${owner.id}`, {
      token: owner.token,
      json: { role: 'viewer' },
    })
    expect(sole.status).toBe(400)
    expect(sole.json).toEqual({ detail: 'Cannot demote the sole owner' })

    const missing = await subject().patch(`/api/workspaces/${id}/members/${randomUUID()}`, {
      token: owner.token,
      json: { role: 'viewer' },
    })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'Member not found' })
  })

  it('C28 DELETE /api/workspaces/{workspace_id}/members/{member_user_id}', async () => {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)
    const guest = await registerUser(subject())
    const other = await registerUser(subject())
    await inviteMember(subject(), owner.token, id, { email: guest.email, role: 'editor' })
    await inviteMember(subject(), owner.token, id, { email: other.email, role: 'viewer' })

    const forbidden = await subject().delete(`/api/workspaces/${id}/members/${other.id}`, { token: guest.token })
    expect(forbidden.status).toBe(403)
    expect(forbidden.json).toEqual({ detail: 'Only the owner can remove other members' })

    const removedByOwner = await subject().delete(`/api/workspaces/${id}/members/${other.id}`, { token: owner.token })
    expect(removedByOwner.status).toBe(204)
    expect(removedByOwner.text).toBe('')

    const leaves = await subject().delete(`/api/workspaces/${id}/members/${guest.id}`, { token: guest.token })
    expect(leaves.status).toBe(204)
    expect((await membershipRows(id)).map((row) => row.user_id)).toEqual([owner.id])

    const sole = await subject().delete(`/api/workspaces/${id}/members/${owner.id}`, { token: owner.token })
    expect(sole.status).toBe(400)
    expect(sole.json).toEqual({ detail: 'Cannot remove the sole owner' })

    const gone = await subject().delete(`/api/workspaces/${id}/members/${guest.id}`, { token: owner.token })
    expect(gone.status).toBe(404)
    expect(gone.json).toEqual({ detail: 'Member not found' })
  })

  it('C28 GET /api/workspaces/{workspace_id}/stats', async () => {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)
    const guest = await registerUser(subject())
    await inviteMember(subject(), owner.token, id, { email: guest.email })
    expect((await uploadFile(subject(), owner.token, id)).status).toBe(201)

    const reply = await subject().get(`/api/workspaces/${id}/stats`, { token: guest.token })
    expect(reply.status).toBe(200)
    expect(reply.json).toEqual({ members: 2, files: 1 })
  })

  it('C28 POST /api/workspaces/{workspace_id}/archive', async () => {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)

    const archived = await subject().post(`/api/workspaces/${id}/archive`, { token: owner.token })
    expect(archived.status).toBe(200)
    expect(archived.json).toMatchObject({ id, is_archived: true, role: 'owner' })

    const listed = await subject().get('/api/workspaces', { token: owner.token })
    expect(listed.json.map((w: { id: string }) => w.id)).not.toContain(id)

    const personal = listed.json[0].id as string
    const last = await subject().post(`/api/workspaces/${personal}/archive`, { token: owner.token })
    expect(last.status).toBe(400)
    expect(last.json).toEqual({ detail: 'Cannot archive your last workspace' })
  })

  it('C28 GET /api/users/lookup', async () => {
    const user = await registerUser(subject())
    const target = await registerUser(subject())
    const found = await subject().get(`/api/users/lookup?email=${encodeURIComponent(target.email.toUpperCase())}`, {
      token: user.token,
    })
    expect(found.status).toBe(200)
    expect(found.json).toEqual({ id: target.id, email: target.email })

    const missing = await subject().get('/api/users/lookup?email=nobody-here@example.com', { token: user.token })
    expect(missing.status).toBe(404)
    expect(missing.json).toEqual({ detail: 'User not found' })

    const invalid = await subject().get('/api/users/lookup?email=not-an-email', { token: user.token })
    expect(invalid.status).toBe(422)
    expect(invalid.json.detail[0].loc).toEqual(['query', 'email'])

    expect((await subject().get(`/api/users/lookup?email=${target.email}`)).status).toBe(401)
  })

  it('C28 GET /api/users/directory', async () => {
    const user = await registerUser(subject())
    const reply = await subject().get('/api/users/directory', { token: user.token })
    expect(reply.status).toBe(200)
    expect(reply.json.length).toBeGreaterThan(1)
    for (const entry of reply.json) expect(Object.keys(entry).sort()).toEqual(['email', 'id'])
    const emails = reply.json.map((entry: { email: string }) => entry.email)
    expect(emails).toEqual([...emails].sort())
    expect(emails).toContain(user.email)
    expect((await subject().get('/api/users/directory')).status).toBe(401)
  })
})

describe('concurrent invitations', () => {
  beforeAll(resetData)

  async function raceFor() {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)
    const target = await registerUser(subject())
    const replies = await Promise.all([
      inviteMember(subject(), owner.token, id, { email: target.email, role: 'editor' }),
      inviteMember(subject(), owner.token, id, { email: target.email, role: 'editor' }),
    ])
    return { id, target, replies }
  }

  it('C29 two concurrent invites leave one membership row', async () => {
    for (let round = 0; round < 3; round++) {
      const { id, target } = await raceFor()
      const rows = (await membershipRows(id)).filter((row) => row.user_id === target.id)
      expect(rows, `round ${round}`).toHaveLength(1)
    }
  })

  it('C29 one concurrent invite is 201 and the other is 409', async () => {
    for (let round = 0; round < 3; round++) {
      const { replies } = await raceFor()
      expect(replies.map((reply) => reply.status).sort(), `round ${round}`).toEqual([201, 409])
    }
  })

  it('C29 a sequential duplicate invite is 409 User is already a member', async () => {
    const owner = await registerUser(subject())
    const id = await ownedWorkspace(owner)
    const target = await registerUser(subject())
    const first = await inviteMember(subject(), owner.token, id, { email: target.email })
    expect(first.status).toBe(201)
    const second = await inviteMember(subject(), owner.token, id, { email: target.email })
    expect(second.status).toBe(409)
    expect(second.json).toEqual({ detail: 'User is already a member' })
  })
})
