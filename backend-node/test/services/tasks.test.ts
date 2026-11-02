import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { and, asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, lists, personalAccessTokens, subtasks, tasks, users, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { createList } from '../../src/services/lists.ts'
import { createTask, deleteTask, duplicateTask, getTask, moveTask, moveTaskToList, updateTask } from '../../src/services/tasks.ts'
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

  it('duplicates a task at the end of its column with notes, estimate and undone subtasks', async () => {
    const original = await add('Write', 'today', 45)
    await add('Other', 'today')
    await updateTask(db, original.id, workspaceId, { notes: '<p>Draft</p>' })
    await db.insert(subtasks).values([
      { id: randomUUID(), taskId: original.id, title: 'Outline', done: true, position: 0 },
      { id: randomUUID(), taskId: original.id, title: 'Review', done: false, position: 1 },
    ])

    const copy = await duplicateTask(db, original.id, workspaceId, NOW)

    expect(copy).toMatchObject({ title: 'Write', notes: '<p>Draft</p>', estimateMinutes: 45, column: 'today', position: 2, completedAt: null })
    expect(copy.id).not.toBe(original.id)
    expect(copy.subtasks.map((subtask) => [subtask.title, subtask.done, subtask.position])).toEqual([
      ['Outline', false, 0],
      ['Review', false, 1],
    ])
    expect((await getTask(db, original.id, workspaceId)).subtasks.map((subtask) => subtask.done)).toEqual([true, false])
  })

  it('duplicates a completed task into backlog, as not done', async () => {
    const task = await add('Write', 'today')
    await moveTask(db, task.id, workspaceId, { column: 'done', beforeTaskId: null, byUserId: userId }, NOW)

    const copy = await duplicateTask(db, task.id, workspaceId, NOW)

    expect(copy).toMatchObject({ column: 'backlog', completedAt: null, completedByUserId: null })
  })

  it('moves a task to another list at the end of the same column and renumbers the column it left', async () => {
    const other = (await createList(db, { workspaceId, userId, name: 'Home', color: 2 })).id
    await createTask(db, workspaceId, { listId: other, title: 'Existing', estimateMinutes: null, column: 'today', userId }, NOW)
    const a = await add('a', 'today')
    const b = await add('b', 'today')

    const moved = await moveTaskToList(db, a.id, workspaceId, other, NOW)

    expect(moved).toMatchObject({ listId: other, column: 'today', position: 1 })
    expect(await column('today')).toEqual([{ title: 'b', position: 0 }])
    expect((await getTask(db, b.id, workspaceId)).listId).toBe(listId)
  })

  it('leaves a task alone when it is moved to the list it is already in, and 404s for a list of another workspace', async () => {
    const task = await add('a', 'today')
    const foreign = (await createList(db, { workspaceId: otherWorkspaceId, userId, name: 'Theirs', color: 3 })).id

    expect(await moveTaskToList(db, task.id, workspaceId, listId, NOW)).toMatchObject({ listId, position: 0 })
    await expect404(moveTaskToList(db, task.id, workspaceId, foreign, NOW), 'List not found')
    expect((await getTask(db, task.id, workspaceId)).listId).toBe(listId)
  })
})

describe('createTask for a token', () => {
  const full = (changes: Partial<Parameters<typeof createTask>[2]> = {}) =>
    createTask(db, workspaceId, { listId, title: 'Full', estimateMinutes: null, column: 'backlog', userId, ...changes }, NOW)

  const storedSubtasks = (taskId: string) =>
    db.select({ title: subtasks.title, position: subtasks.position }).from(subtasks).where(eq(subtasks.taskId, taskId)).orderBy(asc(subtasks.position))

  it('API-05 creates the subtasks with positions 0..n-1 in the order sent, not done', async () => {
    const task = await full({ subtasks: ['zeta', 'alpha', 'mid'] })
    expect(await storedSubtasks(task.id)).toEqual([
      { title: 'zeta', position: 0 },
      { title: 'alpha', position: 1 },
      { title: 'mid', position: 2 },
    ])
    expect(task.subtasks.map((subtask) => [subtask.title, subtask.position, subtask.done])).toEqual([
      ['zeta', 0, false],
      ['alpha', 1, false],
      ['mid', 2, false],
    ])
  })

  it('API-04 stores the notes and API-03 the estimate', async () => {
    const task = await full({ notes: 'remember this', estimateMinutes: 87 })
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row).toMatchObject({ notes: 'remember this', estimateMinutes: 87 })
  })

  it('uses the given id', async () => {
    const id = randomUUID()
    expect((await full({ id })).id).toBe(id)
    expect(await db.select({ id: tasks.id }).from(tasks)).toEqual([{ id }])
  })

  it('ORIGIN-01 records the token that created the task', async () => {
    const tokenId = randomUUID()
    await db.insert(personalAccessTokens).values({
      id: tokenId,
      userId,
      workspaceId,
      name: 'n8n',
      tokenHash: 'a'.repeat(64),
      lastFour: 'abcd',
      scopes: ['tasks:create'],
      createdAt: NOW,
      expiresAt: new Date('2027-01-01T00:00:00Z'),
    })
    const task = await full({ createdViaTokenId: tokenId })
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row?.createdViaTokenId).toBe(tokenId)
  })

  it('API-07 a subtask the column refuses leaves neither the task nor any subtask', async () => {
    await expect(full({ title: 'Rolled back', subtasks: ['fits', 'x'.repeat(256), 'fits too'] })).rejects.toThrow()
    expect(await db.select().from(tasks)).toEqual([])
    expect(await db.select().from(subtasks)).toEqual([])
    // The list stays usable: nothing is left locked or half written.
    expect((await full({ title: 'Next' })).position).toBe(0)
  })

  it('API-09 refuses an archived list with rejectArchived and keeps creating without it', async () => {
    await db.update(lists).set({ isArchived: true }).where(eq(lists.id, listId))
    const error = await full({ rejectArchived: true }).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 409, detail: 'List is archived' })
    expect(await db.select().from(tasks)).toEqual([])

    expect(await full()).toMatchObject({ listId, title: 'Full' })
  })

  it('API-10 creating in done records the completion for the owner of the token', async () => {
    const task = await full({ column: 'done' })
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row).toMatchObject({ completedByUserId: userId, completedAt: NOW })
  })

  it('without the new fields the notes are empty and no subtask or origin is stored', async () => {
    const task = await full()
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row).toMatchObject({ notes: '', createdViaTokenId: null })
    expect(await storedSubtasks(task.id)).toEqual([])
  })
})
