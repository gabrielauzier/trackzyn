import { type SQL, and, eq, isNull, lt, lte, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type FocusEndReason, focusActions, focusSessions } from '../db/schema.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Closes every open session of the user whose deadline has passed, exactly at the deadline (AD-001):
 * a task session ends with `estimate`, a break with `break_end`. Also forgets the actions applied more
 * than 24h ago, which no client may resend any more (AD-002).
 */
export async function settle(tx: Database, userId: string, now: Date): Promise<void> {
  await tx
    .update(focusSessions)
    .set({
      endedAt: sql`${focusSessions.deadlineAt}`,
      endReason: sql`CASE ${focusSessions.kind} WHEN 'task' THEN 'estimate' ELSE 'break_end' END`,
    })
    .where(and(eq(focusSessions.userId, userId), isNull(focusSessions.endedAt), lte(focusSessions.deadlineAt, now)))
  await tx
    .delete(focusActions)
    .where(and(eq(focusActions.userId, userId), lt(focusActions.appliedAt, new Date(now.getTime() - DAY_MS))))
}

/**
 * Milliseconds of focus spent on each task, over every task session of every member up to `now`. An open
 * session counts until `now`, and never past its deadline, so a session nobody settled yet is still exact.
 * The workspace of each task picks the count (AD-010): `gross` sums the sessions, `net` measures their union,
 * so time two sessions of the task share counts once (HOURS-23, HOURS-26). Tasks without sessions are absent
 * from the map.
 */
export async function spentMilliseconds(tx: Database, taskIds: string[], now: Date): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map()
  const instant = sql`${now.toISOString()}::timestamptz`
  const ids = sql.join(
    taskIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  )
  const result = (await tx.execute(sql`
    WITH s AS (
      SELECT fs.task_id, fs.started_at AS a,
             coalesce(fs.ended_at, least(${instant}, coalesce(fs.deadline_at, ${instant}))) AS z
      FROM focus_sessions fs
      WHERE fs.kind = 'task' AND fs.task_id IN (${ids})
    ),
    agg AS (
      SELECT task_id, extract(epoch FROM sum(z - a)) AS gross, range_agg(tstzrange(a, greatest(a, z))) AS m
      FROM s GROUP BY task_id
    )
    SELECT agg.task_id,
           round(CASE WHEN w.hours_count_mode = 'net'
                      THEN coalesce((SELECT extract(epoch FROM sum(upper(r) - lower(r))) FROM unnest(agg.m) AS r), 0)
                      ELSE agg.gross END * 1000)::float8 AS ms
    FROM agg
    JOIN tasks t ON t.id = agg.task_id
    JOIN lists l ON l.id = t.list_id
    JOIN workspaces w ON w.id = l.workspace_id
  `)) as unknown as { rows: Array<{ task_id: string; ms: number }> }
  return new Map(result.rows.map((row) => [row.task_id, Number(row.ms)]))
}

/** `spentMilliseconds` in whole seconds, as the board and the focus screen show it. */
export async function spentSeconds(tx: Database, taskIds: string[], now: Date): Promise<Map<string, number>> {
  const spent = await spentMilliseconds(tx, taskIds, now)
  return new Map([...spent].map(([taskId, ms]) => [taskId, Math.floor(ms / 1000)]))
}

/**
 * Ends the open sessions that match `filter` at `now` with `reason`. A session whose deadline already
 * passed ends at the deadline instead, as settlement would have closed it (AD-001).
 */
export async function endOpenSessions(tx: Database, filter: SQL, now: Date, reason: FocusEndReason): Promise<void> {
  const due = sql`${focusSessions.deadlineAt} <= ${now.toISOString()}::timestamptz`
  await tx
    .update(focusSessions)
    .set({
      endedAt: sql`CASE WHEN ${due} THEN ${focusSessions.deadlineAt} ELSE ${now.toISOString()}::timestamptz END`,
      endReason: sql`CASE WHEN ${due} THEN CASE ${focusSessions.kind} WHEN 'task' THEN 'estimate' ELSE 'break_end' END ELSE ${reason} END`,
    })
    .where(and(isNull(focusSessions.endedAt), filter))
}
