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

/** A list with a flagged task in Esta semana and another one, flagged too, in Hoje. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const listId = (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
  const post = async (body: object) =>
    (await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, ...body })).json().id as string
  const taskId = await post({ title: 'Deploy', column: 'this_week', flagged: true, flag_reason: 'Esperando acesso' })
  const todayId = await post({ title: 'Revisar', column: 'today', estimate_minutes: 30, flagged: true, flag_reason: 'Com dúvida' })
  const read = async (id: string) => (await call('GET', `/api/tasks/${id}`, roles.owner.token, roles.workspaceId)).json()
  const move = (id: string, column: string) =>
    call('POST', `/api/tasks/${id}/move`, roles.owner.token, roles.workspaceId, { column, before_task_id: null })
  return { ...roles, listId, taskId, todayId, post, read, move }
}

async function addGroup(listId: string) {
  const id = randomUUID()
  const now = new Date()
  await t.ctx.db.insert(taskGroups).values({ id, listId, name: 'Pipeline', createdAt: now, updatedAt: now })
  return id
}

describe('FLAG-05 the flag leaves on completion', () => {
  it('a flagged task moved to Concluídas has no flag and no reason, and moved back it still has none', async () => {
    const { taskId, read, move } = await setup()
    const done = await move(taskId, 'done')
    expect(done.statusCode).toBe(200)
    expect(done.json()).toMatchObject({ column: 'done', flagged: false, flag_reason: null })
    const back = await move(taskId, 'this_week')
    expect(back.json()).toMatchObject({ column: 'this_week', flagged: false, flag_reason: null })
    expect(await read(taskId)).toMatchObject({ flagged: false, flag_reason: null })
  })

  it('moving to another open column keeps the flag and the reason', async () => {
    const { taskId, move } = await setup()
    const moved = await move(taskId, 'today')
    expect(moved.json()).toMatchObject({ column: 'today', flagged: true, flag_reason: 'Esperando acesso' })
  })

  it('completing from the focus also takes the flag off, and another flagged task keeps its own', async () => {
    const { owner, workspaceId, taskId, todayId, read } = await setup()
    const action = (extra: object) => ({ action_id: randomUUID(), occurred_at: new Date().toISOString(), device_id: 'A', ...extra })
    expect((await call('POST', '/api/focus/start', owner.token, workspaceId, action({ task_id: todayId }))).statusCode).toBe(200)
    const completed = await call('POST', '/api/focus/complete', owner.token, workspaceId, action({ task_id: todayId }))
    expect(completed.statusCode).toBe(200)
    expect(await read(todayId)).toMatchObject({ column: 'done', flagged: false, flag_reason: null })
    expect(await read(taskId)).toMatchObject({ flagged: true, flag_reason: 'Esperando acesso' })
  })
})

describe('EDGE-04 the group leaves on a change of list', () => {
  it('a task of a group moved to another list has no group, and another task of the same group stays in it', async () => {
    const { owner, workspaceId, listId, post, read } = await setup()
    const groupId = await addGroup(listId)
    const leaving = await post({ title: 'Script 1', column: 'this_week', group_id: groupId })
    const staying = await post({ title: 'Script 2', column: 'this_week', group_id: groupId })
    const other = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Home', color: 2 })).json().id as string

    const moved = await call('POST', `/api/tasks/${leaving}/move-to-list`, owner.token, workspaceId, { list_id: other })
    expect(moved.statusCode).toBe(200)
    expect(moved.json()).toMatchObject({ list_id: other, group_id: null })
    expect(await read(leaving)).toMatchObject({ list_id: other, group_id: null })
    expect(await read(staying)).toMatchObject({ list_id: listId, group_id: groupId })
  })
})
