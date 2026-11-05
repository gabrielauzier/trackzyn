import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { tasks, users, workspaces } from '../../src/db/schema.ts'
import { createList } from '../../src/services/lists.ts'
import { createSubtask, deleteSubtask, moveSubtask, updateSubtask } from '../../src/services/subtasks.ts'
import { createTask, duplicateTask, moveTask, moveTaskToList, updateTask } from '../../src/services/tasks.ts'
import { migratedDb } from '../support/db.ts'

// #27 PICK-01: the writes that count as updating a task, and the ones that do not.
const CREATED = new Date('2026-11-01T09:00:00Z')
const LATER = new Date('2026-11-03T15:30:00Z')

let db: Database
let client: PGlite
let workspaceId: string
let userId: string
let listId: string
let otherListId: string
beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  userId = randomUUID()
  await db.insert(users).values({ id: userId, email: 'a@b.c', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
  workspaceId = randomUUID()
  await db.insert(workspaces).values({ id: workspaceId, name: 'Mine', createdAt: CREATED })
  listId = (await createList(db, { workspaceId, userId, name: 'Work', color: 1 })).id
  otherListId = (await createList(db, { workspaceId, userId, name: 'Home', color: 2 })).id
})
afterEach(async () => {
  await client.close()
})

const add = (title = 'Write', column: 'today' | 'backlog' = 'today') =>
  createTask(db, workspaceId, { listId, title, estimateMinutes: null, column, userId }, CREATED)
const updatedAt = async (id: string) => (await db.select({ at: tasks.updatedAt }).from(tasks).where(eq(tasks.id, id)))[0]!.at.toISOString()

describe('the last update of a task (#27)', () => {
  it('PICK-01 a created and a duplicated task are updated when they are made', async () => {
    const task = await add()
    expect(await updatedAt(task.id)).toBe(CREATED.toISOString())
    const copy = await duplicateTask(db, task.id, workspaceId, LATER)
    expect(await updatedAt(copy.id)).toBe(LATER.toISOString())
    expect(await updatedAt(task.id)).toBe(CREATED.toISOString())
  })

  it('PICK-01 changing the title, the notes or the estimate updates it; a PATCH with no field does not', async () => {
    const task = await add()
    await updateTask(db, task.id, workspaceId, {}, LATER)
    expect(await updatedAt(task.id)).toBe(CREATED.toISOString())
    for (const [index, changes] of [{ title: 'Renamed' }, { notes: 'some notes' }, { estimateMinutes: 30 }].entries()) {
      const at = new Date(LATER.getTime() + index * 60_000)
      await updateTask(db, task.id, workspaceId, changes, at)
      expect(await updatedAt(task.id)).toBe(at.toISOString())
    }
  })

  it('PICK-01 moving to another column updates it; reordering in the same column updates neither it nor its neighbours', async () => {
    const first = await add('First')
    const second = await add('Second')
    await moveTask(db, second.id, workspaceId, { column: 'today', beforeTaskId: first.id, byUserId: userId }, LATER)
    expect(await updatedAt(second.id)).toBe(CREATED.toISOString())
    expect(await updatedAt(first.id)).toBe(CREATED.toISOString())

    await moveTask(db, first.id, workspaceId, { column: 'done', beforeTaskId: null, byUserId: userId }, LATER)
    expect(await updatedAt(first.id)).toBe(LATER.toISOString())
    expect(await updatedAt(second.id)).toBe(CREATED.toISOString())
  })

  it('PICK-01 moving to another list updates it', async () => {
    const task = await add()
    await moveTaskToList(db, task.id, workspaceId, otherListId, LATER)
    expect(await updatedAt(task.id)).toBe(LATER.toISOString())
  })

  it('PICK-01 creating, changing and deleting a subtask update its task; reordering subtasks does not', async () => {
    const task = await add()
    const steps = [new Date('2026-11-02T10:00:00Z'), new Date('2026-11-02T11:00:00Z'), new Date('2026-11-02T12:00:00Z')]
    const one = await createSubtask(db, task.id, workspaceId, 'One', steps[0])
    expect(await updatedAt(task.id)).toBe(steps[0]!.toISOString())
    const two = await createSubtask(db, task.id, workspaceId, 'Two', steps[0])
    await updateSubtask(db, one.id, workspaceId, { done: true }, steps[1])
    expect(await updatedAt(task.id)).toBe(steps[1]!.toISOString())
    await moveSubtask(db, two.id, workspaceId, one.id)
    expect(await updatedAt(task.id)).toBe(steps[1]!.toISOString())
    await deleteSubtask(db, one.id, workspaceId, steps[2])
    expect(await updatedAt(task.id)).toBe(steps[2]!.toISOString())
  })
})
