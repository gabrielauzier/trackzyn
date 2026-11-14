import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { taskGroups } from '../../src/db/schema.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

const DAY_MS = 24 * 60 * 60_000
const date = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)
const action = (extra: Record<string, unknown> = {}) => ({ action_id: randomUUID(), occurred_at: new Date().toISOString(), device_id: 'A', ...extra })

/** An owner in a UTC workspace with a list and a group of that list; `add` creates a task of the group. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const { owner, workspaceId } = roles
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'UTC' } })
  const listId = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Work', color: 3 })).json().id as string
  const groupId = randomUUID()
  const now = new Date()
  await t.ctx.db.insert(taskGroups).values({ id: groupId, listId, name: 'Pipeline', createdAt: now, updatedAt: now })
  const add = async (body: object) => {
    const reply = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, group_id: groupId, estimate_minutes: 60, ...body })
    expect(reply.statusCode).toBe(201)
    expect(reply.json()).toMatchObject({ group_id: groupId })
    return reply.json().id as string
  }
  /** Starts the focus on `taskId` ten minutes ago. */
  const focusTenMinutes = async (taskId: string) => {
    const started = await call('POST', '/api/focus/start', owner.token, workspaceId, action({ task_id: taskId, occurred_at: new Date(Date.now() - 600_000).toISOString() }))
    expect(started.statusCode).toBe(200)
    return started
  }
  return { ...roles, listId, groupId, add, focusTenMinutes }
}

describe('GRP-11 a task of a group behaves like any task', () => {
  it('in Hoje, it starts the focus and the time counts as spent on the task', async () => {
    const { owner, workspaceId, listId, add, focusTenMinutes } = await setup()
    const taskId = await add({ title: 'Mapear', column: 'today' })

    const started = await focusTenMinutes(taskId)
    expect(started.json().session).toMatchObject({ kind: 'task', task_id: taskId })
    expect((await call('POST', '/api/focus/pause', owner.token, workspaceId, action())).statusCode).toBe(200)

    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    const card = board.columns.today.tasks.find((task: { id: string }) => task.id === taskId)
    expect(card.spent_seconds).toBeGreaterThanOrEqual(600)
    expect(card.spent_seconds).toBeLessThan(660)
  })

  it('scheduled, it shows in GET /api/agenda/scheduled', async () => {
    const { owner, workspaceId, add } = await setup()
    const taskId = await add({ title: 'Escrever', scheduled_on: date(2), scheduled_time: '10:00' })

    const agenda = (await call('GET', `/api/agenda/scheduled?from=${date(0)}&to=${date(13)}`, owner.token, workspaceId)).json()

    expect(agenda.timed).toEqual([expect.objectContaining({ id: taskId, title: 'Escrever', scheduled_on: date(2), scheduled_time: '10:00', kind: 'task' })])
  })

  it('it is a candidate of the plan', async () => {
    const { owner, workspaceId, listId, add } = await setup()
    const taskId = await add({ title: 'Testar', column: 'backlog', estimate_minutes: 45 })

    const reply = await call('GET', `/api/plans/${date(1)}/candidates`, owner.token, workspaceId)

    expect(reply.statusCode).toBe(200)
    expect(reply.json().tasks).toEqual([expect.objectContaining({ id: taskId, title: 'Testar', list: { id: listId, name: 'Work', color: 3 }, estimate_minutes: 45 })])
  })

  it('a session on it counts in the total of the reports', async () => {
    const { owner, workspaceId, listId, add, focusTenMinutes } = await setup()
    const taskId = await add({ title: 'Publicar', column: 'today' })
    await focusTenMinutes(taskId)

    const report = (await call('GET', `/api/reports/overview?from=${date(-1)}&to=${date(1)}`, owner.token, workspaceId)).json()

    expect(report.tiles.task_seconds).toBeGreaterThanOrEqual(600)
    expect(report.tiles.task_seconds).toBeLessThan(660)
    expect(report.by_list).toEqual([{ list_id: listId, name: 'Work', color: 3, is_archived: false, seconds: report.tiles.task_seconds }])
  })
})
