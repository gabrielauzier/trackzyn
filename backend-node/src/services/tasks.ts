import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import {
  type Priority,
  type Subtask,
  type Task,
  type TaskColumn,
  type TaskKind,
  type TaskOrigin,
  type TaskSeries,
  focusSessions,
  lists,
  personalAccessTokens,
  subtasks,
  taskGroups,
  taskSeries,
  tasks,
} from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { endOpenSessions } from './focus-settle.ts'
import { hasOpenTasks, normalizeBlocks } from './groups.ts'
import { getList } from './lists.ts'
import { createNextOccurrence } from './series.ts'

/**
 * `createdVia` is the name of the token that created the task, while that token exists (ORIGIN-02, ORIGIN-05);
 * `series` is the series the task is an occurrence of.
 */
export type TaskWithSubtasks = Task & { subtasks: Subtask[]; createdVia: string | null; series: TaskSeries | null }

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
    .select({ task: tasks, createdVia: personalAccessTokens.name, series: taskSeries })
    .from(tasks)
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .leftJoin(personalAccessTokens, eq(personalAccessTokens.id, tasks.createdViaTokenId))
    .leftJoin(taskSeries, eq(taskSeries.id, tasks.seriesId))
    .where(and(eq(tasks.id, taskId), eq(lists.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw notFound()
  const found = await db.select().from(subtasks).where(eq(subtasks.taskId, row.task.id)).orderBy(asc(subtasks.position))
  return { ...row.task, subtasks: found, createdVia: createdVia(row.createdVia, row.task.createdFrom), series: row.series }
}

/** The fields of caixa-de-entrada on a task; a field left out keeps its value (or its default on create). */
export interface TaskFields {
  kind?: TaskKind
  priority?: Priority
  dueOn?: string | null
  waiting?: boolean
  waitingFor?: string | null
  flagged?: boolean
  flagReason?: string | null
  groupId?: string | null
}

const fieldError = (message: string, code: string) => new HttpError(422, message, {}, { code })

/**
 * The fields `changes` leave on `current`, or 422. Unmarking Aguardando clears "de quem" (WAIT-05), taking the
 * flag off clears its reason (FLAG-04); a reminder has no estimate (REM-02) and no due day, flag, Aguardando
 * or group (MODAL-06), a completed task has no flag (FLAG-05) and the group must be one of the task's list.
 */
async function resolveFields(
  db: Database,
  current: Pick<Task, 'listId' | 'column' | 'kind' | 'estimateMinutes' | 'dueOn' | 'waiting' | 'flagged' | 'groupId'>,
  changes: TaskFields & { estimateMinutes?: number | null },
): Promise<TaskFields> {
  const kind = changes.kind ?? current.kind
  const estimate = changes.estimateMinutes !== undefined ? changes.estimateMinutes : current.estimateMinutes
  if (kind === 'reminder' && estimate !== null) throw fieldError('A reminder has no estimate', 'reminder_estimate')
  const waiting = changes.waiting ?? current.waiting
  if (kind === 'reminder') {
    const dueOn = changes.dueOn !== undefined ? changes.dueOn : current.dueOn
    const groupId = changes.groupId !== undefined ? changes.groupId : current.groupId
    const flagged = changes.flagged ?? current.flagged
    if (dueOn !== null || flagged || waiting || groupId !== null) {
      throw fieldError('A reminder has no due day, flag, Aguardando or group', 'reminder_field')
    }
  }
  if (!waiting && changes.waitingFor != null) throw fieldError('waiting_for needs waiting', 'waiting_for_needs_waiting')
  const flagged = changes.flagged ?? current.flagged
  if (!flagged && changes.flagReason != null) throw fieldError('flag_reason needs flagged', 'flag_reason_needs_flag')
  if (flagged && current.column === 'done') throw fieldError('A completed task has no flag', 'flag_on_done')
  if (changes.groupId != null) {
    const [group] = await db.select({ listId: taskGroups.listId }).from(taskGroups).where(eq(taskGroups.id, changes.groupId))
    if (group?.listId !== current.listId) throw fieldError('The group is not of the list of the task', 'group_of_another_list')
  }
  // Only what changes, so an empty change is not an update of the task (PICK-01).
  return {
    kind: changes.kind,
    priority: changes.priority,
    dueOn: changes.dueOn,
    waiting: changes.waiting,
    waitingFor: waiting ? changes.waitingFor : changes.waiting === false ? null : undefined,
    flagged: changes.flagged,
    flagReason: flagged ? changes.flagReason : changes.flagged === false ? null : undefined,
    groupId: changes.groupId,
  }
}

/** Serialises every change to the order of a list's tasks (two moves at once: the last one wins). */
export async function lockList(tx: Database, listId: string): Promise<void> {
  await tx.select({ id: lists.id }).from(lists).where(eq(lists.id, listId)).for('update')
}

/** The tasks of one column with their group, in board order. */
async function columnTasks(tx: Database, listId: string, column: TaskColumn): Promise<Array<{ id: string; groupId: string | null }>> {
  return tx
    .select({ id: tasks.id, groupId: tasks.groupId })
    .from(tasks)
    .where(and(eq(tasks.listId, listId), eq(tasks.column, column)))
    .orderBy(asc(tasks.position), asc(tasks.createdAt))
}

/** Writes `ids` as the order of their column, from 0 to n-1, touching only the tasks whose position changes. */
async function writeOrder(tx: Database, ids: readonly string[]): Promise<void> {
  for (const [position, id] of ids.entries()) {
    await tx
      .update(tasks)
      .set({ position })
      .where(and(eq(tasks.id, id), sql`${tasks.position} <> ${position}`))
  }
}

/**
 * Puts `taskId` right after the last task of `groupId` in its column, where that group already has a task,
 * and joins the blocks of the column (AD-013). The task's group must already be stored. Run under `lockList`.
 */
async function placeAtEndOfGroup(tx: Database, listId: string, column: TaskColumn, taskId: string, groupId: string | null): Promise<void> {
  const rows = await columnTasks(tx, listId, column)
  const groupOf = new Map(rows.map((row) => [row.id, row.groupId]))
  let ids = rows.map((row) => row.id)
  if (groupId !== null) {
    const others = ids.filter((id) => id !== taskId)
    const last = others.findLastIndex((id) => groupOf.get(id) === groupId)
    if (last >= 0) ids = others.toSpliced(last + 1, 0, taskId)
  }
  await writeOrder(tx, normalizeBlocks(ids, (id) => groupOf.get(id) ?? null))
}

export async function createTask(
  db: Database,
  workspaceId: string,
  /** `userId` is who creates the task: a task created in done counts as completed by them (AD-006). */
  input: TaskFields & {
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
  const fields = await resolveFields(
    db,
    { listId: list.id, column: input.column, kind: 'task', estimateMinutes: null, dueOn: null, waiting: false, flagged: false, groupId: null },
    input,
  )
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
      seriesId: null,
      kind: fields.kind ?? 'task',
      priority: fields.priority ?? 'none',
      dueOn: fields.dueOn ?? null,
      waiting: fields.waiting ?? false,
      waitingFor: fields.waitingFor ?? null,
      flagged: fields.flagged ?? false,
      flagReason: fields.flagReason ?? null,
      groupId: fields.groupId ?? null,
    }
    await tx.insert(tasks).values(task)
    // A task of a group is born at the end of the group's block in its column (AD-013).
    if (task.groupId !== null) await placeAtEndOfGroup(tx as Database, list.id, task.column, task.id, task.groupId)
    const created: Subtask[] = (input.subtasks ?? []).map((title, position) => ({ id: randomUUID(), taskId: task.id, title, done: false, position }))
    if (created.length > 0) await tx.insert(subtasks).values(created)
    return getTask(tx as Database, task.id, workspaceId)
  })
}

export async function updateTask(
  db: Database,
  taskId: string,
  workspaceId: string,
  changes: TaskFields & { title?: string; estimateMinutes?: number | null; notes?: string },
  now: Date = new Date(),
): Promise<TaskWithSubtasks> {
  const task = await findTask(db, taskId, workspaceId)
  const fields = await resolveFields(db, task, changes)
  const given = Object.fromEntries(Object.entries({ ...changes, ...fields }).filter(([, value]) => value !== undefined))
  if (fields.groupId !== undefined && fields.groupId !== task.groupId) {
    // Another group puts the task at the end of that group's block, no group takes it out of the block (MODAL-04).
    await db.transaction(async (transaction) => {
      const tx = transaction as Database
      await lockList(tx, task.listId)
      await tx.update(tasks).set({ ...given, updatedAt: now }).where(eq(tasks.id, task.id))
      await placeAtEndOfGroup(tx, task.listId, task.column, task.id, fields.groupId ?? null)
    })
    return getTask(db, task.id, workspaceId)
  }
  // A change of a field is an update of the task (PICK-01).
  if (Object.keys(given).length > 0) await db.update(tasks).set({ ...given, updatedAt: now }).where(eq(tasks.id, task.id))
  return getTask(db, task.id, workspaceId)
}

/** The group left without a task out of done by a completion, for the toast `<grupo> está sem próxima ação` (GRP-10). */
export interface GroupWithoutNextAction {
  id: string
  name: string
}

/**
 * Puts the task in `column`, right before `beforeTaskId` (or at the end for null), joins the blocks of each
 * group there (AD-013) and renumbers the columns it left and entered from 0 to n-1. `group` left out keeps
 * the task's group, null takes it out of its group (GRP-07), an id puts it in that group of the same list
 * (GRP-06, GRP-08), or 422; a reminder never takes a group (MODAL-06). Entering `done` records `completed_at = now` and
 * `completed_by_user_id = byUserId` (AD-006) and takes the flag off (FLAG-05); leaving it clears both, and
 * moving inside `done` keeps them.
 * A task that is not in `today` afterwards loses its open focus session, ended at `now` (FOCUS-15).
 * Completing an occurrence of a series creates its next occurrence (`createNextOccurrence`). Completing the
 * last open task of a group answers that group in `groupWithoutNextAction` (GRP-10).
 */
export async function moveTask(
  db: Database,
  taskId: string,
  workspaceId: string,
  target: { column: TaskColumn; beforeTaskId: string | null; byUserId: string; group?: string | null },
  now: Date = new Date(),
): Promise<TaskWithSubtasks & { groupWithoutNextAction: GroupWithoutNextAction | null }> {
  const task = await findTask(db, taskId, workspaceId)
  const groupWithoutNextAction = await db.transaction(async (tx) => {
    await lockList(tx as Database, task.listId)
    // Read again under the lock: a concurrent move may have changed the column.
    const [current] = await tx.select().from(tasks).where(eq(tasks.id, task.id))
    if (!current) throw notFound()
    const groupId = target.group === undefined ? current.groupId : target.group
    const [group] =
      groupId === null
        ? []
        : await tx
            .select({ id: taskGroups.id, name: taskGroups.name })
            .from(taskGroups)
            .where(and(eq(taskGroups.id, groupId), eq(taskGroups.listId, current.listId)))
    if (groupId !== null && !group) throw fieldError('The group is not of the list of the task', 'group_of_another_list')
    if (groupId !== null && current.kind === 'reminder') {
      throw fieldError('A reminder has no due day, flag, Aguardando or group', 'reminder_field')
    }

    const rows = await columnTasks(tx as Database, current.listId, target.column)
    const groupOf = new Map(rows.map((row) => [row.id, row.groupId]))
    groupOf.set(current.id, groupId)
    const entered = rows.map((row) => row.id).filter((id) => id !== current.id)
    let at = entered.length
    if (target.beforeTaskId !== null && target.beforeTaskId !== current.id) {
      at = entered.indexOf(target.beforeTaskId)
      if (at < 0) throw notFound()
    } else if (target.beforeTaskId === current.id && current.column === target.column) {
      at = rows.findIndex((row) => row.id === current.id)
    }
    entered.splice(at, 0, current.id)

    const stays = current.column === 'done'
    const completedAt = target.column !== 'done' ? null : stays ? current.completedAt : now
    const completedByUserId = target.column !== 'done' ? null : stays ? current.completedByUserId : target.byUserId
    // Entering another column or another group is an update of the task; reordering inside the same one is not (PICK-01).
    const updated = current.column !== target.column || current.groupId !== groupId ? { updatedAt: now } : {}
    // Done takes the flag and its reason off; reopening does not bring them back (FLAG-05).
    const unflagged = target.column === 'done' ? { flagged: false, flagReason: null } : {}
    await tx
      .update(tasks)
      .set({ column: target.column, completedAt, completedByUserId, groupId, ...updated, ...unflagged })
      .where(eq(tasks.id, current.id))
    if (target.column !== 'today') await endOpenSessions(tx as Database, eq(focusSessions.taskId, current.id), now, 'task_left')
    await writeOrder(tx as Database, normalizeBlocks(entered, (id) => groupOf.get(id) ?? null))
    if (current.column !== target.column) {
      await writeOrder(tx as Database, (await columnTasks(tx as Database, current.listId, current.column)).map((row) => row.id))
    }
    // Completing an occurrence of a series creates the next one in the same write (US-10, D13).
    if (target.column === 'done' && !stays) await createNextOccurrence(tx as Database, current, workspaceId, target.byUserId, now)
    const completed = target.column === 'done' && !stays
    return completed && group && !(await hasOpenTasks(tx as Database, group.id)) ? group : null
  })
  return { ...(await getTask(db, task.id, workspaceId)), groupWithoutNextAction }
}

/** Deletes the task; its subtasks go with it (cascade, AD-005). */
export async function deleteTask(db: Database, taskId: string, workspaceId: string): Promise<void> {
  const task = await findTask(db, taskId, workspaceId)
  await db.delete(tasks).where(eq(tasks.id, task.id))
}

/**
 * A copy of the task in the same list and column, at the end of it, with the same notes, estimate,
 * subtasks (none of them done), kind, priority, due day, Aguardando and group, without the flag. A copy of a completed task starts in backlog: it has not been done yet.
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
      seriesId: null,
      kind: source.kind,
      priority: source.priority,
      dueOn: source.dueOn,
      waiting: source.waiting,
      waitingFor: source.waitingFor,
      // The copy has not met the problem the flag marks.
      flagged: false,
      flagReason: null,
      groupId: source.groupId,
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
    // A copy in a group joins the end of the group's block (AD-013).
    if (copy.groupId !== null) {
      await placeAtEndOfGroup(tx as Database, copy.listId, column, copy.id, copy.groupId)
      return getTask(tx as Database, copy.id, workspaceId)
    }
    return { ...copy, subtasks: copies, createdVia: null, series: null }
  })
}

/**
 * Moves the task to another list of the workspace, to the end of the same column, out of its group, and
 * renumbers the column it left. Its open focus session ends (FOCUS-15), as for any task that leaves Today, and all its sessions move
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
    // The group belongs to the list the task left (EDGE-04).
    await tx.update(tasks).set({ listId: target.id, position: last?.next ?? 0, groupId: null, updatedAt: now }).where(eq(tasks.id, current.id))
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
