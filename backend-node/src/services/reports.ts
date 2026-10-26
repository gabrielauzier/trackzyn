import { type SQL, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import type { Workspace } from '../db/schema.ts'
import { dayTimezone } from './day.ts'
import { settle, spentSeconds } from './focus-settle.ts'
import { getList } from './lists.ts'

/** A period of whole days, both ends included, as `YYYY-MM-DD` in the day timezone. */
export interface ReportFilter {
  from: string
  to: string
  /** Only the sessions and tasks of this list; null for every list, archived ones included. */
  listId: string | null
}

export interface Overview {
  timezone: string
  range: { from: string; to: string }
  tiles: { work_days: number; tasks_done: number; task_seconds: number; avg_seconds_per_task: number | null }
  /** One item per day of the period, in order. */
  daily: Array<{ date: string; task_seconds: number; break_seconds: number }>
  /** Hours 0..23, ISO weekdays 1 (Monday)..7 and `YYYY-MM` months with the most task time; every tie. */
  productive: { hours: number[]; weekdays: number[]; months: string[] }
  /** Task time per list, lists without time left out. */
  by_list: Array<{ list_id: string; name: string; color: number; is_archived: boolean; seconds: number }>
  break_seconds: number
  done: DoneReport
}

export type Verdict = 'early' | 'on_time' | 'late'

export interface DoneTask {
  id: string
  title: string
  list_id: string
  /** All the time of the task, of every member and from before the period too. */
  spent_seconds: number
  estimate_minutes: number | null
  /** Null without an estimate (REPORT-18). */
  verdict: Verdict | null
  /** `spent_seconds` minus the estimate; 0 without an estimate. */
  diff_seconds: number
}

export interface DoneReport {
  /** The user's completions in the period by local day, the most recent day first (REPORT-14). */
  days: Array<{ date: string; tasks: DoneTask[] }>
  /** Shares of green and red badges among the tasks with an estimate, two decimals; null without any. */
  early_or_on_time_pct: number | null
  late_pct: number | null
}

/** Within 5% of the estimate either way is on time (REPORT-15); below is early, above is late. */
export const ON_TIME_TOLERANCE = 0.05

export function verdictOf(spentSeconds: number, estimateMinutes: number | null): { verdict: Verdict | null; diff: number } {
  if (estimateMinutes === null) return { verdict: null, diff: 0 }
  const estimate = estimateMinutes * 60
  const diff = spentSeconds - estimate
  if (Math.abs(diff) <= ON_TIME_TOLERANCE * estimate) return { verdict: 'on_time', diff }
  return { verdict: diff < 0 ? 'early' : 'late', diff }
}

export interface ReportScope {
  timezone: string
  /** The first instant of the period (timestamptz). */
  lo: SQL
  /** The first instant after the period (timestamptz). */
  hi: SQL
  /** The query instant (timestamptz). */
  now: SQL
  /** `AND <alias>.list_id = ...`, or nothing without a list filter. */
  listFilter: (alias: string) => SQL
}

/**
 * Settles the user's due sessions (AD-001), checks the list of the filter (404 when it is not in the
 * workspace) and returns the period bounds in the day timezone (AD-004).
 */
export async function reportScope(
  tx: Database,
  userId: string,
  workspace: Pick<Workspace, 'id' | 'timezone'>,
  filter: ReportFilter,
  now: Date,
): Promise<ReportScope> {
  await settle(tx, userId, now)
  if (filter.listId !== null) await getList(tx, filter.listId, workspace.id)
  const timezone = await dayTimezone(tx, workspace)
  const listId = filter.listId
  return {
    timezone,
    lo: sql`((${filter.from}::date)::timestamp AT TIME ZONE ${timezone})`,
    hi: sql`(((${filter.to}::date + 1))::timestamp AT TIME ZONE ${timezone})`,
    now: sql`${now.toISOString()}::timestamptz`,
    listFilter: (alias) => (listId === null ? sql`` : sql`AND ${sql.raw(alias)}.list_id = ${listId}`),
  }
}

/**
 * The user's sessions of the workspace that overlap the period, cut to it: `a` is the start and `z` the
 * end inside the period; an open session runs until `now` (REPORT-11).
 */
export function clippedSessions(scope: ReportScope, userId: string, workspaceId: string): SQL {
  return sql`SELECT fs.id, fs.kind, fs.list_id, fs.task_id, fs.started_at, fs.ended_at,
                    greatest(fs.started_at, ${scope.lo}) AS a,
                    least(coalesce(fs.ended_at, ${scope.now}), ${scope.hi}) AS z
             FROM focus_sessions fs
             WHERE fs.user_id = ${userId} AND fs.workspace_id = ${workspaceId}
               AND fs.started_at < ${scope.hi} AND coalesce(fs.ended_at, ${scope.now}) > ${scope.lo}
               ${scope.listFilter('fs')}`
}

interface OverviewRow extends Record<string, unknown> {
  daily: Array<{ date: string; task_seconds: number; break_seconds: number }>
  hours: number[] | null
  weekdays: number[] | null
  months: string[] | null
  by_list: Overview['by_list'] | null
  /** The exact (fractional) task seconds of the period, rounded only where reported. */
  task_exact: number
  break_seconds: number
  tasks_done: number
}

/**
 * The overview of the user's own time in a period (REPORT-01 to REPORT-12). Each session is cut at every
 * hour of the day timezone, which also cuts it at midnight (REPORT-10) and follows daylight saving time;
 * the days, weekdays, months and hours are read from the local start of each hour. Every reported value
 * is floored once from its exact sum: each day on its own, and the totals from all the slices.
 */
export async function overview(
  tx: Database,
  userId: string,
  workspace: Pick<Workspace, 'id' | 'timezone'>,
  filter: ReportFilter,
  now: Date,
): Promise<Overview> {
  const scope = await reportScope(tx, userId, workspace, filter, now)
  const tz = scope.timezone
  const result = (await tx.execute(sql`
    WITH s AS (${clippedSessions(scope, userId, workspace.id)}),
    slices AS (
      SELECT s.kind, s.list_id, (h AT TIME ZONE ${tz}) AS local,
             extract(epoch FROM least(s.z, h + interval '1 hour') - greatest(s.a, h)) AS sec
      FROM s, LATERAL generate_series(date_trunc('hour', s.a, ${tz}), s.z, interval '1 hour') AS h
      WHERE s.z > s.a
    ),
    by_day AS (
      SELECT local::date AS day,
             floor(coalesce(sum(sec) FILTER (WHERE kind = 'task'), 0))::int AS task_seconds,
             floor(coalesce(sum(sec) FILTER (WHERE kind = 'break'), 0))::int AS break_seconds
      FROM slices GROUP BY 1
    ),
    hours AS (SELECT extract(hour FROM local)::int AS v, floor(sum(sec)) AS sec FROM slices WHERE kind = 'task' GROUP BY 1),
    weekdays AS (SELECT extract(isodow FROM local)::int AS v, floor(sum(sec)) AS sec FROM slices WHERE kind = 'task' GROUP BY 1),
    months AS (SELECT to_char(local, 'YYYY-MM') AS v, floor(sum(sec)) AS sec FROM slices WHERE kind = 'task' GROUP BY 1),
    lists_time AS (
      SELECT l.id AS list_id, l.name, l.color, l.is_archived, floor(sum(sl.sec))::int AS seconds
      FROM slices sl JOIN lists l ON l.id = sl.list_id WHERE sl.kind = 'task'
      GROUP BY l.id HAVING floor(sum(sl.sec)) > 0
    )
    SELECT
      (SELECT json_agg(json_build_object('date', d::date::text, 'task_seconds', coalesce(b.task_seconds, 0),
                                         'break_seconds', coalesce(b.break_seconds, 0)) ORDER BY d)
       FROM generate_series(${filter.from}::date, ${filter.to}::date, interval '1 day') AS d
       LEFT JOIN by_day b ON b.day = d::date) AS daily,
      (SELECT json_agg(v ORDER BY v) FROM hours WHERE sec > 0 AND sec = (SELECT max(sec) FROM hours)) AS hours,
      (SELECT json_agg(v ORDER BY v) FROM weekdays WHERE sec > 0 AND sec = (SELECT max(sec) FROM weekdays)) AS weekdays,
      (SELECT json_agg(v ORDER BY v) FROM months WHERE sec > 0 AND sec = (SELECT max(sec) FROM months)) AS months,
      (SELECT json_agg(json_build_object('list_id', list_id, 'name', name, 'color', color, 'is_archived', is_archived,
                                         'seconds', seconds) ORDER BY seconds DESC, name, list_id) FROM lists_time) AS by_list,
      (SELECT coalesce(sum(sec), 0)::float8 FROM slices WHERE kind = 'task') AS task_exact,
      (SELECT floor(coalesce(sum(sec), 0))::int FROM slices WHERE kind = 'break') AS break_seconds,
      (SELECT count(*)::int FROM tasks t JOIN lists l ON l.id = t.list_id
       WHERE l.workspace_id = ${workspace.id} AND t.completed_by_user_id = ${userId}
         AND t.completed_at >= ${scope.lo} AND t.completed_at < ${scope.hi} ${scope.listFilter('t')}) AS tasks_done
  `)) as unknown as { rows: OverviewRow[] }
  const row = result.rows[0]!

  // Totals come from the exact sum, rounded once: summing the floored days would lose up to a second
  // per day a session crosses.
  const taskSeconds = Math.floor(row.task_exact)
  return {
    timezone: tz,
    range: { from: filter.from, to: filter.to },
    tiles: {
      work_days: row.daily.filter((day) => day.task_seconds > 0).length,
      tasks_done: row.tasks_done,
      task_seconds: taskSeconds,
      avg_seconds_per_task: row.tasks_done === 0 ? null : Math.round(row.task_exact / row.tasks_done),
    },
    daily: row.daily,
    productive: { hours: row.hours ?? [], weekdays: row.weekdays ?? [], months: row.months ?? [] },
    by_list: row.by_list ?? [],
    break_seconds: row.break_seconds,
    done: await doneReport(tx, userId, workspace.id, scope, now),
  }
}

/**
 * The tasks the user completed in the period with their badge against the estimate, from the task's
 * total time (REPORT-14 to REPORT-19). The red share is 100 minus the green one, so both add up to 100.
 */
async function doneReport(tx: Database, userId: string, workspaceId: string, scope: ReportScope, now: Date): Promise<DoneReport> {
  const found = (
    (await tx.execute(sql`
      SELECT t.id, t.title, t.list_id, t.estimate_minutes, (t.completed_at AT TIME ZONE ${scope.timezone})::date::text AS date
      FROM tasks t JOIN lists l ON l.id = t.list_id
      WHERE l.workspace_id = ${workspaceId} AND t.completed_by_user_id = ${userId}
        AND t.completed_at >= ${scope.lo} AND t.completed_at < ${scope.hi} ${scope.listFilter('t')}
      ORDER BY t.completed_at DESC, t.id`)) as unknown as {
      rows: Array<{ id: string; title: string; list_id: string; estimate_minutes: number | null; date: string }>
    }
  ).rows
  const spent = await spentSeconds(
    tx,
    found.map((row) => row.id),
    now,
  )

  const days: DoneReport['days'] = []
  for (const row of found) {
    const spentSeconds = spent.get(row.id) ?? 0
    const { verdict, diff } = verdictOf(spentSeconds, row.estimate_minutes)
    const view: DoneTask = {
      id: row.id,
      title: row.title,
      list_id: row.list_id,
      spent_seconds: spentSeconds,
      estimate_minutes: row.estimate_minutes,
      verdict,
      diff_seconds: diff,
    }
    const last = days.at(-1)
    if (last?.date === row.date) last.tasks.push(view)
    else days.push({ date: row.date, tasks: [view] })
  }

  const judged = days.flatMap((item) => item.tasks).filter((item) => item.verdict !== null)
  if (judged.length === 0) return { days, early_or_on_time_pct: null, late_pct: null }
  const green = Math.round((judged.filter((item) => item.verdict !== 'late').length / judged.length) * 10_000) / 100
  return { days, early_or_on_time_pct: green, late_pct: Math.round((100 - green) * 100) / 100 }
}
