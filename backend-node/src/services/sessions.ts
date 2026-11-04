import { randomUUID } from 'node:crypto'
import { type SQL, and, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type FocusSessionKind, type FocusSessionOrigin, type TaskColumn, type Workspace, focusSessions, lists, users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { FUTURE_TOLERANCE_MS, invalidTime } from './focus.ts'
import { settle } from './focus-settle.ts'
import { getList } from './lists.ts'
import { type ReportFilter, reportScope } from './reports.ts'
import { findTask } from './tasks.ts'

/** Who reads or writes the agenda: the logged-in user. */
export interface SessionActor {
  userId: string
}

/** Whole days `from`..`to` (both included) in the workspace timezone, and the optional list filter. */
export type AgendaFilter = ReportFilter

/** One session as the agenda shows it: whole, never cut at midnight or at the period edges. */
export interface AgendaSession {
  id: string
  kind: FocusSessionKind
  origin: FocusSessionOrigin
  task_id: string | null
  /** Null for a break, shown as `Intervalo`. */
  task_title: string | null
  list_id: string
  list_name: string
  list_color: number
  started_at: string
  /** Null while the session is open. */
  ended_at: string | null
}

type Workspaceish = Pick<Workspace, 'id' | 'timezone'>

/** A session to record: a task session names its task, a break names its list (AGENDA-16). */
type SessionOwner = { kind: 'task'; taskId: string } | { kind: 'break'; listId: string }
export type SessionInput = SessionOwner & { startedAt: Date; endedAt: Date }

const MIN_DURATION_MS = 60_000
const MAX_DURATION_MS = 24 * 60 * 60 * 1000

/** What an edit may change; absent fields keep their value (AGENDA-31). */
export interface SessionChanges {
  startedAt?: Date
  endedAt?: Date
  /** Only for a task session. */
  taskId?: string
  /** Only for a break. */
  listId?: string
}

const sessionNotFound = () => new HttpError(404, 'Session not found')

const sessionRunning = () =>
  new HttpError(409, 'The session is still running; pause it in the focus first', {}, { code: 'session_running' })

const invalidDuration = () =>
  new HttpError(422, 'A session lasts from 1 minute to 24 hours', {}, { code: 'invalid_duration' })

/** Serialises the agenda with the focus actions of the same user, as `applyAction` does. */
async function lockUser(tx: Database, userId: string): Promise<void> {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update')
}

interface SessionRow {
  id: string
  kind: FocusSessionKind
  origin: FocusSessionOrigin
  task_id: string | null
  task_title: string | null
  list_id: string
  list_name: string
  list_color: number
  started_at: string | Date
  ended_at: string | Date | null
}

const toAgendaSession = (row: SessionRow): AgendaSession => ({
  ...row,
  started_at: new Date(row.started_at).toISOString(),
  ended_at: row.ended_at === null ? null : new Date(row.ended_at).toISOString(),
})

/** The sessions matching `where`, with their task and list, in start order. */
async function selectSessions(tx: Database, where: SQL): Promise<AgendaSession[]> {
  const found = (await tx.execute(sql`
    SELECT fs.id, fs.kind, fs.origin, fs.task_id, t.title AS task_title, fs.list_id, l.name AS list_name,
           l.color AS list_color, fs.started_at, fs.ended_at
    FROM focus_sessions fs JOIN lists l ON l.id = fs.list_id LEFT JOIN tasks t ON t.id = fs.task_id
    WHERE ${where}
    ORDER BY fs.started_at, fs.id`)) as unknown as { rows: SessionRow[] }
  return found.rows.map(toAgendaSession)
}

/** The end no later than 5 s after `now` (AGENDA-23), then 1 min to 24 h after the start (AGENDA-24). */
function checkInterval(startedAt: Date, endedAt: Date, now: Date): void {
  if (endedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) throw invalidTime()
  const duration = endedAt.getTime() - startedAt.getTime()
  if (duration < MIN_DURATION_MS || duration > MAX_DURATION_MS) throw invalidDuration()
}

/** The list and task a session goes to: a task of an active list of the workspace (AGENDA-25), or the break's list. */
async function sessionTarget(
  tx: Database,
  workspaceId: string,
  input: SessionOwner,
): Promise<{ listId: string; taskId: string | null }> {
  if (input.kind === 'break') return { listId: (await getList(tx, input.listId, workspaceId)).id, taskId: null }
  const task = await findTask(tx, input.taskId, workspaceId)
  const [list] = await tx.select({ isArchived: lists.isArchived }).from(lists).where(eq(lists.id, task.listId))
  if (list?.isArchived !== false) throw new HttpError(404, 'Task not found')
  return { listId: task.listId, taskId: task.id }
}

/**
 * The user's sessions of the workspace that touch `[from 00:00, to+1 00:00)` in the workspace timezone,
 * in start order (AGENDA-01, AGENDA-07, AGENDA-10). Settles first (AD-001), so a session past its deadline
 * comes closed; the open one comes with `ended_at: null` (AGENDA-05).
 */
export function listSessions(
  db: Database,
  actor: SessionActor,
  workspace: Workspaceish,
  filter: AgendaFilter,
  now: Date,
): Promise<AgendaSession[]> {
  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    await lockUser(tx, actor.userId)
    const scope = await reportScope(tx, actor.userId, workspace, filter, now)
    return selectSessions(
      tx,
      sql`fs.user_id = ${actor.userId} AND fs.workspace_id = ${workspace.id}
          AND fs.started_at < ${scope.hi} AND coalesce(fs.ended_at, ${scope.now}) > ${scope.lo}
          ${scope.listFilter('fs')}`,
    )
  })
}

/**
 * Records an ended session from the agenda (AGENDA-20, AD-008): under the user lock and after settling,
 * checks the interval and the task or list, and stores it with `origin = 'manual'`. It counts in the time
 * spent and in the reports like a focus session (AGENDA-21, AGENDA-22).
 */
export function createSession(
  db: Database,
  actor: SessionActor,
  workspace: Workspaceish,
  input: SessionInput,
  now: Date,
): Promise<AgendaSession> {
  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    await lockUser(tx, actor.userId)
    await settle(tx, actor.userId, now)
    checkInterval(input.startedAt, input.endedAt, now)
    const target = await sessionTarget(tx, workspace.id, input)
    const id = randomUUID()
    await tx.insert(focusSessions).values({
      id,
      userId: actor.userId,
      workspaceId: workspace.id,
      listId: target.listId,
      taskId: target.taskId,
      kind: input.kind,
      deviceId: 'agenda',
      startedAt: input.startedAt,
      endedAt: input.endedAt,
      lastSeenAt: input.endedAt,
      endReason: 'manual',
      origin: 'manual',
    })
    const [created] = await selectSessions(tx, sql`fs.id = ${id}`)
    return created!
  })
}

/**
 * The ended session `id` of the user in the workspace, locked: 404 when it is not theirs (AGENDA-34),
 * 409 `session_running` while it is open (AGENDA-33). Runs after settling, so a session past its
 * deadline is already ended.
 */
async function endedSession(tx: Database, actor: SessionActor, workspaceId: string, id: string) {
  const [session] = await tx
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.id, id), eq(focusSessions.userId, actor.userId), eq(focusSessions.workspaceId, workspaceId)))
    .for('update')
  if (!session) throw sessionNotFound()
  if (session.endedAt === null) throw sessionRunning()
  return { ...session, endedAt: session.endedAt }
}

/**
 * Changes the start, the end and, when sent, the task (task session) or the list (break) of an ended
 * session, with the checks of `createSession` (AGENDA-29 to AGENDA-31). The origin stays.
 */
export function updateSession(
  db: Database,
  actor: SessionActor,
  workspace: Workspaceish,
  id: string,
  changes: SessionChanges,
  now: Date,
): Promise<AgendaSession> {
  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    await lockUser(tx, actor.userId)
    await settle(tx, actor.userId, now)
    const session = await endedSession(tx, actor, workspace.id, id)
    const startedAt = changes.startedAt ?? session.startedAt
    const endedAt = changes.endedAt ?? session.endedAt
    checkInterval(startedAt, endedAt, now)
    let target = { listId: session.listId, taskId: session.taskId }
    if (session.kind === 'task' && changes.taskId !== undefined) {
      target = await sessionTarget(tx, workspace.id, { kind: 'task', taskId: changes.taskId })
    } else if (session.kind === 'break' && changes.listId !== undefined) {
      target = await sessionTarget(tx, workspace.id, { kind: 'break', listId: changes.listId })
    }
    await tx
      .update(focusSessions)
      .set({ startedAt, endedAt, listId: target.listId, taskId: target.taskId })
      .where(eq(focusSessions.id, id))
    const [updated] = await selectSessions(tx, sql`fs.id = ${id}`)
    return updated!
  })
}

/** Deletes an ended session of the user; its length leaves the time spent and the reports (AGENDA-32). */
export async function deleteSession(db: Database, actor: SessionActor, workspace: Workspaceish, id: string, now: Date): Promise<void> {
  await db.transaction(async (transaction) => {
    const tx = transaction as Database
    await lockUser(tx, actor.userId)
    await settle(tx, actor.userId, now)
    await endedSession(tx, actor, workspace.id, id)
    await tx.delete(focusSessions).where(eq(focusSessions.id, id))
  })
}

/** A task a session can go to, with its list (AGENDA-16). */
export interface SessionTask {
  id: string
  title: string
  list_id: string
  list_name: string
  list_color: number
  column: TaskColumn
}

/**
 * The tasks of the active lists of the workspace in every column, Done of any date included, for the
 * task picker of the agenda panel (AGENDA-16). In list order, then in board order.
 */
export async function listSessionTasks(db: Database, workspace: Pick<Workspace, 'id'>): Promise<SessionTask[]> {
  const found = (await db.execute(sql`
    SELECT t.id, t.title, t.list_id, l.name AS list_name, l.color AS list_color, t."column"
    FROM tasks t JOIN lists l ON l.id = t.list_id
    WHERE l.workspace_id = ${workspace.id} AND NOT l.is_archived
    ORDER BY l.position, l.created_at, t.position, t.created_at`)) as unknown as { rows: SessionTask[] }
  return found.rows
}
