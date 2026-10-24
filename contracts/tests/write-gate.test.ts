import { beforeAll, describe, expect, it } from 'vitest'
import { resetData } from './support/db'
import { createWorkspace, inviteMember, uploadFile } from './support/flows'
import { registerUser, subject } from './support/http'

async function scenario() {
  const owner = await registerUser(subject())
  const created = await createWorkspace(subject(), owner.token, { self_membership: true })
  const workspaceId = created.json.id as string
  const viewer = await registerUser(subject())
  const editor = await registerUser(subject())
  expect((await inviteMember(subject(), owner.token, workspaceId, { email: viewer.email, role: 'viewer' })).status).toBe(201)
  expect((await inviteMember(subject(), owner.token, workspaceId, { email: editor.email, role: 'editor' })).status).toBe(201)
  return { owner, viewer, editor, workspaceId }
}

describe('the write gate', () => {
  beforeAll(resetData)

  it('C30 a viewer cannot upload', async () => {
    const { viewer, workspaceId } = await scenario()
    const reply = await uploadFile(subject(), viewer.token, workspaceId)
    expect(reply.status).toBe(403)
    expect(String(reply.json.detail).toLowerCase()).toContain('read-only')
  })

  it('C30 a viewer cannot change a file (PATCH, DELETE)', async () => {
    const { owner, viewer, workspaceId } = await scenario()
    const uploaded = await uploadFile(subject(), owner.token, workspaceId)
    expect(uploaded.status).toBe(201)
    const fileId = uploaded.json.id as string
    const headers = { 'x-workspace-id': workspaceId }

    const patch = await subject().patch(`/api/files/${fileId}`, {
      token: viewer.token,
      headers,
      json: { filename: 'renamed.pdf' },
    })
    expect(patch.status).toBe(403)
    const remove = await subject().delete(`/api/files/${fileId}`, { token: viewer.token, headers })
    expect(remove.status).toBe(403)

    const still = await subject().get('/api/files', { token: owner.token, headers })
    expect(still.json.map((file: { id: string }) => file.id)).toEqual([fileId])
    expect(still.json[0].filename).toBe('notes.pdf')
  })

  it('C30 a viewer can still read', async () => {
    const { owner, viewer, workspaceId } = await scenario()
    expect((await uploadFile(subject(), owner.token, workspaceId)).status).toBe(201)
    expect((await uploadFile(subject(), owner.token, workspaceId, { name: 'second.pdf' })).status).toBe(201)
    const reply = await subject().get('/api/files', { token: viewer.token, headers: { 'x-workspace-id': workspaceId } })
    expect(reply.status).toBe(200)
    expect(reply.json).toHaveLength(2)
  })

  it('C30 the gate is about role not identity', async () => {
    const { owner, viewer, workspaceId } = await scenario()
    const refused = await uploadFile(subject(), viewer.token, workspaceId)
    const allowed = await uploadFile(subject(), owner.token, workspaceId)
    expect(refused.status).toBe(403)
    expect(allowed.status).toBe(201)
  })

  it('C30 an editor can upload', async () => {
    const { editor, workspaceId } = await scenario()
    const reply = await uploadFile(subject(), editor.token, workspaceId)
    expect(reply.status).toBe(201)
    expect(reply.json.uploaded_by_user_id).toBe(editor.id)
    expect(reply.json.workspace_id).toBe(workspaceId)
  })
})
