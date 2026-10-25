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
  /** The start of this piece: the session is cut at each local midnight and at the period edges. */
  started_at: string
  /** The end of this piece; null on the last piece of an open session (REPORT-21). */
  ended_at: string | null
  /** The length of this piece; an open session counts until now. */
  seconds: number
}

export interface SessionsReport {
  /** One row per session and local day it touches in the period, the most recent day and piece first. */
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
      WITH s AS (${clippedSessions(scope, userId, workspace.id)}),
      pieces AS (
        SELECT s.*, d::date::text AS date,
               greatest(s.a, d AT TIME ZONE ${scope.timezone}) AS pa,
               least(s.z, (d + interval '1 day') AT TIME ZONE ${scope.timezone}) AS pz
        FROM s, LATERAL generate_series(date_trunc('day', s.a AT TIME ZONE ${scope.timezone}),
                                        s.z AT TIME ZONE ${scope.timezone}, interval '1 day') AS d
      )
      SELECT p.id, p.kind, t.title AS task_title, l.name AS list_name, p.date, p.pa AS started_at,
             CASE WHEN p.pz = coalesce(p.ended_at, ${scope.now}) THEN p.ended_at ELSE p.pz END AS ended_at,
             floor(extract(epoch FROM p.pz - p.pa))::int AS seconds
      FROM pieces p JOIN lists l ON l.id = p.list_id LEFT JOIN tasks t ON t.id = p.task_id
      WHERE p.pz > p.pa OR p.z = p.a
      ORDER BY p.pa DESC, p.id`)) as unknown as {
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
