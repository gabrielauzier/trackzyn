import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type FocusSessionKind, type FocusSessionOrigin, type Workspace, users } from '../db/schema.ts'
import { type ReportFilter, reportScope } from './reports.ts'

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
    const found = (await tx.execute(sql`
      SELECT fs.id, fs.kind, fs.origin, fs.task_id, t.title AS task_title, fs.list_id, l.name AS list_name,
             l.color AS list_color, fs.started_at, fs.ended_at
      FROM focus_sessions fs JOIN lists l ON l.id = fs.list_id LEFT JOIN tasks t ON t.id = fs.task_id
      WHERE fs.user_id = ${actor.userId} AND fs.workspace_id = ${workspace.id}
        AND fs.started_at < ${scope.hi} AND coalesce(fs.ended_at, ${scope.now}) > ${scope.lo}
        ${scope.listFilter('fs')}
      ORDER BY fs.started_at, fs.id`)) as unknown as { rows: SessionRow[] }
    return found.rows.map(toAgendaSession)
  })
}
