import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { createGroup } from '../../src/services/groups.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

async function setup() {
  const roles = await ownerViewerStranger(t)
  const newList = async (name: string) =>
    (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name, color: 1 })).json().id as string
  const listId = await newList('Work')
  const otherListId = await newList('Home')
  return { ...roles, listId, otherListId }
}

describe('GET /api/lists/:id/groups (MODAL-04)', () => {
  it('answers the groups of the list, oldest first, and not those of another list of the workspace', async () => {
    const { owner, workspaceId, listId, otherListId } = await setup()
    const db = t.ctx.db as Database
    const first = await createGroup(db, listId, { name: 'Pipeline', priority: 'high', dueOn: '2026-12-01' }, new Date('2026-11-13T10:00:00Z'))
    const second = await createGroup(db, listId, { name: 'Mudança' }, new Date('2026-11-13T11:00:00Z'))
    await createGroup(db, otherListId, { name: 'Da outra lista' })

    const reply = await call('GET', `/api/lists/${listId}/groups`, owner.token, workspaceId)

    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual([
      { id: first.id, list_id: listId, name: 'Pipeline', notes: null, priority: 'high', due_on: '2026-12-01', created_at: '2026-11-13T10:00:00.000Z' },
      { id: second.id, list_id: listId, name: 'Mudança', notes: null, priority: 'none', due_on: null, created_at: '2026-11-13T11:00:00.000Z' },
    ])
  })

  it('a viewer reads them too', async () => {
    const { viewer, workspaceId, listId } = await setup()
    await createGroup(t.ctx.db as Database, listId, { name: 'Pipeline' })
    const reply = await call('GET', `/api/lists/${listId}/groups`, viewer.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json().map((group: { name: string }) => group.name)).toEqual(['Pipeline'])
  })

  it('a list of another workspace answers 404', async () => {
    const { stranger, strangerWorkspaceId, listId } = await setup()
    await createGroup(t.ctx.db as Database, listId, { name: 'Pipeline' })
    const reply = await call('GET', `/api/lists/${listId}/groups`, stranger.token, strangerWorkspaceId)
    expect(reply.statusCode).toBe(404)
  })

  it('a token with tasks:read reads them', async () => {
    const { owner, workspaceId, listId } = await setup()
    await createGroup(t.ctx.db as Database, listId, { name: 'Pipeline' })
    const token = await mintToken(t, owner.token, workspaceId, ['tasks:read'])
    const reply = await t.app.inject({ method: 'GET', url: `/api/lists/${listId}/groups`, headers: bearer(token.value) })
    expect(reply.statusCode).toBe(200)
    expect(reply.json().map((group: { name: string }) => group.name)).toEqual(['Pipeline'])
  })
})
