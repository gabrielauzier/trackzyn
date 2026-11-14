import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { taskGroups } from '../../src/db/schema.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, createTestApp } from '../support/test-app.ts'

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
  const post = async (body: object, list = listId) => {
    const reply = await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: list, ...body })
    expect(reply.statusCode).toBe(201)
    return reply.json().id as string
  }
  const board = async (list = listId) => {
    const reply = await call('GET', `/api/lists/${list}/board`, roles.owner.token, roles.workspaceId)
    expect(reply.statusCode).toBe(200)
    return reply.json()
  }
  return { ...roles, listId, newList, post, board }
}

async function addGroup(listId: string, values: { name: string; priority?: 'none' | 'low' | 'medium' | 'high' | 'ultra'; dueOn?: string | null }) {
  const id = randomUUID()
  const now = new Date()
  await t.ctx.db.insert(taskGroups).values({ id, listId, createdAt: now, updatedAt: now, ...values })
  return id
}

describe('GET /api/lists/:id/board with the caixa-de-entrada fields', () => {
  it('API-01 each new field comes filled on the card', async () => {
    const { listId, post, board } = await setup()
    const groupId = await addGroup(listId, { name: 'Pipeline' })
    const id = await post({
      title: 'Deploy',
      column: 'backlog',
      priority: 'high',
      due_on: '2026-11-20',
      waiting: true,
      waiting_for: 'Ana',
      flagged: true,
      flag_reason: 'Sem acesso',
      group_id: groupId,
    })
    const reminder = await post({ title: 'Pagar o DAS', column: 'backlog', kind: 'reminder' })
    const cards = (await board()).columns.backlog.tasks
    expect(cards.find((card: { id: string }) => card.id === id)).toMatchObject({
      kind: 'task',
      priority: 'high',
      due_on: '2026-11-20',
      waiting: true,
      waiting_for: 'Ana',
      flagged: true,
      flag_reason: 'Sem acesso',
      group_id: groupId,
    })
    expect(cards.find((card: { id: string }) => card.id === reminder)).toMatchObject({
      kind: 'reminder',
      priority: 'none',
      due_on: null,
      waiting: false,
      waiting_for: null,
      flagged: false,
      flag_reason: null,
      group_id: null,
    })
  })

  it('API-01 groups has id, name, priority and due day of the groups of the list, and not those of another list', async () => {
    const { listId, newList, board } = await setup()
    const first = await addGroup(listId, { name: 'Pipeline', priority: 'ultra', dueOn: '2026-11-30' })
    const second = await addGroup(listId, { name: 'Mudança' })
    await addGroup(await newList('Home'), { name: 'Of another list' })
    const groups = (await board()).groups as Array<{ id: string }>
    expect([...groups].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [
        { id: first, name: 'Pipeline', priority: 'ultra', due_on: '2026-11-30' },
        { id: second, name: 'Mudança', priority: 'none', due_on: null },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    )
  })

  it('a list without groups answers groups empty', async () => {
    const { board } = await setup()
    expect((await board()).groups).toEqual([])
  })
})

describe('WAIT-04 a waiting task stays out of the estimate sums', () => {
  it('Today with two tasks of 60 min, one waiting: the column and pending sum 60', async () => {
    const { post, board } = await setup()
    await post({ title: 'A', column: 'today', estimate_minutes: 60 })
    await post({ title: 'B', column: 'today', estimate_minutes: 60, waiting: true, waiting_for: 'Fulano' })
    const result = await board()
    expect(result.columns.today.estimate_minutes).toBe(60)
    expect(result.pending.estimate_minutes).toBe(60)
    expect(result.columns.today.tasks).toHaveLength(2)
  })

  it('Esta semana with two tasks of 60 min, one waiting: the column sums 60', async () => {
    const { post, board } = await setup()
    await post({ title: 'A', column: 'this_week', estimate_minutes: 60 })
    await post({ title: 'B', column: 'this_week', estimate_minutes: 60, waiting: true })
    const result = await board()
    expect(result.columns.this_week.estimate_minutes).toBe(60)
    expect(result.pending.estimate_minutes).toBe(60)
  })

  it('Backlog with two tasks of 60 min, one waiting: the column sums 60', async () => {
    const { post, board } = await setup()
    await post({ title: 'A', column: 'backlog', estimate_minutes: 60 })
    await post({ title: 'B', column: 'backlog', estimate_minutes: 60, waiting: true })
    const result = await board()
    expect(result.columns.backlog.estimate_minutes).toBe(60)
    expect(result.pending.estimate_minutes).toBe(60)
  })

  it('unmarking Aguardando brings the estimate back to the sum', async () => {
    const { owner, workspaceId, post, board } = await setup()
    await post({ title: 'A', column: 'today', estimate_minutes: 60 })
    const waiting = await post({ title: 'B', column: 'today', estimate_minutes: 60, waiting: true })
    await call('PATCH', `/api/tasks/${waiting}`, owner.token, workspaceId, { waiting: false })
    expect((await board()).columns.today.estimate_minutes).toBe(120)
  })
})
