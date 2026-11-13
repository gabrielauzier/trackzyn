import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { createGroup } from '../../src/services/groups.ts'
import { completedBy, inWorkspace, ownerViewerStranger } from '../support/roles.ts'
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

type Column = 'backlog' | 'this_week' | 'today' | 'done'

/** The list of `setup` with the group Pipeline, and helpers to add tasks and read a column's order by title. */
async function withGroup() {
  const base = await setup()
  const { owner, workspaceId, listId } = base
  const group = await createGroup(t.ctx.db as Database, listId, { name: 'Pipeline' })
  const titles = new Map<string, string>()
  const ids = new Map<string, string>()
  const add = async (title: string, column: Column, extra: object = {}) => {
    const reply = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title, column, ...extra })
    expect(reply.statusCode, reply.body).toBe(201)
    titles.set(reply.json().id, title)
    ids.set(title, reply.json().id)
  }
  const id = (title: string) => ids.get(title)!
  const order = async (column: Exclude<Column, 'done'>) => {
    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    return (board.columns[column].tasks as Array<{ id: string }>).map((card) => titles.get(card.id))
  }
  const moveGroup = (body: object, token = owner.token) => call('POST', `/api/groups/${group.id}/move`, token, workspaceId, body)
  return { ...base, group, add, id, order, moveGroup }
}

describe('GRP-09 POST /api/groups/:id/move', () => {
  it('takes the three tasks of the group in Esta semana to Hoje before a loose task, in the same order; the one in Backlog stays', async () => {
    const { group, add, id, order, moveGroup } = await withGroup()
    await add('g1', 'this_week', { group_id: group.id })
    await add('w', 'this_week')
    await add('g2', 'this_week', { group_id: group.id })
    await add('g3', 'this_week', { group_id: group.id })
    await add('gb', 'backlog', { group_id: group.id })
    await add('a', 'today')
    await add('b', 'today')
    // The block of Esta semana is g1, g2, g3 once the tasks of the group are joined (AD-013).
    expect(await order('this_week')).toEqual(['g1', 'g2', 'g3', 'w'])

    const reply = await moveGroup({ from: 'this_week', to: 'today', before_task_id: id('b') })

    expect(reply.statusCode).toBe(200)
    expect(reply.json().tasks.map((task: { title: string; column: string }) => [task.title, task.column])).toEqual([
      ['g1', 'today'],
      ['g2', 'today'],
      ['g3', 'today'],
    ])
    expect(await order('today')).toEqual(['a', 'g1', 'g2', 'g3', 'b'])
    expect(await order('this_week')).toEqual(['w'])
    expect(await order('backlog')).toEqual(['gb'])
  })

  it('to Concluídas, each task gets completed_at and completed_by and loses its flag', async () => {
    const { owner, workspaceId, group, add, id, moveGroup } = await withGroup()
    await add('g1', 'today', { group_id: group.id, flagged: true, flag_reason: 'Bloqueada' })
    await add('g2', 'today', { group_id: group.id })

    const reply = await moveGroup({ from: 'today', to: 'done', before_task_id: null })

    expect(reply.statusCode).toBe(200)
    for (const title of ['g1', 'g2']) {
      const task = (await call('GET', `/api/tasks/${id(title)}`, owner.token, workspaceId)).json()
      expect(task).toMatchObject({ column: 'done', completed_at: expect.any(String), flagged: false, flag_reason: null, group_id: group.id })
      expect(await completedBy(t, id(title))).toBe(owner.id)
    }
    expect(reply.json().group_without_next_action).toEqual({ id: group.id, name: 'Pipeline' })
  })

  it('a viewer answers 403', async () => {
    const { viewer, group, add, moveGroup } = await withGroup()
    await add('g1', 'today', { group_id: group.id })
    expect((await moveGroup({ from: 'today', to: 'this_week', before_task_id: null }, viewer.token)).statusCode).toBe(403)
  })

  it('a token answers 403, even with every scope', async () => {
    const { owner, workspaceId, group, add, order } = await withGroup()
    await add('g1', 'today', { group_id: group.id })
    const token = await mintToken(t, owner.token, workspaceId)
    const reply = await t.app.inject({
      method: 'POST',
      url: `/api/groups/${group.id}/move`,
      headers: bearer(token.value),
      payload: { from: 'today', to: 'this_week', before_task_id: null },
    })
    expect(reply.statusCode).toBe(403)
    expect(await order('today')).toEqual(['g1'])
  })

  it('a group of another workspace answers 404', async () => {
    const { stranger, strangerWorkspaceId, group, add } = await withGroup()
    await add('g1', 'today', { group_id: group.id })
    const reply = await call('POST', `/api/groups/${group.id}/move`, stranger.token, strangerWorkspaceId, { from: 'today', to: 'done', before_task_id: null })
    expect(reply.statusCode).toBe(404)
  })
})
