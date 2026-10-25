import { type SQL, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import type { Workspace } from '../db/schema.ts'
import { dayTimezone } from './day.ts'
import { settle } from './focus-settle.ts'
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
  break_seconds: number
  tasks_done: number
}

/**
 * The overview of the user's own time in a period (REPORT-01 to REPORT-12). Each session is cut at every
 * hour of the day timezone, which also cuts it at midnight (REPORT-10) and follows daylight saving time;
 * the days, weekdays, months and hours are read from the local start of each hour.
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
      (SELECT floor(coalesce(sum(sec), 0))::int FROM slices WHERE kind = 'break') AS break_seconds,
      (SELECT count(*)::int FROM tasks t JOIN lists l ON l.id = t.list_id
       WHERE l.workspace_id = ${workspace.id} AND t.completed_by_user_id = ${userId}
         AND t.completed_at >= ${scope.lo} AND t.completed_at < ${scope.hi} ${scope.listFilter('t')}) AS tasks_done
  `)) as unknown as { rows: OverviewRow[] }
  const row = result.rows[0]!

  const taskSeconds = row.daily.reduce((total, day) => total + day.task_seconds, 0)
  return {
    timezone: tz,
    range: { from: filter.from, to: filter.to },
    tiles: {
      work_days: row.daily.filter((day) => day.task_seconds > 0).length,
      tasks_done: row.tasks_done,
      task_seconds: taskSeconds,
      avg_seconds_per_task: row.tasks_done === 0 ? null : Math.round(taskSeconds / row.tasks_done),
    },
    daily: row.daily,
    productive: { hours: row.hours ?? [], weekdays: row.weekdays ?? [], months: row.months ?? [] },
    by_list: row.by_list ?? [],
    break_seconds: row.break_seconds,
  }
}
