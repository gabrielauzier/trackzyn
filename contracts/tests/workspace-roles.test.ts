import { beforeAll, describe, expect, it } from 'vitest'
import { membershipRows, resetData } from './support/db'
import { createWorkspace, inviteMember, uploadFile } from './support/flows'
import { registerUser, subject } from './support/http'

type User = Awaited<ReturnType<typeof registerUser>>

/** A workspace whose owner invited `role` users: returns the workspace id and each invited user. */
async function workspaceWith(owner: User, roles: string[]) {
  const created = await createWorkspace(subject(), owner.token, { self_membership: true })
  expect(created.status).toBe(201)
  const members: User[] = []
  for (const role of roles) {
    const member = await registerUser(subject())
    const invited = await inviteMember(subject(), owner.token, created.json.id, { email: member.email, role })
    expect(invited.status).toBe(201)
    members.push(member)
  }
  return { id: created.json.id as string, members }
}

describe('workspace roles', () => {
  beforeAll(resetData)

  it('C27 viewer write is 403 Read-only role', async () => {
    const owner = await registerUser(subject())
    const { id, members } = await workspaceWith(owner, ['viewer'])
    const reply = await uploadFile(subject(), members[0].token, id)
    expect(reply.status).toBe(403)
    expect(reply.json).toEqual({ detail: 'Read-only role' })
  })

  it('C27 editor on an owner-only route is 403 Insufficient role', async () => {
    const owner = await registerUser(subject())
    const { id, members } = await workspaceWith(owner, ['editor'])
    const editor = members[0]
    const expected = { detail: 'Insufficient role' }

    const rename = await subject().patch(`/api/workspaces/${id}`, { token: editor.token, json: { name: 'Mine now' } })
    expect([rename.status, rename.json]).toEqual([403, expected])

    const invite = await inviteMember(subject(), editor.token, id, { email: owner.email })
    expect([invite.status, invite.json]).toEqual([403, expected])

    const role = await subject().patch(`/api/workspaces/${id}/members/${owner.id}`, {
      token: editor.token,
      json: { role: 'viewer' },
    })
    expect([role.status, role.json]).toEqual([403, expected])

    const archive = await subject().post(`/api/workspaces/${id}/archive`, { token: editor.token })
    expect([archive.status, archive.json]).toEqual([403, expected])
  })

  it('C27 manager without a membership row acts as owner', async () => {
    const manager = await registerUser(subject())
    const created = await createWorkspace(subject(), manager.token, { name: 'Managed', self_membership: false })
    expect(created.status).toBe(201)
    const id = created.json.id as string
    expect(created.json.managed_by_user_id).toBe(manager.id)
    expect(created.json.role).toBe('manager')
    expect(await membershipRows(id)).toEqual([])

    const current = await subject().get('/api/workspaces/current', {
      token: manager.token,
      headers: { 'x-workspace-id': id },
    })
    expect(current.status).toBe(200)
    expect(current.json.role).toBe('manager')

    const renamed = await subject().patch(`/api/workspaces/${id}`, { token: manager.token, json: { name: 'Renamed' } })
    expect(renamed.status).toBe(200)
    expect(renamed.json.name).toBe('Renamed')
    expect(renamed.json.role).toBe('manager')

    const guest = await registerUser(subject())
    const invited = await inviteMember(subject(), manager.token, id, { email: guest.email, role: 'editor' })
    expect(invited.status).toBe(201)

    const uploaded = await uploadFile(subject(), manager.token, id)
    expect(uploaded.status).toBe(201)

    const archived = await subject().post(`/api/workspaces/${id}/archive`, { token: manager.token })
    expect(archived.status).toBe(200)
    expect(archived.json.is_archived).toBe(true)
    // Still no membership row for the manager.
    const rows = await membershipRows(id)
    expect(rows.map((row) => row.user_id)).toEqual([guest.id])
  })
})
