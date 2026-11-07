import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type Subtask, type Task, type TaskColumn, type TaskOrigin, focusSessions, lists, personalAccessTokens, subtasks, tasks } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { endOpenSessions } from './focus-settle.ts'
import { getList } from './lists.ts'

/** `createdVia` is the name of the token that created the task, while that token exists (ORIGIN-02, ORIGIN-05). */
export type TaskWithSubtasks = Task & { subtasks: Subtask[]; createdVia: string | null }

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

/** What `via …` shows: the name of the token that made the task, else `Agenda` for a task from the agenda (PICK-17). */
export function createdVia(tokenName: string | null, createdFrom: TaskOrigin | null): string | null {
  return tokenName ?? (createdFrom === 'agenda' ? 'Agenda' : null)
}

export async function getTask(db: Database, taskId: string, workspaceId: string): Promise<TaskWithSubtasks> {
  const [row] = await db
    .select({ task: tasks, createdVia: personalAccessTokens.name })
    .from(tasks)
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .leftJoin(personalAccessTokens, eq(personalAccessTokens.id, tasks.createdViaTokenId))
    .where(and(eq(tasks.id, taskId), eq(lists.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw notFound()
  const found = await db.select().from(subtasks).where(eq(subtasks.taskId, row.task.id)).orderBy(asc(subtasks.position))
  return { ...row.task, subtasks: found, createdVia: createdVia(row.createdVia, row.task.createdFrom) }
}

/** Serialises every change to the order of a list's tasks (two moves at once: the last one wins). */
export async function lockList(tx: Database, listId: string): Promise<void> {
  await tx.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).for('update')
}

export async function createTask(
  db: Database,
  workspaceId: string,
  /** `userId` is who creates the task: a task created in done counts as completed by them (AD-006). */
  input: {
    listId: string
    title: string
    estimateMinutes: number | null
    column: TaskColumn
    userId: string
    id?: string
    notes?: string
    /** Titles, in the order the subtasks must keep. */
    subtasks?: string[]
    createdViaTokenId?: string
    /** Where the task came from when no token made it (PICK-17). */
    createdFrom?: TaskOrigin
    /** Answers 409 for an archived list. An automation cannot see that the list left the screen (API-09). */
    rejectArchived?: boolean
  },
  now: Date = new Date(),
): Promise<TaskWithSubtasks> {
  const list = await getList(db, input.listId, workspaceId)
  return db.transaction(async (tx) => {
    await lockList(tx as Database, list.id)
    // Read under the lock: the list may have been archived since `getList`.
    if (input.rejectArchived && (await getList(tx as Database, list.id, workspaceId)).isArchived) {
      throw new HttpError(409, 'List is archived')
    }
    const [last] = await tx
      .select({ next: sql<number>`coalesce(max(${tasks.position}) + 1, 0)::int` })
      .from(tasks)
      .where(and(eq(tasks.listId, list.id), eq(tasks.column, input.column)))
    const task: Task = {
      id: input.id ?? randomUUID(),
      listId: list.id,
      title: input.title,
      notes: input.notes ?? '',
      estimateMinutes: input.estimateMinutes,
      column: input.column,
      position: last?.next ?? 0,
      completedAt: input.column === 'done' ? now : null,
      createdAt: now,
      completedByUserId: input.column === 'done' ? input.userId : null,
      createdViaTokenId: input.createdViaTokenId ?? null,
      updatedAt: now,
      createdFrom: input.createdFrom ?? null,
      scheduledOn: null,
      scheduledTime: null,
      scheduleAppliedAt: null,
    }
    await tx.insert(tasks).values(task)
    const created: Subtask[] = (input.subtasks ?? []).map((title, position) => ({ id: randomUUID(), taskId: task.id, title, done: false, position }))
    if (created.length > 0) await tx.insert(subtasks).values(created)
    return getTask(tx as Database, task.id, workspaceId)
  })
}

export async function updateTask(
  db: Database,
  taskId: string,
  workspaceId: string,
  changes: { title?: string; estimateMinutes?: number | null; notes?: string },
  now: Date = new Date(),
): Promise<TaskWithSubtasks> {
  const task = await findTask(db, taskId, workspaceId)
  const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
  // A change of a field is an update of the task (PICK-01).
  if (Object.keys(given).length > 0) await db.update(tasks).set({ ...given, updatedAt: now }).where(eq(tasks.id, task.id))
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
    // Entering another column is an update of the task; reordering inside the same one is not (PICK-01).
    const updated = current.column !== target.column ? { updatedAt: now } : {}
    await tx.update(tasks).set({ column: target.column, completedAt, completedByUserId, ...updated }).where(eq(tasks.id, current.id))
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
      createdViaTokenId: null,
      updatedAt: now,
      createdFrom: null,
      scheduledOn: null,
      scheduledTime: null,
      scheduleAppliedAt: null,
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
    return { ...copy, subtasks: copies, createdVia: null }
  })
}

/**
 * Moves the task to another list of the workspace, to the end of the same column, and renumbers the column
 * it left. Its open focus session ends (FOCUS-15), as for any task that leaves Today, and all its sessions move
 * to the new list, so its time counts there (#21).
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
    await tx.update(tasks).set({ listId: target.id, position: last?.next ?? 0, updatedAt: now }).where(eq(tasks.id, current.id))
    await endOpenSessions(tx as Database, eq(focusSessions.taskId, current.id), now, 'task_left')
    // The task takes its recorded time with it: reports and the agenda group by the session's list (#21).
    await tx.update(focusSessions).set({ listId: target.id }).where(eq(focusSessions.taskId, current.id))
    const left = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.listId, current.listId), eq(tasks.column, current.column)))
      .orderBy(asc(tasks.position), asc(tasks.createdAt))
    for (const [position, row] of left.entries()) await tx.update(tasks).set({ position }).where(eq(tasks.id, row.id))
  })
  return getTask(db, task.id, workspaceId)
}
