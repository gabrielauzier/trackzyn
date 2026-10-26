import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type Subtask, type Task, type TaskColumn, focusSessions, lists, subtasks, tasks } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { endOpenSessions } from './focus-settle.ts'
import { getList } from './lists.ts'

export type TaskWithSubtasks = Task & { subtasks: Subtask[] }

const notFound = () => new HttpError(404, 'Task not found')

/** The task `taskId` if its list belongs to `workspaceId`, or 404. */
export async function findTask(db: Database, taskId: string, workspaceId: string): Promise<Task> {
  const [row] = await db
    .select({ task: tasks })
    .from(tasks)
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .where(and(eq(tasks.id, taskId), eq(lists.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw notFound()
  return row.task
}

export async function getTask(db: Database, taskId: string, workspaceId: string): Promise<TaskWithSubtasks> {
  const task = await findTask(db, taskId, workspaceId)
  const found = await db.select().from(subtasks).where(eq(subtasks.taskId, task.id)).orderBy(asc(subtasks.position))
  return { ...task, subtasks: found }
}

/** Serialises every change to the order of a list's tasks (two moves at once: the last one wins). */
async function lockList(tx: Database, listId: string): Promise<void> {
  await tx.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).for('update')
}

export async function createTask(
  db: Database,
  workspaceId: string,
  /** `userId` is who creates the task: a task created in done counts as completed by them (AD-006). */
  input: { listId: string; title: string; estimateMinutes: number | null; column: TaskColumn; userId: string },
  now: Date = new Date(),
): Promise<TaskWithSubtasks> {
  const list = await getList(db, input.listId, workspaceId)
  return db.transaction(async (tx) => {
    await lockList(tx as Database, list.id)
    const [last] = await tx
      .select({ next: sql<number>`coalesce(max(${tasks.position}) + 1, 0)::int` })
      .from(tasks)
      .where(and(eq(tasks.listId, list.id), eq(tasks.column, input.column)))
    const task: Task = {
      id: randomUUID(),
      listId: list.id,
      title: input.title,
      notes: '',
      estimateMinutes: input.estimateMinutes,
      column: input.column,
      position: last?.next ?? 0,
      completedAt: input.column === 'done' ? now : null,
      createdAt: now,
      completedByUserId: input.column === 'done' ? input.userId : null,
    }
    await tx.insert(tasks).values(task)
    return { ...task, subtasks: [] }
  })
}

export async function updateTask(
  db: Database,
  taskId: string,
  workspaceId: string,
  changes: { title?: string; estimateMinutes?: number | null; notes?: string },
): Promise<TaskWithSubtasks> {
  const task = await findTask(db, taskId, workspaceId)
  const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
  if (Object.keys(given).length > 0) await db.update(tasks).set(given).where(eq(tasks.id, task.id))
  return getTask(db, task.id, workspaceId)
}

/**
 * Puts the task in `column`, right before `beforeTaskId` (or at the end for null), and renumbers the
 * columns it left and entered from 0 to n-1. Entering `done` records `completed_at = now` and
 * `completed_by_user_id = byUserId` (AD-006); leaving it clears both, and moving inside `done` keeps them.
 * A task that is not in `today` afterwards loses its open focus session, ended at `now` (FOCUS-15).
 */
export async function moveTask(
  db: Database,
  taskId: string,
  workspaceId: string,
  target: { column: TaskColumn; beforeTaskId: string | null; byUserId: string },
  now: Date = new Date(),
): Promise<TaskWithSubtasks> {
  const task = await findTask(db, taskId, workspaceId)
  await db.transaction(async (tx) => {
    await lockList(tx as Database, task.listId)
    // Read again under the lock: a concurrent move may have changed the column.
    const [current] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
    if (!current) throw notFound()

    const columnIds = async (column: TaskColumn) =>
      (
        await tx
          .select({ id: tasks.id })
          .from(tasks)
          .where(and(eq(tasks.listId, current.listId), eq(tasks.column, column)))
          .orderBy(asc(tasks.position), asc(tasks.createdAt))
      ).map((row) => row.id)

    const entered = (await columnIds(target.column)).filter((id) => id !== current.id)
    let at = entered.length
    if (target.beforeTaskId !== null && target.beforeTaskId !== current.id) {
      at = entered.indexOf(target.beforeTaskId)
      if (at < 0) throw notFound()
    } else if (target.beforeTaskId === current.id && current.column === target.column) {
      at = (await columnIds(target.column)).indexOf(current.id)
    }
    entered.splice(at, 0, current.id)

    const stays = current.column === 'done'
    const completedAt = target.column !== 'done' ? null : stays ? current.completedAt : now
    const completedByUserId = target.column !== 'done' ? null : stays ? current.completedByUserId : target.byUserId
    await tx.update(tasks).set({ column: target.column, completedAt, completedByUserId }).where(eq(tasks.id, current.id))
    if (target.column !== 'today') await endOpenSessions(tx as Database, eq(focusSessions.taskId, current.id), now, 'task_left')
    for (const [position, id] of entered.entries()) await tx.update(tasks).set({ position }).where(eq(tasks.id, id))
    if (current.column !== target.column) {
      const left = await columnIds(current.column)
      for (const [position, id] of left.entries()) await tx.update(tasks).set({ position }).where(eq(tasks.id, id))
    }
  })
  return getTask(db, task.id, workspaceId)
}

/** Deletes the task; its subtasks go with it (cascade, AD-005). */
export async function deleteTask(db: Database, taskId: string, workspaceId: string): Promise<void> {
  const task = await findTask(db, taskId, workspaceId)
  await db.delete(tasks).where(eq(tasks.id, task.id))
}

/**
 * A copy of the task in the same list and column, at the end of it, with the same notes, estimate and
 * subtasks (none of them done). A copy of a completed task starts in backlog: it has not been done yet.
 */
export async function duplicateTask(db: Database, taskId: string, workspaceId: string, now: Date = new Date()): Promise<TaskWithSubtasks> {
  const source = await getTask(db, taskId, workspaceId)
  const column: TaskColumn = source.column === 'done' ? 'backlog' : source.column
  return db.transaction(async (tx) => {
    await lockList(tx as Database, source.listId)
    const [last] = await tx
      .select({ next: sql<number>`coalesce(max(${tasks.position}) + 1, 0)::int` })
      .from(tasks)
      .where(and(eq(tasks.listId, source.listId), eq(tasks.column, column)))
    const copy: Task = {
      id: randomUUID(),
      listId: source.listId,
      title: source.title,
      notes: source.notes,
      estimateMinutes: source.estimateMinutes,
      column,
      position: last?.next ?? 0,
      completedAt: null,
      createdAt: now,
      completedByUserId: null,
    }
    await tx.insert(tasks).values(copy)
    const copies: Subtask[] = source.subtasks.map((subtask, position) => ({
      id: randomUUID(),
      taskId: copy.id,
      title: subtask.title,
      done: false,
      position,
    }))
    if (copies.length > 0) await tx.insert(subtasks).values(copies)
    return { ...copy, subtasks: copies }
  })
}

/**
 * Moves the task to another list of the workspace, to the end of the same column, and renumbers the column
 * it left. Its open focus session ends (FOCUS-15), as for any task that leaves Today.
 */
export async function moveTaskToList(
  db: Database,
  taskId: string,
  workspaceId: string,
  targetListId: string,
  now: Date = new Date(),
): Promise<TaskWithSubtasks> {
  const task = await findTask(db, taskId, workspaceId)
  const target = await getList(db, targetListId, workspaceId)
  if (target.id === task.listId) return getTask(db, task.id, workspaceId)
  await db.transaction(async (tx) => {
    // Both lists are locked in a fixed order, so two moves in opposite directions cannot wait on each other.
    for (const id of [task.listId, target.id].sort()) await lockList(tx as Database, id)
    const [current] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
    if (!current) throw notFound()
    const [last] = await tx
      .select({ next: sql<number>`coalesce(max(${tasks.position}) + 1, 0)::int` })
      .from(tasks)
      .where(and(eq(tasks.listId, target.id), eq(tasks.column, current.column)))
    await tx.update(tasks).set({ listId: target.id, position: last?.next ?? 0 }).where(eq(tasks.id, current.id))
    await endOpenSessions(tx as Database, eq(focusSessions.taskId, current.id), now, 'task_left')
    const left = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.listId, current.listId), eq(tasks.column, current.column)))
      .orderBy(asc(tasks.position), asc(tasks.createdAt))
    for (const [position, row] of left.entries()) await tx.update(tasks).set({ position }).where(eq(tasks.id, row.id))
  })
  return getTask(db, task.id, workspaceId)
}
