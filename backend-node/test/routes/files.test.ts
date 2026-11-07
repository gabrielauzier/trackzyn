import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { users } from '../../src/db/schema.ts'
import { type TestApp, bearer, createTestApp, freshIp, register } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
  // The first account registered becomes the superuser; take it so every user below is a plain one.
  await register(t)
})
afterAll(async () => {
  await t.close()
})

type User = Awaited<ReturnType<typeof register>>

async function promote(user: User) {
  await t.ctx.db.update(users).set({ isSuperuser: true }).where(eq(users.id, user.id))
}

async function workspaceOf(user: User) {
  const reply = await t.app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: bearer(user.token),
    payload: { name: 'Files', self_membership: true },
  })
  expect(reply.statusCode).toBe(201)
  return reply.json().id as string
}

function upload(authorization: Record<string, string>, workspaceId: string) {
  const boundary = `----t${freshIp()}`
  const body =
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="notes.pdf"\r\n` +
    `Content-Type: application/pdf\r\n\r\n%PDF-1.4\r\n--${boundary}--\r\n`
  return t.app.inject({
    method: 'POST',
    url: '/api/files',
    headers: { ...authorization, 'x-workspace-id': workspaceId, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  })
}

/** Every route of `routes/files.ts`, called as `authorization` on `fileId` of `workspaceId`. */
function everyRoute(authorization: Record<string, string>, workspaceId: string, fileId: string) {
  const headers = { ...authorization, 'x-workspace-id': workspaceId }
  return [
    ['GET /api/files', () => t.app.inject({ method: 'GET', url: '/api/files', headers })],
    ['POST /api/files', () => upload(authorization, workspaceId)],
    ['GET /api/files/:id/download', () => t.app.inject({ method: 'GET', url: `/api/files/${fileId}/download`, headers })],
    ['PATCH /api/files/:id', () => t.app.inject({ method: 'PATCH', url: `/api/files/${fileId}`, headers, payload: { filename: 'x.pdf' } })],
    ['DELETE /api/files/:id', () => t.app.inject({ method: 'DELETE', url: `/api/files/${fileId}`, headers })],
  ] as const
}

describe('/api/files', () => {
  it('files routes are superuser only', async () => {
    const admin = await register(t)
    await promote(admin)
    const workspaceId = await workspaceOf(admin)
    const member = await register(t)
    const invited = await t.app.inject({
      method: 'POST',
      url: `/api/workspaces/${workspaceId}/members`,
      headers: bearer(admin.token),
      payload: { email: member.email, role: 'editor' },
    })
    expect(invited.statusCode).toBe(201)

    const created = await upload(bearer(admin.token), workspaceId)
    expect(created.statusCode).toBe(201)
    const fileId = created.json().id as string

    // A member who is not a superuser: 403 on every route, by session and by token.
    const token = await mintToken(t, member.token, workspaceId)
    for (const authorization of [bearer(member.token), { authorization: `Bearer ${token.value}` }]) {
      for (const [route, send] of everyRoute(authorization, workspaceId, fileId)) {
        expect((await send()).statusCode, route).toBe(403)
      }
    }
    // Nothing was renamed or deleted on the way.
    const listed = await t.app.inject({ method: 'GET', url: '/api/files', headers: { ...bearer(admin.token), 'x-workspace-id': workspaceId } })
    expect(listed.json()).toEqual([expect.objectContaining({ id: fileId, filename: 'notes.pdf' })])

    // The superuser keeps using them as before.
    const [list, add, download, rename, remove] = everyRoute(bearer(admin.token), workspaceId, fileId)
    expect((await list[1]()).statusCode).toBe(200)
    expect((await add[1]()).statusCode).toBe(201)
    const downloaded = await download[1]()
    expect(downloaded.statusCode).toBe(200)
    expect(downloaded.body).toBe('%PDF-1.4')
    const renamed = await rename[1]()
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json().filename).toBe('x.pdf')
    expect((await remove[1]()).statusCode).toBe(204)
  })

  it('answers 401 without a session before checking the superuser', async () => {
    const reply = await t.app.inject({ method: 'GET', url: '/api/files', headers: { 'x-forwarded-for': freshIp() } })
    expect(reply.statusCode).toBe(401)
  })
})
