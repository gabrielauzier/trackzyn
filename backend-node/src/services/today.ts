import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type Workspace, users } from '../db/schema.ts'
import { settle, spentSeconds } from './focus-settle.ts'
import { type Workday, listPlanned, workdayOf } from './plans.ts'
import { type Verdict, clippedSessions, reportScope, verdictOf } from './reports.ts'
import { applyDueSchedules, workspaceClock } from './schedule.ts'

/** Who reads the day: the logged-in user in the current workspace (HOJE-06). */
export interface TodayActor {
  userId: string
  workspace: Pick<Workspace, 'id' | 'timezone'>
}

type ListRef = { id: string; name: string; color: number }

interface TaskRef {
  id: string
  title: string
  list: ListRef
  estimate_minutes: number | null
}

/** A task of `Pendente` (HOJE-23), with the raw data the client groups and sizes by the minute (HOJE-25). */
export interface PendingTask extends TaskRef {
  position: number
  scheduled_on: string | null
  /** The minute of `scheduled_time` when `scheduled_on` is today; null otherwise. */
  scheduled_minute: number | null
  /** The start of the task's first block in today's plan. */
  plan_minute: number | null
  /** The reader has a task session on it today. */
  has_session_today: boolean
  /** Today minus `scheduled_on` in calendar days, when the day is before today (HOJE-28). */
  days_late: number | null
  subtasks: { done: number; total: number }
}

/** A task of `Feito hoje` (HOJE-35), with the badge of the reports (HOJE-37). */
export interface DoneTask extends TaskRef {
  completed_at: string
  /** All the time of the task, of every member, as `verdictOf` reads it in the reports. */
  spent_seconds: number
  /** Null without an estimate (HOJE-38). */
  verdict: Verdict | null
  diff_seconds: number
  /** The task is an occurrence of a series. */
  series: boolean
}

export interface TodayPlanBlock {
  id: string
  kind: 'task' | 'break'
  task_id: string | null
  title: string
  list_color: number | null
  start_minute: number
  minutes: number
  /** A task block of a done task, or a break already started (PLAN-49). */
  done: boolean
}

/** A session of the reader cut to today (HOJE-68); minutes of the day in the workspace timezone, 1440 at midnight. */
export interface DaySession {
  id: string
  kind: 'task' | 'break'
  task_id: string | null
  // SPEC_DEVIATION: the design types `title` as a string; a break session has no name of its own.
  // Reason: a break takes the name of the planned break it started, and is null without one (the client shows `Intervalo`).
  title: string | null
  list_id: string
  list_color: number
  start_minute: number
  end_minute: number
  open: boolean
}

/** GET /api/today: the reader's day in the workspace, as raw data the client counts minute by minute. */
export interface TodayRead {
  server_now: string
  /** Today in the workspace timezone (AD-004), `YYYY-MM-DD`. */
  day: string
  tomorrow: string
  timezone: string
  /** 0..1439 at `server_now`. */
  now_minute: number
  workday: Workday
  pending: PendingTask[]
  /** Completed today by the reader, the most recent first. */
  done: DoneTask[]
  plan: { saved: boolean; blocks: TodayPlanBlock[] }
  sessions: DaySession[]
}

async function rows<T>(db: Database, query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows
}

const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

interface PendingRow {
  id: string
  title: string
  estimate_minutes: number | null
  position: number
  scheduled_on: string | null
  scheduled_time: string | null
  list_id: string
  list_name: string
  list_color: number
  has_session_today: boolean
  days_late: number | null
  subtasks_done: number
  subtasks_total: number
}

interface DoneRow {
  id: string
  title: string
  estimate_minutes: number | null
  completed_at: string | Date
  list_id: string
  list_name: string
  list_color: number
  series: boolean
}

interface SessionRow {
  id: string
  kind: 'task' | 'break'
  task_id: string | null
  title: string | null
  list_id: string
  list_color: number
  start_minute: number
  end_minute: number
  open: boolean
}

/**
 * The reader's day in the workspace (HOJE-06): settles the due sessions first (AD-001), applies the due
 * schedules before reading the columns (AD-009), then reads the day from the workspace clock (AD-004).
 */
export async function readToday(db: Database, actor: TodayActor, now: Date): Promise<TodayRead> {
  const workspaceId = actor.workspace.id
  await settle(db, actor.userId, now)
  await applyDueSchedules(db, workspaceId, now)
  const clock = await workspaceClock(db, workspaceId, now)
  const tz = clock.timezone
  const day = clock.today
  const [{ tomorrow }] = (await rows<{ tomorrow: string }>(db, sql`SELECT (${day}::date + 1)::text AS tomorrow`)) as [{ tomorrow: string }]
  const scope = await reportScope(db, actor.userId, { id: workspaceId, timezone: tz }, { from: day, to: day, listId: null }, now)

  const [user] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, actor.userId))
  const [plan] = await rows<{ id: string }>(
    db,
    sql`SELECT id FROM day_plans WHERE user_id = ${actor.userId} AND workspace_id = ${workspaceId} AND day = ${day}::date`,
  )
  const blocks: TodayPlanBlock[] = (await listPlanned(db, { userId: actor.userId, workspaceId }, day, day)).map((block) =>
    block.kind === 'task'
      ? {
          id: block.id,
          kind: 'task',
          task_id: block.task.id,
          title: block.task.title,
          list_color: block.task.list.color,
          start_minute: minuteOf(block.start),
          minutes: block.minutes,
          done: block.task.done,
        }
      : {
          id: block.id,
          kind: 'break',
          task_id: null,
          title: block.name,
          list_color: block.list.color,
          start_minute: minuteOf(block.start),
          minutes: block.minutes,
          done: block.started_at !== null,
        },
  )

  const pendingRows = await rows<PendingRow>(
    db,
    sql`SELECT t.id, t.title, t.estimate_minutes, t.position, t.scheduled_on::text AS scheduled_on,
               to_char(t.scheduled_time, 'HH24:MI') AS scheduled_time,
               l.id AS list_id, l.name AS list_name, l.color AS list_color,
               EXISTS (SELECT 1 FROM focus_sessions fs
                       WHERE fs.task_id = t.id AND fs.user_id = ${actor.userId} AND fs.kind = 'task'
                         AND fs.started_at < ${scope.hi} AND coalesce(fs.ended_at, ${scope.now}) > ${scope.lo}) AS has_session_today,
               CASE WHEN t.scheduled_on < ${day}::date THEN (${day}::date - t.scheduled_on) END AS days_late,
               (SELECT count(*) FILTER (WHERE s.done) FROM subtasks s WHERE s.task_id = t.id)::int AS subtasks_done,
               (SELECT count(*) FROM subtasks s WHERE s.task_id = t.id)::int AS subtasks_total
        FROM tasks t JOIN lists l ON l.id = t.list_id
        WHERE l.workspace_id = ${workspaceId} AND NOT l.is_archived AND t."column" = 'today'
          AND NOT EXISTS (SELECT 1 FROM focus_sessions open
                          WHERE open.user_id = ${actor.userId} AND open.ended_at IS NULL AND open.kind = 'task' AND open.task_id = t.id)
        ORDER BY l.position, t.position, t.id`,
  )
  const pending: PendingTask[] = pendingRows.map((row) => {
    const first = blocks.find((block) => block.kind === 'task' && block.task_id === row.id)
    return {
      id: row.id,
      title: row.title,
      list: { id: row.list_id, name: row.list_name, color: row.list_color },
      estimate_minutes: row.estimate_minutes,
      position: row.position,
      scheduled_on: row.scheduled_on,
      scheduled_minute: row.scheduled_on === day && row.scheduled_time !== null ? minuteOf(row.scheduled_time) : null,
      plan_minute: first?.start_minute ?? null,
      has_session_today: row.has_session_today,
      days_late: row.days_late,
      subtasks: { done: row.subtasks_done, total: row.subtasks_total },
    }
  })

  // Only the reader's completions of today (HOJE-40, AD-006).
  const doneRows = await rows<DoneRow>(
    db,
    sql`SELECT t.id, t.title, t.estimate_minutes, t.completed_at, t.series_id IS NOT NULL AS series,
               l.id AS list_id, l.name AS list_name, l.color AS list_color
        FROM tasks t JOIN lists l ON l.id = t.list_id
        WHERE l.workspace_id = ${workspaceId} AND t.completed_by_user_id = ${actor.userId}
          AND t.completed_at >= ${scope.lo} AND t.completed_at < ${scope.hi}
        ORDER BY t.completed_at DESC, t.id`,
  )
  const spent = await spentSeconds(
    db,
    doneRows.map((row) => row.id),
    now,
  )
  const done: DoneTask[] = doneRows.map((row) => {
    const spentSecondsOfTask = spent.get(row.id) ?? 0
    const { verdict, diff } = verdictOf(spentSecondsOfTask, row.estimate_minutes)
    return {
      id: row.id,
      title: row.title,
      list: { id: row.list_id, name: row.list_name, color: row.list_color },
      estimate_minutes: row.estimate_minutes,
      completed_at: new Date(row.completed_at).toISOString(),
      spent_seconds: spentSecondsOfTask,
      verdict,
      diff_seconds: diff,
      series: row.series,
    }
  })

  // The same cut as the reports (HOJE-68): the minutes are wall-clock minutes of the day, midnight after it is 1440.
  const sessions = await rows<SessionRow>(
    db,
    sql`WITH s AS (${clippedSessions(scope, actor.userId, workspaceId)})
        SELECT s.id, s.kind, s.task_id, coalesce(t.title, b.name) AS title, s.list_id, l.color AS list_color,
               (extract(hour FROM s.a AT TIME ZONE ${tz}) * 60 + extract(minute FROM s.a AT TIME ZONE ${tz}))::int AS start_minute,
               CASE WHEN s.z >= ${scope.hi} THEN 1440
                    ELSE (extract(hour FROM s.z AT TIME ZONE ${tz}) * 60 + extract(minute FROM s.z AT TIME ZONE ${tz}))::int END AS end_minute,
               s.ended_at IS NULL AS open
        FROM s JOIN lists l ON l.id = s.list_id
        LEFT JOIN tasks t ON t.id = s.task_id
        LEFT JOIN LATERAL (
          SELECT pb.name FROM day_plan_blocks pb JOIN day_plans p ON p.id = pb.plan_id
          WHERE s.kind = 'break' AND pb.kind = 'break' AND pb.started_at = s.started_at
            AND p.user_id = ${actor.userId} AND p.workspace_id = ${workspaceId}
          LIMIT 1
        ) b ON true
        WHERE s.z > s.a
        ORDER BY s.a, s.id`,
  )

  return {
    server_now: now.toISOString(),
    day,
    tomorrow,
    timezone: tz,
    now_minute: minuteOf(clock.time),
    workday: workdayOf(user?.preferences ?? null),
    pending,
    done,
    plan: { saved: plan !== undefined, blocks },
    sessions,
  }
}
