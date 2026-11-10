import { sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import type { SeriesFreq, TaskColumn, Workspace } from '../db/schema.ts'
import { daySql, dayTimezone } from './day.ts'
import { settle, spentSeconds } from './focus-settle.ts'
import { getList } from './lists.ts'
import { seriesView } from './series.ts'

export interface TaskCardView {
  id: string
  title: string
  estimate_minutes: number | null
  spent_seconds: number
  position: number
  subtasks: { done: number; total: number }
  /** The name of the token that created the task, while that token exists. */
  created_via: string | null
  /** The scheduled day (`YYYY-MM-DD`) and start time (`HH:MM`), in the workspace's timezone. */
  scheduled_on: string | null
  scheduled_time: string | null
  /** The series the task is an occurrence of: its rule and the next day it projects. */
  series: ReturnType<typeof seriesView> | null
}

export interface ColumnView {
  tasks: TaskCardView[]
  estimate_minutes: number
}

export interface ProgressColumnView extends ColumnView {
  /** Tasks of the list completed in the period (today, or since Monday). */
  done: number
  /** `done` plus the pending tasks the period covers. */
  total: number
}

export interface Board {
  list: { id: string; name: string; color: number }
  timezone: string
  pending: { count: number; estimate_minutes: number }
  columns: {
    backlog: ColumnView
    this_week: ProgressColumnView
    today: ProgressColumnView
    done: { today_count: number; days: Array<{ date: string; tasks: TaskCardView[] }> }
  }
}

/**
 * Seconds of focus spent on each of `taskIds`, after closing the reader's due sessions (AD-001), so the
 * board and the focus screen agree on the same instant.
 */
export async function spentSecondsByTask(
  db: Database,
  taskIds: string[],
  userId: string,
  now: Date,
): Promise<Map<string, number>> {
  await settle(db, userId, now)
  return spentSeconds(db, taskIds, now)
}

interface TaskRow extends Record<string, unknown> {
  id: string
  title: string
  estimate_minutes: number | null
  column: TaskColumn
  position: number
  completed_date: string | null
  /** When the task was completed, as epoch milliseconds; null while pending. */
  completed_ms: number | null
  subtasks_done: number
  subtasks_total: number
  created_via: string | null
  scheduled_on: string | null
  scheduled_time: string | null
  series_id: string | null
  series_freq: SeriesFreq | null
  series_interval: number | null
  series_weekdays: number[] | null
  series_month_day: number | null
  series_until: string | null
  series_count: number | null
  series_created_count: number | null
  series_ended_at: Date | null
}

async function rows<T>(db: Database, query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows
}

const sum = (views: TaskCardView[]) => views.reduce((total, task) => total + (task.estimate_minutes ?? 0), 0)

/**
 * The board of a list in the workspace's day timezone (AD-004): the pending columns in order with
 * their estimate sums, the `x/y` progress of Today and This week, and Done with today and the last
 * earlier day that had a completion.
 */
export async function buildBoard(
  db: Database,
  listId: string,
  workspace: Pick<Workspace, 'id' | 'timezone'>,
  /** The reader, whose due focus sessions are settled before the time spent is summed. */
  userId: string,
  now: Date = new Date(),
): Promise<Board> {
  const list = await getList(db, listId, workspace.id)
  const timezone = await dayTimezone(db, workspace)
  const day = daySql(timezone, now)
  const completedDate = sql`(t.completed_at AT TIME ZONE ${timezone})::date`

  const [counts] = await rows<{ today: string; done_today: number; done_week: number }>(
    db,
    sql`SELECT (${day.today})::text AS today,
               count(*) FILTER (WHERE t.completed_at >= ${day.todayStart})::int AS done_today,
               count(*) FILTER (WHERE t.completed_at >= ${day.weekStart})::int AS done_week
        FROM tasks t WHERE t.list_id = ${list.id} AND t."column" = 'done'`,
  )
  const today = counts!.today

  const found = await rows<TaskRow>(
    db,
    sql`WITH previous AS (
          SELECT max(${completedDate}) AS day FROM tasks t
          WHERE t.list_id = ${list.id} AND t."column" = 'done' AND ${completedDate} < ${today}::date
        )
        SELECT t.id, t.title, t.estimate_minutes, t."column", t.position,
               CASE WHEN t."column" = 'done' THEN (${completedDate})::text END AS completed_date,
               (extract(epoch FROM t.completed_at) * 1000)::float8 AS completed_ms,
               count(s.id) FILTER (WHERE s.done)::int AS subtasks_done,
               count(s.id)::int AS subtasks_total,
               coalesce(p.name, CASE WHEN t.created_from = 'agenda' THEN 'Agenda' END) AS created_via,
               t.scheduled_on::text AS scheduled_on, to_char(t.scheduled_time, 'HH24:MI') AS scheduled_time,
               ts.id AS series_id, ts.freq AS series_freq, ts."interval" AS series_interval, ts.weekdays AS series_weekdays,
               ts.month_day AS series_month_day, ts.until::text AS series_until, ts."count" AS series_count,
               ts.created_count AS series_created_count, ts.ended_at AS series_ended_at
        FROM tasks t
        LEFT JOIN task_series ts ON ts.id = t.series_id
        LEFT JOIN subtasks s ON s.task_id = t.id
        LEFT JOIN personal_access_tokens p ON p.id = t.created_via_token_id
        WHERE t.list_id = ${list.id}
          AND (t."column" <> 'done' OR ${completedDate} = ${today}::date OR ${completedDate} = (SELECT day FROM previous))
        GROUP BY t.id, p.name, ts.id
        ORDER BY t.position, t.created_at`,
  )

  const spent = await spentSecondsByTask(
    db,
    found.map((row) => row.id),
    userId,
    now,
  )
  const view = (row: TaskRow): TaskCardView => ({
    id: row.id,
    title: row.title,
    estimate_minutes: row.estimate_minutes,
    spent_seconds: spent.get(row.id) ?? 0,
    position: row.position,
    subtasks: { done: row.subtasks_done, total: row.subtasks_total },
    created_via: row.created_via,
    scheduled_on: row.scheduled_on,
    scheduled_time: row.scheduled_time,
    series:
      row.series_id === null
        ? null
        : seriesView(
            {
              id: row.series_id,
              freq: row.series_freq!,
              interval: row.series_interval!,
              weekdays: row.series_weekdays,
              monthDay: row.series_month_day,
              until: row.series_until,
              count: row.series_count,
              createdCount: row.series_created_count!,
              endedAt: row.series_ended_at,
            },
            row.scheduled_on,
          ),
  })
  const inColumn = (column: TaskColumn) => found.filter((row) => row.column === column).map(view)

  const backlog = inColumn('backlog')
  const thisWeek = inColumn('this_week')
  const todayTasks = inColumn('today')

  // Each day of Done lists the latest completion first.
  const doneRows = found
    .filter((row) => row.column === 'done')
    .sort((a, b) => Number(b.completed_ms ?? 0) - Number(a.completed_ms ?? 0))
  const dates = [...new Set(doneRows.map((row) => row.completed_date as string))].sort().reverse()
  const days = dates.map((date) => ({ date, tasks: doneRows.filter((row) => row.completed_date === date).map(view) }))

  const pending = [...backlog, ...thisWeek, ...todayTasks]
  return {
    list: { id: list.id, name: list.name, color: list.color },
    timezone,
    pending: { count: pending.length, estimate_minutes: sum(pending) },
    columns: {
      backlog: { tasks: backlog, estimate_minutes: sum(backlog) },
      this_week: {
        tasks: thisWeek,
        estimate_minutes: sum(thisWeek) + sum(todayTasks),
        done: counts!.done_week,
        total: counts!.done_week + thisWeek.length + todayTasks.length,
      },
      today: {
        tasks: todayTasks,
        estimate_minutes: sum(todayTasks),
        done: counts!.done_today,
        total: counts!.done_today + todayTasks.length,
      },
      done: { today_count: counts!.done_today, days },
    },
  }
}
