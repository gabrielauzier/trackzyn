import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { completedBy, inWorkspace, ownerViewerStranger } from '../support/roles.ts'
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

const action = (extra: Record<string, unknown> = {}) => ({ action_id: randomUUID(), occurred_at: new Date().toISOString(), device_id: 'A', ...extra })

async function setup() {
  const roles = await ownerViewerStranger(t)
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${roles.workspaceId}`, headers: bearer(roles.owner.token), payload: { timezone: 'UTC' } })
  const listId = (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
  const post = async (body: object) => {
    const reply = await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, column: 'today', ...body })
    expect(reply.statusCode).toBe(201)
    return reply.json().id as string
  }
  const focus = (path: string, body: object) => call('POST', `/api/focus/${path}`, roles.owner.token, roles.workspaceId, body)
  return { ...roles, listId, post, focus }
}

describe('REM-05 a reminder has no focus', () => {
  it('POST /api/focus/start with a reminder in Today answers 422 Reminders have no focus and opens nothing', async () => {
    const { owner, workspaceId, listId, post, focus } = await setup()
    const reminder = await post({ title: 'Pagar o DAS', kind: 'reminder' })
    const refused = await focus('start', action({ task_id: reminder }))
    expect(refused.statusCode).toBe(422)
    expect(refused.json()).toMatchObject({ detail: 'Reminders have no focus' })
    expect((await call('GET', `/api/focus?list_id=${listId}`, owner.token, workspaceId)).json().session).toBeNull()
  })

  it('POST /api/focus/start with a task in Today still opens its session', async () => {
    const { post, focus } = await setup()
    await post({ title: 'Pagar o DAS', kind: 'reminder' })
    const task = await post({ title: 'Validar', estimate_minutes: 30 })
    const started = await focus('start', action({ task_id: task }))
    expect(started.statusCode).toBe(200)
    expect(started.json().session).toMatchObject({ kind: 'task', task_id: task })
  })

  it('the next automatic focus skips a reminder that sits before the task in Today', async () => {
    const { post, focus } = await setup()
    const first = await post({ title: 'Validar', estimate_minutes: 30 })
    await post({ title: 'Pagar o DAS', kind: 'reminder' })
    const next = await post({ title: 'Revisar', estimate_minutes: 30 })
    await focus('start', action({ task_id: first }))
    const completed = await focus('complete', action({ task_id: first }))
    expect(completed.statusCode).toBe(200)
    expect(completed.json().session).toMatchObject({ kind: 'task', task_id: next })
  })

  it('completing the last task leaves no session when only a reminder is left in Today', async () => {
    const { post, focus } = await setup()
    const only = await post({ title: 'Validar', estimate_minutes: 30 })
    await post({ title: 'Pagar o DAS', kind: 'reminder' })
    await focus('start', action({ task_id: only }))
    const completed = await focus('complete', action({ task_id: only }))
    expect(completed.statusCode).toBe(200)
    expect(completed.json().session).toBeNull()
  })
})

describe('REM-05 the focus screen leaves reminders out', () => {
  it('with a reminder before a task in Today, GET /api/focus shows the task as the focus and does not list the reminder', async () => {
    const { owner, workspaceId, listId, post } = await setup()
    await post({ title: 'Pagar o DAS', kind: 'reminder' })
    const task = await post({ title: 'Validar', estimate_minutes: 30 })
    const state = (await call('GET', `/api/focus?list_id=${listId}`, owner.token, workspaceId)).json()
    expect(state.task).toMatchObject({ id: task, title: 'Validar' })
    expect(state.today.tasks.map((card: { id: string }) => card.id)).toEqual([task])
    expect(state.today.pending).toBe(1)
  })

  it('with only a reminder in Today, the focus has no task', async () => {
    const { owner, workspaceId, listId, post } = await setup()
    await post({ title: 'Pagar o DAS', kind: 'reminder' })
    const state = (await call('GET', `/api/focus?list_id=${listId}`, owner.token, workspaceId)).json()
    expect(state.task).toBeNull()
    expect(state.today.tasks).toEqual([])
  })
})

describe('REM-04 a reminder completes like a task', () => {
  it('moved to Concluídas, it gets completed_at and completed_by', async () => {
    const { owner, workspaceId, post } = await setup()
    const reminder = await post({ title: 'Pagar o DAS', kind: 'reminder' })
    const moved = await call('POST', `/api/tasks/${reminder}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toMatchObject({ kind: 'reminder', column: 'done', completed_at: expect.any(String) })
    expect(await completedBy(t, reminder)).toBe(owner.id)
  })
})

describe('REM-06 the Agenda tags reminders', () => {
  it('GET /api/agenda/scheduled answers kind reminder for a reminder with a time, and kind task for a task', async () => {
    const { owner, workspaceId, post } = await setup()
    const day = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10)
    const reminder = await post({ title: 'Pagar o DAS', column: 'backlog', kind: 'reminder', scheduled_on: day, scheduled_time: '10:00' })
    const task = await post({ title: 'Validar', column: 'backlog', estimate_minutes: 30, scheduled_on: day, scheduled_time: '11:00' })
    const reply = await call('GET', `/api/agenda/scheduled?from=${day}&to=${day}`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json().timed).toEqual([
      expect.objectContaining({ id: reminder, kind: 'reminder', scheduled_time: '10:00', estimate_minutes: null }),
      expect.objectContaining({ id: task, kind: 'task', scheduled_time: '11:00' }),
    ])
  })
})
