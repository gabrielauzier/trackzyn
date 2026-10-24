import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type Subtask, type Task, type TaskColumn, lists, subtasks, tasks } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
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
  input: { listId: string; title: string; estimateMinutes: number | null; column: TaskColumn },
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
 * columns it left and entered from 0 to n-1. Entering `done` records `completed_at = now`; leaving it clears it.
 */
export async function moveTask(
  db: Database,
  taskId: string,
  workspaceId: string,
  target: { column: TaskColumn; beforeTaskId: string | null },
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

    const completedAt = target.column !== 'done' ? null : current.column === 'done' ? current.completedAt : now
    await tx.update(tasks).set({ column: target.column, completedAt }).where(eq(tasks.id, current.id))
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
