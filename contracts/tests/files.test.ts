import { beforeAll, describe, expect, it } from 'vitest'
import { db, resetData } from './support/db'
import { uploadFile } from './support/flows'
import { registerUser, subject } from './support/http'

describe('file upload and download', () => {
  let owner: Awaited<ReturnType<typeof registerUser>>
  let workspaceId: string

  beforeAll(async () => {
    await resetData()
    owner = await registerUser(subject())
    const workspaces = await subject().get('/api/workspaces', { token: owner.token })
    workspaceId = workspaces.json[0].id
  })

  it('C33 oversize upload is 400 File too large', async () => {
    const oversize = 'x'.repeat(10 * 1024 * 1024 + 1)
    const reply = await uploadFile(subject(), owner.token, workspaceId, { name: 'big.pdf', content: oversize })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'File too large. Maximum size is 10 MB.' })
  })

  it('C33 disallowed extension is 400 File type not allowed', async () => {
    const reply = await uploadFile(subject(), owner.token, workspaceId, { name: 'script.exe', type: 'application/octet-stream' })
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({
      detail: "File type '.exe' is not allowed. Allowed: gif, heic, jpeg, jpg, pdf, png, webp",
    })
  })

  it('C33 valid upload is 201 with the file record', async () => {
    const content = '%PDF-1.4 synthetic body'
    const reply = await uploadFile(subject(), owner.token, workspaceId, { name: 'notes.pdf', content })
    expect(reply.status).toBe(201)
    expect(reply.json).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      workspace_id: workspaceId,
      uploaded_by_user_id: owner.id,
      filename: 'notes.pdf',
      content_type: 'application/pdf',
      size: Buffer.byteLength(content),
      created_at: expect.any(String),
    })
    expect(Number.isNaN(Date.parse(reply.json.created_at))).toBe(false)
  })

  it('C34 download returns the stored type and an RFC 5987 disposition', async () => {
    const uploaded = await uploadFile(subject(), owner.token, workspaceId, {
      name: 'relatório final.png',
      content: 'not really a png',
      type: 'image/png',
    })
    expect(uploaded.status).toBe(201)
    // Uploads sanitise names, so a name with accents is seeded the way a legacy row would carry it.
    expect(uploaded.json.filename).toBe('relat_rio_final.png')
    await db().query('UPDATE files SET filename = $2 WHERE id = $1', [uploaded.json.id, 'relatório final.png'])
    const fileId = uploaded.json.id as string
    const headers = { 'x-workspace-id': workspaceId }

    const download = await subject().get(`/api/files/${fileId}/download`, { token: owner.token, headers })
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('image/png')
    expect(download.headers.get('content-disposition')).toBe("inline; filename*=UTF-8''relat%C3%B3rio%20final.png")
    expect(download.text).toBe('not really a png')
  })

  it('C34 unknown id is 404 File not found', async () => {
    const reply = await subject().get('/api/files/00000000-0000-4000-8000-0000000000bb/download', {
      token: owner.token,
      headers: { 'x-workspace-id': workspaceId },
    })
    expect(reply.status).toBe(404)
    expect(reply.json).toEqual({ detail: 'File not found' })
  })

  it('C34 an id from another workspace is 404 File not found', async () => {
    const uploaded = await uploadFile(subject(), owner.token, workspaceId, { name: 'private.pdf' })
    expect(uploaded.status).toBe(201)
    const stranger = await registerUser(subject())
    const strangerWorkspaces = await subject().get('/api/workspaces', { token: stranger.token })
    const reply = await subject().get(`/api/files/${uploaded.json.id}/download`, {
      token: stranger.token,
      headers: { 'x-workspace-id': strangerWorkspaces.json[0].id },
    })
    expect(reply.status).toBe(404)
    expect(reply.json).toEqual({ detail: 'File not found' })
  })
})
