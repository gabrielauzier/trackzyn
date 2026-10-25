import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type User, completedBy, inWorkspace, invite, ownerViewerStranger } from '../support/roles.ts'
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

const READ_ONLY = { detail: 'Read-only role' }

/** The roles plus one list with one task (and one subtask) in the owner's workspace. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const list = await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })
  const listId = list.json().id as string
  const task = await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, {
    list_id: listId,
    title: 'Write',
    estimate_minutes: 30,
    column: 'today',
  })
  expect(task.statusCode).toBe(201)
  const taskId = task.json().id as string
  const subtask = await call('POST', `/api/tasks/${taskId}/subtasks`, roles.owner.token, roles.workspaceId, { title: 'Outline' })
  expect(subtask.statusCode).toBe(201)
  return { ...roles, listId, taskId, subtaskId: subtask.json().id as string }
}

const getTask = (user: User, workspaceId: string, taskId: string) => call('GET', `/api/tasks/${taskId}`, user.token, workspaceId)

describe('POST /api/tasks', () => {
  it('TASK-01 creates a task at the end of the column with title and estimate, or without an estimate', async () => {
    const { owner, workspaceId, listId } = await setup()
    const reply = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'x'.repeat(255), estimate_minutes: 87, column: 'today' })
    expect(reply.statusCode).toBe(201)
    expect(reply.json()).toEqual({
      id: expect.any(String),
      list_id: listId,
      title: 'x'.repeat(255),
      notes: '',
      estimate_minutes: 87,
      column: 'today',
      position: 1,
      completed_at: null,
      created_at: expect.any(String),
      subtasks: [],
    })
    const none = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'No estimate', column: 'backlog' })
    expect(none.json()).toMatchObject({ estimate_minutes: null, column: 'backlog', position: 0 })
  })

  it('TASK-02 answers 422 for an empty title, a title of 256 characters and an estimate of 0 or 1441', async () => {
    const { owner, workspaceId, listId } = await setup()
    const post = (body: object) => call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, column: 'today', ...body })

    const empty = await post({ title: '' })
    expect(empty.statusCode).toBe(422)
    expect(empty.json().detail).toEqual([{ type: 'string_too_short', loc: ['body', 'title'], msg: 'String should have at least 1 characters' }])
    const long = await post({ title: 'x'.repeat(256) })
    expect(long.statusCode).toBe(422)
    expect(long.json().detail).toEqual([{ type: 'string_too_long', loc: ['body', 'title'], msg: 'String should have at most 255 characters' }])
    for (const estimate of [0, 1441]) {
      const reply = await post({ title: 'ok', estimate_minutes: estimate })
      expect(reply.statusCode, String(estimate)).toBe(422)
      expect(reply.json().detail[0].loc).toEqual(['body', 'estimate_minutes'])
    }
    expect((await post({ title: 'ok', column: 'later' })).statusCode).toBe(422)
    expect((await post({ title: 'ok', estimate_minutes: 1440 })).statusCode).toBe(201)
  })

  it('BOARD-15 answers 403 Read-only role to a viewer, 404 for a list of another workspace and 422 for a list id that is not a UUID', async () => {
    const { owner, viewer, workspaceId, listId, stranger, strangerWorkspaceId } = await setup()
    const refused = await call('POST', '/api/tasks', viewer.token, workspaceId, { list_id: listId, title: 'x', column: 'today' })
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual(READ_ONLY)
    const foreign = await call('POST', '/api/tasks', stranger.token, strangerWorkspaceId, { list_id: listId, title: 'x', column: 'today' })
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toEqual({ detail: 'List not found' })
    const invalid = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: 'nope', title: 'x', column: 'today' })
    expect(invalid.statusCode).toBe(422)
    expect(invalid.json().detail[0]).toMatchObject({ loc: ['body', 'list_id'], msg: 'Input should be a valid UUID' })
  })
})

describe('GET /api/tasks/:id', () => {
  it('TASK-03 reads a task with notes and subtasks, also for a viewer; 404 for another workspace; 422 for a non-UUID id', async () => {
    const { viewer, workspaceId, taskId, subtaskId, stranger, strangerWorkspaceId } = await setup()
    const read = await getTask(viewer, workspaceId, taskId)
    expect(read.statusCode).toBe(200)
    expect(read.json()).toMatchObject({
      id: taskId,
      title: 'Write',
      notes: '',
      subtasks: [{ id: subtaskId, task_id: taskId, title: 'Outline', done: false, position: 0 }],
    })
    const foreign = await getTask(stranger, strangerWorkspaceId, taskId)
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toEqual({ detail: 'Task not found' })
    const invalid = await call('GET', '/api/tasks/123', viewer.token, workspaceId)
    expect(invalid.statusCode).toBe(422)
    expect(invalid.json().detail[0]).toMatchObject({ loc: ['path', 'task_id'], msg: 'Input should be a valid UUID' })
  })
})

describe('PATCH /api/tasks/:id', () => {
  it('TASK-03 edits title, estimate and notes, and clears the estimate with null', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const notes = 'n'.repeat(10_000)
    const edited = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { title: 'Rewrite', estimate_minutes: 90, notes })
    expect(edited.statusCode).toBe(200)
    expect(edited.json()).toMatchObject({ title: 'Rewrite', estimate_minutes: 90, notes })
    const cleared = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { estimate_minutes: null })
    expect(cleared.json()).toMatchObject({ title: 'Rewrite', estimate_minutes: null, notes })
  })

  it('TASK-04 answers 422 for notes of 10 001 characters and does not save; TASK-02 the same for title and estimate', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const patch = (body: object) => call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, body)
    const notes = await patch({ notes: 'n'.repeat(10_001) })
    expect(notes.statusCode).toBe(422)
    expect(notes.json().detail).toEqual([{ type: 'string_too_long', loc: ['body', 'notes'], msg: 'String should have at most 10000 characters' }])
    for (const body of [{ title: '' }, { title: 'x'.repeat(256) }, { estimate_minutes: 0 }, { estimate_minutes: 1441 }]) {
      expect((await patch(body)).statusCode, JSON.stringify(body).slice(0, 40)).toBe(422)
    }
    expect((await getTask(owner, workspaceId, taskId)).json()).toMatchObject({ title: 'Write', estimate_minutes: 30, notes: '' })
  })

  it('BOARD-15 answers 403 to a viewer and 404 for another workspace', async () => {
    const { viewer, workspaceId, taskId, stranger, strangerWorkspaceId } = await setup()
    const refused = await call('PATCH', `/api/tasks/${taskId}`, viewer.token, workspaceId, { title: 'x' })
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual(READ_ONLY)
    expect((await call('PATCH', `/api/tasks/${taskId}`, stranger.token, strangerWorkspaceId, { title: 'x' })).statusCode).toBe(404)
  })
})

describe('POST /api/tasks/:id/move', () => {
  it('BOARD-07 moving to done records completed_at, and BOARD-08 moving back clears it', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const done = await call('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
    expect(done.statusCode).toBe(200)
    expect(done.json()).toMatchObject({ column: 'done', position: 0 })
    expect(Date.parse(done.json().completed_at)).not.toBeNaN()
    const back = await call('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'today', before_task_id: null })
    expect(back.json()).toMatchObject({ id: taskId, column: 'today', completed_at: null, estimate_minutes: 30 })
  })

  it('AD-006 records who moved the task to done, keeps it when reordered inside done and clears it on the way back', async () => {
    const { owner, workspaceId, listId, taskId } = await setup()
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    expect(await completedBy(t, taskId)).toBeNull()

    const done = await call('POST', `/api/tasks/${taskId}/move`, editor.token, workspaceId, { column: 'done', before_task_id: null })
    expect(done.statusCode).toBe(200)
    expect(await completedBy(t, taskId)).toBe(editor.id)

    const created = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Already done', column: 'done' })
    expect(created.statusCode).toBe(201)
    expect(await completedBy(t, created.json().id)).toBe(owner.id)
    await call('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'done', before_task_id: created.json().id })
    expect(await completedBy(t, taskId)).toBe(editor.id)

    const back = await call('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'today', before_task_id: null })
    expect(back.statusCode).toBe(200)
    expect(await completedBy(t, taskId)).toBeNull()
  })

  it('BOARD-03 moves a task before another one and keeps the order on the next read', async () => {
    const { owner, workspaceId, listId, taskId } = await setup()
    const other = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Other', column: 'backlog' })
    const moved = await call('POST', `/api/tasks/${other.json().id}/move`, owner.token, workspaceId, { column: 'today', before_task_id: taskId })
    expect(moved.json()).toMatchObject({ column: 'today', position: 0 })
    expect((await getTask(owner, workspaceId, taskId)).json().position).toBe(1)
  })

  it('answers 422 for a bad column or before id, 403 to a viewer and 404 for another workspace', async () => {
    const { owner, viewer, workspaceId, taskId, stranger, strangerWorkspaceId } = await setup()
    const move = (user: User, ws: string, body: object) => call('POST', `/api/tasks/${taskId}/move`, user.token, ws, body)
    expect((await move(owner, workspaceId, { column: 'later', before_task_id: null })).statusCode).toBe(422)
    expect((await move(owner, workspaceId, { column: 'today', before_task_id: 'x' })).statusCode).toBe(422)
    const refused = await move(viewer, workspaceId, { column: 'done', before_task_id: null })
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual(READ_ONLY)
    expect((await move(stranger, strangerWorkspaceId, { column: 'done', before_task_id: null })).statusCode).toBe(404)
    expect((await getTask(owner, workspaceId, taskId)).json()).toMatchObject({ column: 'today', completed_at: null })
  })
})

describe('DELETE /api/tasks/:id', () => {
  it('TASK-05 deletes the task with its subtasks and GET /api/tasks/:id then answers 404', async () => {
    const { owner, workspaceId, taskId, subtaskId } = await setup()
    expect((await call('DELETE', `/api/tasks/${taskId}`, owner.token, workspaceId)).statusCode).toBe(204)
    const gone = await getTask(owner, workspaceId, taskId)
    expect(gone.statusCode).toBe(404)
    expect(gone.json()).toEqual({ detail: 'Task not found' })
    expect((await call('PATCH', `/api/subtasks/${subtaskId}`, owner.token, workspaceId, { done: true })).statusCode).toBe(404)
  })

  it('BOARD-15 answers 403 to a viewer and 404 for another workspace, keeping the task', async () => {
    const { owner, viewer, workspaceId, taskId, stranger, strangerWorkspaceId } = await setup()
    const refused = await call('DELETE', `/api/tasks/${taskId}`, viewer.token, workspaceId)
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual(READ_ONLY)
    expect((await call('DELETE', `/api/tasks/${taskId}`, stranger.token, strangerWorkspaceId)).statusCode).toBe(404)
    expect((await call('DELETE', `/api/tasks/${randomUUID()}`, owner.token, workspaceId)).statusCode).toBe(404)
    expect((await getTask(owner, workspaceId, taskId)).statusCode).toBe(200)
  })
})

describe('subtask routes', () => {
  it('TASK-06 adds, renames, checks and deletes a subtask', async () => {
    const { owner, workspaceId, taskId, subtaskId } = await setup()
    const added = await call('POST', `/api/tasks/${taskId}/subtasks`, owner.token, workspaceId, { title: 'Draft' })
    expect(added.json()).toMatchObject({ task_id: taskId, title: 'Draft', done: false, position: 1 })
    const checked = await call('PATCH', `/api/subtasks/${subtaskId}`, owner.token, workspaceId, { done: true })
    expect(checked.statusCode).toBe(200)
    expect(checked.json()).toMatchObject({ id: subtaskId, title: 'Outline', done: true })
    const renamed = await call('PATCH', `/api/subtasks/${subtaskId}`, owner.token, workspaceId, { title: 'Outline v2' })
    expect(renamed.json()).toMatchObject({ title: 'Outline v2', done: true })
    expect((await call('DELETE', `/api/subtasks/${added.json().id}`, owner.token, workspaceId)).statusCode).toBe(204)
    expect((await getTask(owner, workspaceId, taskId)).json().subtasks).toEqual([
      { id: subtaskId, task_id: taskId, title: 'Outline v2', done: true, position: 0 },
    ])
  })

  it('TASK-07 answers 422 for an empty subtask title or one of 256 characters', async () => {
    const { owner, workspaceId, taskId, subtaskId } = await setup()
    for (const title of ['', 'x'.repeat(256)]) {
      const created = await call('POST', `/api/tasks/${taskId}/subtasks`, owner.token, workspaceId, { title })
      expect(created.statusCode).toBe(422)
      expect(created.json().detail[0].loc).toEqual(['body', 'title'])
      const renamed = await call('PATCH', `/api/subtasks/${subtaskId}`, owner.token, workspaceId, { title })
      expect(renamed.statusCode).toBe(422)
    }
    expect((await getTask(owner, workspaceId, taskId)).json().subtasks.map((s: { title: string }) => s.title)).toEqual(['Outline'])
  })

  it('BOARD-15 answers 403 to a viewer on every subtask write, 404 for another workspace and 422 for a non-UUID id', async () => {
    const { owner, viewer, workspaceId, taskId, subtaskId, stranger, strangerWorkspaceId } = await setup()
    const writes = [
      () => call('POST', `/api/tasks/${taskId}/subtasks`, viewer.token, workspaceId, { title: 'x' }),
      () => call('PATCH', `/api/subtasks/${subtaskId}`, viewer.token, workspaceId, { done: true }),
      () => call('DELETE', `/api/subtasks/${subtaskId}`, viewer.token, workspaceId),
    ]
    for (const write of writes) {
      const reply = await write()
      expect(reply.statusCode).toBe(403)
      expect(reply.json()).toEqual(READ_ONLY)
    }
    expect((await call('POST', `/api/tasks/${taskId}/subtasks`, stranger.token, strangerWorkspaceId, { title: 'x' })).statusCode).toBe(404)
    const foreignPatch = await call('PATCH', `/api/subtasks/${subtaskId}`, stranger.token, strangerWorkspaceId, { done: true })
    expect(foreignPatch.statusCode).toBe(404)
    expect(foreignPatch.json()).toEqual({ detail: 'Subtask not found' })
    expect((await call('DELETE', `/api/subtasks/${subtaskId}`, stranger.token, strangerWorkspaceId)).statusCode).toBe(404)
    const invalid = await call('PATCH', '/api/subtasks/nope', owner.token, workspaceId, { done: true })
    expect(invalid.statusCode).toBe(422)
    expect(invalid.json().detail[0]).toMatchObject({ loc: ['path', 'subtask_id'], msg: 'Input should be a valid UUID' })
    expect((await getTask(owner, workspaceId, taskId)).json().subtasks).toMatchObject([{ title: 'Outline', done: false }])
  })
})
