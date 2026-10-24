import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { users, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { createList } from '../../src/services/lists.ts'
import { createSubtask, deleteSubtask, updateSubtask } from '../../src/services/subtasks.ts'
import { createTask, getTask } from '../../src/services/tasks.ts'
import { migratedDb } from '../support/db.ts'

let db: Database
let client: PGlite
let workspaceId: string
let otherWorkspaceId: string
let taskId: string
let otherTaskId: string

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  const userId = randomUUID()
  await db.insert(users).values({ id: userId, email: 'a@b.c', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
  workspaceId = randomUUID()
  otherWorkspaceId = randomUUID()
  await db.insert(workspaces).values([
    { id: workspaceId, name: 'Mine', createdAt: new Date() },
    { id: otherWorkspaceId, name: 'Theirs', createdAt: new Date() },
  ])
  const list = await createList(db, { workspaceId, userId, name: 'Work', color: 1 })
  const otherList = await createList(db, { workspaceId: otherWorkspaceId, userId, name: 'Theirs', color: 1 })
  taskId = (await createTask(db, workspaceId, { listId: list.id, title: 'Write', estimateMinutes: null, column: 'today' })).id
  otherTaskId = (await createTask(db, otherWorkspaceId, { listId: otherList.id, title: 'Theirs', estimateMinutes: null, column: 'today' })).id
})
afterEach(async () => {
  await client.close()
})

const subtaskSummary = async () => (await getTask(db, taskId, workspaceId)).subtasks.map((s) => [s.title, s.done, s.position])

const expect404 = async (promise: Promise<unknown>, detail: string) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ statusCode: 404, detail })
}

describe('subtasks service', () => {
  it('TASK-06 creates subtasks at the end, not done', async () => {
    await createSubtask(db, taskId, workspaceId, 'outline')
    const second = await createSubtask(db, taskId, workspaceId, 'draft')
    expect(second).toMatchObject({ taskId, title: 'draft', done: false, position: 1 })
    expect(await subtaskSummary()).toEqual([
      ['outline', false, 0],
      ['draft', false, 1],
    ])
  })

  it('TASK-06 renames, checks and unchecks a subtask', async () => {
    const subtask = await createSubtask(db, taskId, workspaceId, 'outline')
    expect(await updateSubtask(db, subtask.id, workspaceId, { title: 'outline v2' })).toMatchObject({ title: 'outline v2', done: false })
    expect(await updateSubtask(db, subtask.id, workspaceId, { done: true })).toMatchObject({ title: 'outline v2', done: true })
    expect(await subtaskSummary()).toEqual([['outline v2', true, 0]])
    await updateSubtask(db, subtask.id, workspaceId, { done: false })
    expect(await subtaskSummary()).toEqual([['outline v2', false, 0]])
  })

  it('deletes a subtask', async () => {
    const first = await createSubtask(db, taskId, workspaceId, 'outline')
    await createSubtask(db, taskId, workspaceId, 'draft')
    await deleteSubtask(db, first.id, workspaceId)
    expect(await subtaskSummary()).toEqual([['draft', false, 1]])
  })

  it('answers 404 for a subtask or task of another workspace and leaves it unchanged', async () => {
    const theirs = await createSubtask(db, otherTaskId, otherWorkspaceId, 'theirs')
    await expect404(createSubtask(db, otherTaskId, workspaceId, 'x'), 'Task not found')
    await expect404(updateSubtask(db, theirs.id, workspaceId, { done: true }), 'Subtask not found')
    await expect404(deleteSubtask(db, theirs.id, workspaceId), 'Subtask not found')
    await expect404(updateSubtask(db, randomUUID(), workspaceId, { done: true }), 'Subtask not found')
    expect((await getTask(db, otherTaskId, otherWorkspaceId)).subtasks).toMatchObject([{ title: 'theirs', done: false }])
  })
})
