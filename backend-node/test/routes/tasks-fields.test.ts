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

/** A list with two tasks in Esta semana, the first one with 30 min, and a group of that list. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const list = await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })
  const listId = list.json().id as string
  const post = (body: object) => call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, column: 'this_week', ...body })
  const first = (await post({ title: 'Validar', estimate_minutes: 30 })).json()
  const second = (await post({ title: 'Revisar' })).json()
  const groupId = await addGroup(listId)
  return { ...roles, listId, taskId: first.id as string, otherId: second.id as string, groupId, post }
}

async function addGroup(listId: string) {
  const id = randomUUID()
  const now = new Date()
  await t.ctx.db.insert(taskGroups).values({ id, listId, name: 'Pipeline', createdAt: now, updatedAt: now })
  return id
}

describe('PATCH /api/tasks/:id with the caixa-de-entrada fields', () => {
  it('PRI-01 DUE-01 WAIT-01 FLAG-01 API-01 writes and reads back each new field', async () => {
    const { owner, workspaceId, taskId, groupId } = await setup()
    const patch = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, {
      priority: 'ultra',
      due_on: '2026-11-20',
      waiting: true,
      waiting_for: 'w'.repeat(100),
      flagged: true,
      flag_reason: 'f'.repeat(200),
      group_id: groupId,
    })
    expect(patch.statusCode).toBe(200)
    const expected = {
      kind: 'task',
      priority: 'ultra',
      due_on: '2026-11-20',
      waiting: true,
      waiting_for: 'w'.repeat(100),
      flagged: true,
      flag_reason: 'f'.repeat(200),
      group_id: groupId,
    }
    expect(patch.json()).toMatchObject(expected)
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject(expected)
  })

  it('a task created without the new fields reads kind task, priority none, no due day, not waiting, no flag and no group', async () => {
    const { owner, workspaceId, otherId } = await setup()
    expect((await call('GET', `/api/tasks/${otherId}`, owner.token, workspaceId)).json()).toMatchObject({
      kind: 'task',
      priority: 'none',
      due_on: null,
      waiting: false,
      waiting_for: null,
      flagged: false,
      flag_reason: null,
      group_id: null,
    })
  })

  it('PRI-01 API-03 answers 422 for priority urgent and saves nothing', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { priority: 'urgent', title: 'Changed' })
    expect(reply.statusCode).toBe(422)
    expect(reply.json().detail[0].loc).toEqual(['body', 'priority'])
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ title: 'Validar', priority: 'none' })
  })

  it('WAIT-01 API-03 answers 422 for waiting_for of 101 characters and saves nothing', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { waiting: true, waiting_for: 'w'.repeat(101) })
    expect(reply.statusCode).toBe(422)
    expect(reply.json().detail[0].loc).toEqual(['body', 'waiting_for'])
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ waiting: false, waiting_for: null })
  })

  it('FLAG-01 API-03 answers 422 for flag_reason of 201 characters and saves nothing', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { flagged: true, flag_reason: 'f'.repeat(201) })
    expect(reply.statusCode).toBe(422)
    expect(reply.json().detail[0].loc).toEqual(['body', 'flag_reason'])
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ flagged: false, flag_reason: null })
  })

  it('API-03 answers 422 for a due day that is not a date and for a group of another list', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const badDay = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { due_on: '20/11/2026' })
    expect(badDay.statusCode).toBe(422)
    const other = await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Home', color: 2 })
    const foreignGroup = await addGroup(other.json().id)
    const badGroup = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { group_id: foreignGroup })
    expect(badGroup.statusCode).toBe(422)
    expect(badGroup.json()).toMatchObject({ code: 'group_of_another_list' })
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ due_on: null, group_id: null })
  })

  it('WAIT-03 marking and unmarking Aguardando keeps the column and the position', async () => {
    const { owner, workspaceId, taskId, otherId } = await setup()
    const marked = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { waiting: true, waiting_for: 'Fulano' })
    expect(marked.json()).toMatchObject({ column: 'this_week', position: 0, waiting: true, waiting_for: 'Fulano' })
    const unmarked = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { waiting: false })
    expect(unmarked.json()).toMatchObject({ column: 'this_week', position: 0, waiting: false })
    expect((await call('GET', `/api/tasks/${otherId}`, owner.token, workspaceId)).json()).toMatchObject({ column: 'this_week', position: 1 })
  })

  it('WAIT-05 unmarking Aguardando clears de quem', async () => {
    const { owner, workspaceId, taskId } = await setup()
    await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { waiting: true, waiting_for: 'Fulano' })
    const unmarked = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { waiting: false })
    expect(unmarked.json()).toMatchObject({ waiting: false, waiting_for: null })
  })

  it('WAIT-05 answers 422 for de quem on a task that is not waiting', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { waiting_for: 'Fulano' })
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toMatchObject({ code: 'waiting_for_needs_waiting' })
  })

  it('FLAG-04 taking the flag off clears the reason', async () => {
    const { owner, workspaceId, taskId } = await setup()
    await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { flagged: true, flag_reason: 'Bloqueada' })
    const off = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { flagged: false })
    expect(off.json()).toMatchObject({ flagged: false, flag_reason: null })
  })

  it('FLAG-04 answers 422 for a reason on a task without a flag', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { flag_reason: 'Bloqueada' })
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toMatchObject({ code: 'flag_reason_needs_flag' })
  })

  it('FLAG-06 putting and taking the flag keeps the column, the priority and Aguardando', async () => {
    const { owner, workspaceId, taskId } = await setup()
    await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { priority: 'high', waiting: true, waiting_for: 'Fulano' })
    const kept = { column: 'this_week', position: 0, priority: 'high', waiting: true, waiting_for: 'Fulano' }
    const on = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { flagged: true, flag_reason: 'Bloqueada' })
    expect(on.json()).toMatchObject({ ...kept, flagged: true, flag_reason: 'Bloqueada' })
    const off = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { flagged: false })
    expect(off.json()).toMatchObject({ ...kept, flagged: false, flag_reason: null })
  })

  it('FLAG-05 answers 422 for a flag on a completed task', async () => {
    const { owner, workspaceId, taskId } = await setup()
    await call('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { flagged: true })
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toMatchObject({ code: 'flag_on_done' })
  })

  it('REM-02 answers 422 for an estimate on a reminder, on update and on create', async () => {
    const { owner, workspaceId, post } = await setup()
    const reminder = await post({ title: 'Pagar o DAS', kind: 'reminder' })
    expect(reminder.statusCode).toBe(201)
    expect(reminder.json()).toMatchObject({ kind: 'reminder', estimate_minutes: null })
    const update = await call('PATCH', `/api/tasks/${reminder.json().id}`, owner.token, workspaceId, { estimate_minutes: 30 })
    expect(update.statusCode).toBe(422)
    expect(update.json()).toMatchObject({ code: 'reminder_estimate' })
    const create = await post({ title: 'Pagar o DAS', kind: 'reminder', estimate_minutes: 30 })
    expect(create.statusCode).toBe(422)
    expect(create.json()).toMatchObject({ code: 'reminder_estimate' })
    expect((await call('GET', `/api/tasks/${reminder.json().id}`, owner.token, workspaceId)).json()).toMatchObject({ estimate_minutes: null })
  })

  it('REM-02 answers 422 for turning a task with an estimate into a reminder', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { kind: 'reminder' })
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toMatchObject({ code: 'reminder_estimate' })
  })

  it('MODAL-06 answers 422 reminder_field for a due day, a flag, Aguardando or a group on a reminder, and stores nothing', async () => {
    const { owner, workspaceId, groupId, post } = await setup()
    const id = (await post({ title: 'Pagar o DAS', kind: 'reminder' })).json().id as string
    for (const change of [{ due_on: '2026-11-20' }, { flagged: true }, { waiting: true }, { group_id: groupId }]) {
      const reply = await call('PATCH', `/api/tasks/${id}`, owner.token, workspaceId, change)
      expect(reply.statusCode, JSON.stringify(change)).toBe(422)
      expect(reply.json()).toMatchObject({ code: 'reminder_field' })
    }
    expect((await call('GET', `/api/tasks/${id}`, owner.token, workspaceId)).json()).toMatchObject({
      kind: 'reminder',
      due_on: null,
      flagged: false,
      waiting: false,
      group_id: null,
    })
  })

  it('MODAL-06 answers 422 reminder_field for those fields on the creation of a reminder', async () => {
    const { groupId, post } = await setup()
    for (const fields of [{ due_on: '2026-11-20' }, { flagged: true }, { waiting: true }, { group_id: groupId }]) {
      const reply = await post({ title: 'Pagar o DAS', kind: 'reminder', ...fields })
      expect(reply.statusCode, JSON.stringify(fields)).toBe(422)
      expect(reply.json()).toMatchObject({ code: 'reminder_field' })
    }
  })

  it('MODAL-06 a task accepts each of those fields, and a reminder accepts them cleared', async () => {
    const { owner, workspaceId, otherId, groupId, post } = await setup()
    for (const change of [{ due_on: '2026-11-20' }, { flagged: true }, { waiting: true }, { group_id: groupId }]) {
      const reply = await call('PATCH', `/api/tasks/${otherId}`, owner.token, workspaceId, change)
      expect(reply.statusCode, JSON.stringify(change)).toBe(200)
      expect(reply.json()).toMatchObject(change)
    }
    const reminder = (await post({ title: 'Pagar o DAS', kind: 'reminder' })).json().id as string
    const cleared = await call('PATCH', `/api/tasks/${reminder}`, owner.token, workspaceId, { due_on: null, flagged: false, waiting: false, group_id: null })
    expect(cleared.statusCode).toBe(200)
  })

  it('API-02 POST /api/tasks creates a task with the new fields', async () => {
    const { groupId, post } = await setup()
    const created = await post({ title: 'Deploy', priority: 'low', due_on: '2026-11-30', waiting: true, waiting_for: 'Ana', flagged: true, flag_reason: 'Sem acesso', group_id: groupId })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({
      kind: 'task',
      priority: 'low',
      due_on: '2026-11-30',
      waiting: true,
      waiting_for: 'Ana',
      flagged: true,
      flag_reason: 'Sem acesso',
      group_id: groupId,
    })
  })
})

describe('POST /api/tasks/:id/duplicate with the caixa-de-entrada fields', () => {
  it('copies kind, priority, due day, Aguardando and group, without the flag', async () => {
    const { owner, workspaceId, taskId, groupId } = await setup()
    await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, {
      priority: 'medium',
      due_on: '2026-11-25',
      waiting: true,
      waiting_for: 'Fulano',
      flagged: true,
      flag_reason: 'Bloqueada',
      group_id: groupId,
    })
    const copy = await call('POST', `/api/tasks/${taskId}/duplicate`, owner.token, workspaceId)
    expect(copy.statusCode).toBe(201)
    expect(copy.json()).toMatchObject({
      kind: 'task',
      priority: 'medium',
      due_on: '2026-11-25',
      waiting: true,
      waiting_for: 'Fulano',
      flagged: false,
      flag_reason: null,
      group_id: groupId,
    })
    expect((await call('GET', `/api/tasks/${copy.json().id}`, owner.token, workspaceId)).json()).toMatchObject({ flagged: false, group_id: groupId })
  })

  it('copies a reminder as a reminder', async () => {
    const { owner, workspaceId, post } = await setup()
    const reminder = (await post({ title: 'Pagar o DAS', kind: 'reminder' })).json()
    const copy = await call('POST', `/api/tasks/${reminder.id}/duplicate`, owner.token, workspaceId)
    expect(copy.json()).toMatchObject({ kind: 'reminder', estimate_minutes: null })
  })
})
