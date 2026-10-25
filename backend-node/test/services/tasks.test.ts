import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, subtasks, tasks, users, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { createList } from '../../src/services/lists.ts'
import { createTask, deleteTask, getTask, moveTask, updateTask } from '../../src/services/tasks.ts'
import { migratedDb } from '../support/db.ts'

let db: Database
let client: PGlite
let workspaceId: string
let otherWorkspaceId: string
let listId: string
let userId: string

const NOW = new Date('2026-10-24T15:00:00Z')

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  userId = randomUUID()
  await db.insert(users).values({ id: userId, email: 'a@b.c', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
  workspaceId = randomUUID()
  otherWorkspaceId = randomUUID()
  await db.insert(workspaces).values([
    { id: workspaceId, name: 'Mine', createdAt: NOW },
    { id: otherWorkspaceId, name: 'Theirs', createdAt: NOW },
  ])
  listId = (await createList(db, { workspaceId, userId, name: 'Work', color: 1 })).id
})
afterEach(async () => {
  await client.close()
})

const add = (title: string, column: TaskColumn = 'backlog', estimateMinutes: number | null = null) =>
  createTask(db, workspaceId, { listId, title, estimateMinutes, column, userId }, NOW)

async function column(name: TaskColumn) {
  return db
    .select({ title: tasks.title, position: tasks.position })
    .from(tasks)
    .where(and(eq(tasks.listId, listId), eq(tasks.column, name)))
    .orderBy(asc(tasks.position))
}

const expect404 = async (promise: Promise<unknown>, detail = 'Task not found') => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ statusCode: 404, detail })
}

describe('tasks service', () => {
  it('TASK-01 creates a task at the end of its column with its title and estimate, not completed', async () => {
    await add('first', 'today', 60)
    const second = await add('second', 'today', 87)
    expect(second).toMatchObject({ listId, title: 'second', estimateMinutes: 87, column: 'today', position: 1, notes: '', completedAt: null, subtasks: [] })
    const none = await add('no estimate', 'backlog')
    expect(none).toMatchObject({ estimateMinutes: null, position: 0 })
    expect((await column('today')).map((row) => row.title)).toEqual(['first', 'second'])
  })

  it('TASK-08 creating a task directly in done records its completion', async () => {
    const task = await add('done already', 'done')
    expect(task.completedAt).toEqual(NOW)
  })

  it('TASK-03 reads a task with its notes and subtasks, and edits title, estimate and notes', async () => {
    const task = await add('draft', 'today', 30)
    await db.insert(subtasks).values({ id: randomUUID(), taskId: task.id, title: 'step', position: 0 })

    const edited = await updateTask(db, task.id, workspaceId, { title: 'final', estimateMinutes: 90, notes: 'remember this' })
    expect(edited).toMatchObject({ title: 'final', estimateMinutes: 90, notes: 'remember this', column: 'today' })
    const read = await getTask(db, task.id, workspaceId)
    expect(read).toMatchObject({ title: 'final', estimateMinutes: 90, notes: 'remember this' })
    expect(read.subtasks.map((subtask) => subtask.title)).toEqual(['step'])

    const cleared = await updateTask(db, task.id, workspaceId, { estimateMinutes: null })
    expect(cleared).toMatchObject({ title: 'final', estimateMinutes: null, notes: 'remember this' })
  })

  it('BOARD-03 moves a task before another one in another column and keeps both columns numbered 0..n-1', async () => {
    const a = await add('a', 'backlog')
    await add('b', 'backlog')
    await add('c', 'backlog')
    const x = await add('x', 'today')
    const y = await add('y', 'today')

    const moved = await moveTask(db, a.id, workspaceId, { column: 'today', beforeTaskId: y.id, byUserId: userId }, NOW)
    expect(moved).toMatchObject({ column: 'today', position: 1, completedAt: null })
    expect(await column('today')).toEqual([
      { title: 'x', position: 0 },
      { title: 'a', position: 1 },
      { title: 'y', position: 2 },
    ])
    expect(await column('backlog')).toEqual([
      { title: 'b', position: 0 },
      { title: 'c', position: 1 },
    ])

    await moveTask(db, x.id, workspaceId, { column: 'today', beforeTaskId: null, byUserId: userId }, NOW)
    expect((await column('today')).map((row) => row.title)).toEqual(['a', 'y', 'x'])
  })

  it('BOARD-07 moving a task to done records completed_at = now', async () => {
    const task = await add('finish me', 'today')
    const done = await moveTask(db, task.id, workspaceId, { column: 'done', beforeTaskId: null, byUserId: userId }, NOW)
    expect(done).toMatchObject({ column: 'done', completedAt: NOW })
  })

  it('BOARD-08 moving a task from done to today clears completed_at and keeps the task', async () => {
    const task = await add('reopen me', 'today', 25)
    await moveTask(db, task.id, workspaceId, { column: 'done', beforeTaskId: null, byUserId: userId }, NOW)
    const reopened = await moveTask(db, task.id, workspaceId, { column: 'today', beforeTaskId: null, byUserId: userId }, NOW)
    expect(reopened).toMatchObject({ id: task.id, title: 'reopen me', estimateMinutes: 25, column: 'today', completedAt: null })
  })

  it('reordering inside done keeps the original completion time', async () => {
    const first = await add('first', 'today')
    const second = await add('second', 'today')
    await moveTask(db, first.id, workspaceId, { column: 'done', beforeTaskId: null, byUserId: userId }, NOW)
    await moveTask(db, second.id, workspaceId, { column: 'done', beforeTaskId: null, byUserId: userId }, NOW)
    const later = new Date('2026-10-24T18:00:00Z')
    const reordered = await moveTask(db, second.id, workspaceId, { column: 'done', beforeTaskId: first.id, byUserId: userId }, later)
    expect(reordered).toMatchObject({ position: 0, completedAt: NOW })
  })

  it('two concurrent moves in the same column leave positions 0..n-1 and the last write in the final order', async () => {
    const a = await add('a', 'today')
    await add('b', 'today')
    const c = await add('c', 'today')
    const d = await add('d', 'today')

    await Promise.all([
      moveTask(db, d.id, workspaceId, { column: 'today', beforeTaskId: a.id, byUserId: userId }, NOW),
      moveTask(db, d.id, workspaceId, { column: 'today', beforeTaskId: c.id, byUserId: userId }, NOW),
    ])
    expect(await column('today')).toEqual([
      { title: 'a', position: 0 },
      { title: 'b', position: 1 },
      { title: 'd', position: 2 },
      { title: 'c', position: 3 },
    ])
  })

  it('TASK-05 deletes a task with its subtasks, and the task is then not found', async () => {
    const task = await add('gone', 'today')
    await db.insert(subtasks).values({ id: randomUUID(), taskId: task.id, title: 'step', position: 0 })
    await deleteTask(db, task.id, workspaceId)
    await expect404(getTask(db, task.id, workspaceId))
    expect(await db.select().from(subtasks).where(eq(subtasks.taskId, task.id))).toEqual([])
  })

  it('answers 404 for a task or a list of another workspace and for a before task outside the target column', async () => {
    const task = await add('mine', 'today')
    const other = await add('other', 'backlog')
    await expect404(getTask(db, task.id, otherWorkspaceId))
    await expect404(updateTask(db, task.id, otherWorkspaceId, { title: 'x' }))
    await expect404(moveTask(db, task.id, otherWorkspaceId, { column: 'done', beforeTaskId: null, byUserId: userId }, NOW))
    await expect404(deleteTask(db, task.id, otherWorkspaceId))
    await expect404(createTask(db, otherWorkspaceId, { listId, title: 't', estimateMinutes: null, column: 'today', userId }, NOW), 'List not found')
    await expect404(moveTask(db, task.id, workspaceId, { column: 'today', beforeTaskId: other.id, byUserId: userId }, NOW))
    expect(await getTask(db, task.id, workspaceId)).toMatchObject({ title: 'mine', column: 'today', completedAt: null })
  })
})
