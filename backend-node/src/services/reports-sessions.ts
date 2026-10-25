import { sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import type { Workspace } from '../db/schema.ts'
import { type ReportFilter, clippedSessions, reportScope } from './reports.ts'

export interface SessionRow {
  id: string
  kind: 'task' | 'break'
  /** Null for a break, shown as `Intervalo`. */
  task_title: string | null
  list_name: string
  started_at: string
  /** Null while the session is open (REPORT-21). */
  ended_at: string | null
  /** The part of the session inside the period; an open session counts until now. */
  seconds: number
}

export interface SessionsReport {
  /** By the local day the session starts in the period, the most recent day and session first. */
  days: Array<{ date: string; sessions: SessionRow[] }>
}

/** Every session of the user in the period, with the same settlement, bounds and filter as the overview (REPORT-20). */
export async function sessionsReport(
  tx: Database,
  userId: string,
  workspace: Pick<Workspace, 'id' | 'timezone'>,
  filter: ReportFilter,
  now: Date,
): Promise<SessionsReport> {
  const scope = await reportScope(tx, userId, workspace, filter, now)
  const found = (
    (await tx.execute(sql`
      WITH s AS (${clippedSessions(scope, userId, workspace.id)})
      SELECT s.id, s.kind, t.title AS task_title, l.name AS list_name,
             (s.a AT TIME ZONE ${scope.timezone})::date::text AS date,
             s.started_at, s.ended_at,
             floor(extract(epoch FROM s.z - s.a))::int AS seconds
      FROM s JOIN lists l ON l.id = s.list_id LEFT JOIN tasks t ON t.id = s.task_id
      ORDER BY s.a DESC, s.id`)) as unknown as {
      rows: Array<Omit<SessionRow, 'started_at' | 'ended_at'> & { date: string; started_at: string | Date; ended_at: string | Date | null }>
    }
  ).rows

  const days: SessionsReport['days'] = []
  for (const { date, ...row } of found) {
    const session: SessionRow = {
      ...row,
      started_at: new Date(row.started_at).toISOString(),
      ended_at: row.ended_at === null ? null : new Date(row.ended_at).toISOString(),
    }
    const last = days.at(-1)
    if (last?.date === date) last.sessions.push(session)
    else days.push({ date, sessions: [session] })
  }
  return { days }
}
