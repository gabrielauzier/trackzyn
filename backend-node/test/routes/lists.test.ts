import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestApp, bearer, createTestApp, register } from '../support/test-app.ts'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(async () => {
  await t.close()
})

type User = Awaited<ReturnType<typeof register>>

const call = (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, token: string, workspaceId: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { ...bearer(token), 'x-workspace-id': workspaceId }, payload: payload as object })

/** An owner, a viewer of the owner's workspace, and a stranger with a workspace of their own. */
async function setup() {
  const owner = await register(t)
  const workspace = await t.app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: bearer(owner.token),
    payload: { name: 'Shared', self_membership: true },
  })
  const workspaceId = workspace.json().id as string
  const viewer = await register(t)
  const invited = await t.app.inject({
    method: 'POST',
    url: `/api/workspaces/${workspaceId}/members`,
    headers: bearer(owner.token),
    payload: { email: viewer.email, role: 'viewer' },
  })
  expect(invited.statusCode).toBe(201)

  const stranger = await register(t)
  const theirs = await t.app.inject({
    method: 'POST',
    url: '/api/workspaces',
    headers: bearer(stranger.token),
    payload: { name: 'Theirs', self_membership: true },
  })
  return { owner, viewer, workspaceId, stranger, strangerWorkspaceId: theirs.json().id as string }
}

async function createList(user: User, workspaceId: string, name = 'Work', color = 3) {
  const reply = await call('POST', '/api/lists', user.token, workspaceId, { name, color })
  expect(reply.statusCode).toBe(201)
  return reply.json() as { id: string; name: string; color: number; position: number }
}

const READ_ONLY = { detail: 'Read-only role' }

describe('GET /api/lists', () => {
  it('LIST-01 answers the day timezone and no list for a workspace without lists', async () => {
    const { owner, workspaceId } = await setup()
    await t.app.inject({
      method: 'PATCH',
      url: `/api/workspaces/${workspaceId}`,
      headers: bearer(owner.token),
      payload: { timezone: 'America/Sao_Paulo' },
    })
    const reply = await call('GET', '/api/lists', owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ timezone: 'America/Sao_Paulo', lists: [] })
  })

  it('LIST-08 lists only the lists that are not archived by default, and the archived ones on request', async () => {
    const { owner, viewer, workspaceId } = await setup()
    const kept = await createList(owner, workspaceId, 'Kept', 2)
    const archived = await createList(owner, workspaceId, 'Archived')
    await call('PATCH', `/api/lists/${archived.id}`, owner.token, workspaceId, { is_archived: true })

    const reply = await call('GET', '/api/lists', viewer.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json().lists).toEqual([
      {
        id: kept.id,
        workspace_id: workspaceId,
        name: 'Kept',
        color: 2,
        position: 0,
        is_archived: false,
        created_by_user_id: owner.id,
        created_at: expect.any(String),
        pending_count: 0,
        preview: [],
      },
    ])
    const onlyArchived = await call('GET', '/api/lists?archived=true', owner.token, workspaceId)
    expect(onlyArchived.json().lists.map((list: { name: string }) => list.name)).toEqual(['Archived'])
  })

  it('answers 422 for an archived value that is not a boolean', async () => {
    const { owner, workspaceId } = await setup()
    expect((await call('GET', '/api/lists?archived=maybe', owner.token, workspaceId)).statusCode).toBe(422)
  })
})

describe('POST /api/lists', () => {
  it('LIST-03 creates a list at the end with its name and color', async () => {
    const { owner, workspaceId } = await setup()
    await createList(owner, workspaceId, 'First')
    const second = await call('POST', '/api/lists', owner.token, workspaceId, { name: 'x'.repeat(100), color: 8 })
    expect(second.statusCode).toBe(201)
    expect(second.json()).toMatchObject({ name: 'x'.repeat(100), color: 8, position: 1, is_archived: false, workspace_id: workspaceId })
  })

  it('LIST-04 answers 422 in the validation format for an empty name or one of 101 characters', async () => {
    const { owner, workspaceId } = await setup()
    const empty = await call('POST', '/api/lists', owner.token, workspaceId, { name: '', color: 1 })
    expect(empty.statusCode).toBe(422)
    expect(empty.json()).toEqual({
      detail: [{ type: 'string_too_short', loc: ['body', 'name'], msg: 'String should have at least 1 characters' }],
    })
    const long = await call('POST', '/api/lists', owner.token, workspaceId, { name: 'x'.repeat(101), color: 1 })
    expect(long.statusCode).toBe(422)
    expect(long.json()).toEqual({
      detail: [{ type: 'string_too_long', loc: ['body', 'name'], msg: 'String should have at most 100 characters' }],
    })
    expect((await call('POST', '/api/lists', owner.token, workspaceId, { name: 'ok', color: 9 })).statusCode).toBe(422)
    expect((await call('GET', '/api/lists', owner.token, workspaceId)).json().lists).toEqual([])
  })

  it('LIST-10 answers 403 Read-only role to a viewer', async () => {
    const { viewer, workspaceId } = await setup()
    const reply = await call('POST', '/api/lists', viewer.token, workspaceId, { name: 'Nope', color: 1 })
    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual(READ_ONLY)
  })
})

describe('GET /api/lists/:id', () => {
  it('reads a list of the workspace, answers 404 for another workspace and 422 for an id that is not a UUID', async () => {
    const { owner, viewer, workspaceId, stranger, strangerWorkspaceId } = await setup()
    const list = await createList(owner, workspaceId)
    const read = await call('GET', `/api/lists/${list.id}`, viewer.token, workspaceId)
    expect(read.statusCode).toBe(200)
    expect(read.json()).toMatchObject({ id: list.id, name: 'Work', color: 3 })

    const foreign = await call('GET', `/api/lists/${list.id}`, stranger.token, strangerWorkspaceId)
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toEqual({ detail: 'List not found' })

    const invalid = await call('GET', '/api/lists/not-a-uuid', owner.token, workspaceId)
    expect(invalid.statusCode).toBe(422)
    expect(invalid.json().detail[0]).toMatchObject({ loc: ['path', 'list_id'], msg: 'Input should be a valid UUID' })
  })
})

describe('PATCH /api/lists/:id', () => {
  it('LIST-07 renames a list and changes only the color when only the color is sent', async () => {
    const { owner, workspaceId } = await setup()
    const list = await createList(owner, workspaceId, 'Old', 1)
    const renamed = await call('PATCH', `/api/lists/${list.id}`, owner.token, workspaceId, { name: 'New' })
    expect(renamed.statusCode).toBe(200)
    expect(renamed.json()).toMatchObject({ name: 'New', color: 1 })
    const recolored = await call('PATCH', `/api/lists/${list.id}`, owner.token, workspaceId, { color: 6 })
    expect(recolored.json()).toMatchObject({ name: 'New', color: 6 })
    expect((await call('GET', `/api/lists/${list.id}`, owner.token, workspaceId)).json()).toMatchObject({ name: 'New', color: 6 })
  })

  it('LIST-08 archives and unarchives a list', async () => {
    const { owner, workspaceId } = await setup()
    const list = await createList(owner, workspaceId)
    expect((await call('PATCH', `/api/lists/${list.id}`, owner.token, workspaceId, { is_archived: true })).json().is_archived).toBe(true)
    expect((await call('GET', '/api/lists', owner.token, workspaceId)).json().lists).toEqual([])
    expect((await call('PATCH', `/api/lists/${list.id}`, owner.token, workspaceId, { is_archived: false })).json().is_archived).toBe(false)
    expect((await call('GET', '/api/lists', owner.token, workspaceId)).json().lists).toHaveLength(1)
  })

  it('LIST-04 answers 422 for an empty name or one of 101 characters', async () => {
    const { owner, workspaceId } = await setup()
    const list = await createList(owner, workspaceId)
    for (const name of ['', 'x'.repeat(101)]) {
      const reply = await call('PATCH', `/api/lists/${list.id}`, owner.token, workspaceId, { name })
      expect(reply.statusCode).toBe(422)
      expect(reply.json().detail[0].loc).toEqual(['body', 'name'])
    }
    expect((await call('GET', `/api/lists/${list.id}`, owner.token, workspaceId)).json().name).toBe('Work')
  })

  it('LIST-10 answers 403 to a viewer and LIST-11 404 for a list of another workspace', async () => {
    const { owner, viewer, workspaceId, stranger, strangerWorkspaceId } = await setup()
    const list = await createList(owner, workspaceId)
    const refused = await call('PATCH', `/api/lists/${list.id}`, viewer.token, workspaceId, { name: 'Nope' })
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual(READ_ONLY)
    const foreign = await call('PATCH', `/api/lists/${list.id}`, stranger.token, strangerWorkspaceId, { name: 'Nope' })
    expect(foreign.statusCode).toBe(404)
    expect((await call('GET', `/api/lists/${list.id}`, owner.token, workspaceId)).json().name).toBe('Work')
  })
})

describe('POST /api/lists/:id/move', () => {
  it('LIST-06 moves a list before another one and keeps the new order', async () => {
    const { owner, workspaceId } = await setup()
    const a = await createList(owner, workspaceId, 'A')
    await createList(owner, workspaceId, 'B')
    const c = await createList(owner, workspaceId, 'C')
    const moved = await call('POST', `/api/lists/${c.id}/move`, owner.token, workspaceId, { before_list_id: a.id })
    expect(moved.statusCode).toBe(204)
    const names = (await call('GET', '/api/lists', owner.token, workspaceId)).json().lists.map((list: { name: string }) => list.name)
    expect(names).toEqual(['C', 'A', 'B'])
    await call('POST', `/api/lists/${c.id}/move`, owner.token, workspaceId, { before_list_id: null })
    const again = (await call('GET', '/api/lists', owner.token, workspaceId)).json().lists.map((list: { name: string }) => list.name)
    expect(again).toEqual(['A', 'B', 'C'])
  })

  it('answers 422 for a before_list_id that is not a UUID, 403 to a viewer and 404 across workspaces', async () => {
    const { owner, viewer, workspaceId, stranger, strangerWorkspaceId } = await setup()
    const a = await createList(owner, workspaceId, 'A')
    const theirs = await createList(stranger, strangerWorkspaceId, 'Theirs')

    const invalid = await call('POST', `/api/lists/${a.id}/move`, owner.token, workspaceId, { before_list_id: 'x' })
    expect(invalid.statusCode).toBe(422)
    const refused = await call('POST', `/api/lists/${a.id}/move`, viewer.token, workspaceId, { before_list_id: null })
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual(READ_ONLY)
    const foreign = await call('POST', `/api/lists/${a.id}/move`, stranger.token, strangerWorkspaceId, { before_list_id: null })
    expect(foreign.statusCode).toBe(404)
    const foreignTarget = await call('POST', `/api/lists/${a.id}/move`, owner.token, workspaceId, { before_list_id: theirs.id })
    expect(foreignTarget.statusCode).toBe(404)
  })
})

describe('DELETE /api/lists/:id', () => {
  it('LIST-09 deletes the list and GET /api/lists/:id then answers 404', async () => {
    const { owner, workspaceId } = await setup()
    const list = await createList(owner, workspaceId)
    expect((await call('DELETE', `/api/lists/${list.id}`, owner.token, workspaceId)).statusCode).toBe(204)
    const gone = await call('GET', `/api/lists/${list.id}`, owner.token, workspaceId)
    expect(gone.statusCode).toBe(404)
    expect(gone.json()).toEqual({ detail: 'List not found' })
  })

  it('LIST-10 answers 403 to a viewer and LIST-11 404 for a list of another workspace, keeping the list', async () => {
    const { owner, viewer, workspaceId, stranger, strangerWorkspaceId } = await setup()
    const list = await createList(owner, workspaceId)
    const refused = await call('DELETE', `/api/lists/${list.id}`, viewer.token, workspaceId)
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual(READ_ONLY)
    expect((await call('DELETE', `/api/lists/${list.id}`, stranger.token, strangerWorkspaceId)).statusCode).toBe(404)
    expect((await call('DELETE', `/api/lists/${randomUUID()}`, owner.token, workspaceId)).statusCode).toBe(404)
    expect((await call('GET', `/api/lists/${list.id}`, owner.token, workspaceId)).statusCode).toBe(200)
  })
})
