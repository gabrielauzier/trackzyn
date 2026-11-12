import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type TaskColumn, type Workspace, lists, tasks, users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { settle, spentSeconds } from './focus-settle.ts'
import { openSession } from './focus-state.ts'
import { endSession } from './focus.ts'
import { type Workday, listPlanned, workdayOf } from './plans.ts'
import { type Verdict, clippedSessions, reportScope, verdictOf } from './reports.ts'
import { applyDueSchedules, setSchedule, workspaceClock } from './schedule.ts'
import { moveTask } from './tasks.ts'

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
  /** The task is an occurrence of a series: `Fechar o dia` only sends it to tomorrow (HOJE-75). */
  series: boolean
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
  /** The instants cut to today, the open session until `server_now`, so the client sums seconds (HOJE-49). */
  started_at: string
  ended_at: string
  open: boolean
}

/** A task already set for tomorrow (HOJE-54). */
export interface TomorrowTask extends TaskRef {
  /** The minute of `scheduled_time`; null for a task without a time. */
  scheduled_minute: number | null
  series: boolean
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
  /** The number of blocks of the reader's plan of tomorrow; 0 without a plan (HOJE-56). */
  tomorrow_plan_blocks: number
  /** Not done, `scheduled_on` tomorrow, the ones with a time first in order of time (HOJE-54). */
  tomorrow_tasks: TomorrowTask[]
  /** `This week` tasks without a day (HOJE-55). */
  week_unscheduled: number
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
  series: boolean
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

interface TomorrowRow {
  id: string
  title: string
  estimate_minutes: number | null
  scheduled_time: string | null
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
  started_at: string | Date
  ended_at: string | Date
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
               t.series_id IS NOT NULL AS series,
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
      series: row.series,
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
               s.a AS started_at, s.z AS ended_at, s.ended_at IS NULL AS open
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

  // What is already set for tomorrow (HOJE-54 to HOJE-56): the existing tasks only, no series projection.
  const tomorrowRows = await rows<TomorrowRow>(
    db,
    sql`SELECT t.id, t.title, t.estimate_minutes, to_char(t.scheduled_time, 'HH24:MI') AS scheduled_time,
               t.series_id IS NOT NULL AS series, l.id AS list_id, l.name AS list_name, l.color AS list_color
        FROM tasks t JOIN lists l ON l.id = t.list_id
        WHERE l.workspace_id = ${workspaceId} AND NOT l.is_archived AND t."column" <> 'done'
          AND t.scheduled_on = ${tomorrow}::date
        ORDER BY t.scheduled_time NULLS LAST, l.position, t.position, t.id`,
  )
  const tomorrowTasks: TomorrowTask[] = tomorrowRows.map((row) => ({
    id: row.id,
    title: row.title,
    list: { id: row.list_id, name: row.list_name, color: row.list_color },
    estimate_minutes: row.estimate_minutes,
    scheduled_minute: row.scheduled_time === null ? null : minuteOf(row.scheduled_time),
    series: row.series,
  }))
  const [{ count: weekUnscheduled }] = (await rows<{ count: number }>(
    db,
    sql`SELECT count(*)::int AS count FROM tasks t JOIN lists l ON l.id = t.list_id
        WHERE l.workspace_id = ${workspaceId} AND NOT l.is_archived
          AND t."column" = 'this_week' AND t.scheduled_on IS NULL`,
  )) as [{ count: number }]
  const tomorrowBlocks = await listPlanned(db, { userId: actor.userId, workspaceId }, tomorrow, tomorrow)

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
    sessions: sessions.map((row) => ({
      ...row,
      started_at: new Date(row.started_at).toISOString(),
      ended_at: new Date(row.ended_at).toISOString(),
    })),
    tomorrow_plan_blocks: tomorrowBlocks.length,
    tomorrow_tasks: tomorrowTasks,
    week_unscheduled: weekUnscheduled,
  }
}

/** Where `Fechar o dia` sends a pending task (HOJE-59). */
export interface CloseMove {
  task_id: string
  to: 'tomorrow' | 'this_week' | 'backlog'
}

const notPending = () =>
  new HttpError(422, 'Only pending tasks of the workspace can be moved', {}, { code: 'close_task_not_pending' })
const seriesNeedsTomorrow = () =>
  new HttpError(422, 'An occurrence of a series can only go to tomorrow', {}, { code: 'close_series_needs_tomorrow' })

/**
 * `Fechar o dia` in one write (HOJE-61): settles (AD-001), pauses the reader's open task session (HOJE-62), checks that
 * every task is a pending task of the workspace (HOJE-65), then moves each one. `tomorrow` is `This week` scheduled for
 * tomorrow without a time, so the schedule brings it back to Today tomorrow (D21); `this_week` and `backlog` lose
 * their day, which an occurrence of a series refuses (HOJE-75). `moveTask` and `setSchedule` get the transaction, so their own transactions become savepoints of it and
 * a refusal leaves every task where it was. Answers the day read after the close.
 */
export async function closeDay(db: Database, actor: TodayActor, moves: CloseMove[], now: Date): Promise<TodayRead> {
  const workspaceId = actor.workspace.id
  await db.transaction(async (transaction) => {
    const tx = transaction as Database
    await settle(tx, actor.userId, now)
    const open = await openSession(tx, actor.userId)
    if (open && open.kind === 'task') await endSession(tx, open, now, 'pause')

    const ids = moves.map((move) => move.task_id)
    const found =
      ids.length === 0
        ? []
        : await tx
            .select({ id: tasks.id, column: tasks.column, seriesId: tasks.seriesId })
            .from(tasks)
            .innerJoin(lists, eq(lists.id, tasks.listId))
            .where(and(eq(lists.workspaceId, workspaceId), inArray(tasks.id, ids), ne(tasks.column, 'done')))
    const columns = new Map(found.map((row) => [row.id, row.column]))
    if (ids.some((id) => !columns.has(id))) throw notPending()
    // Clearing the day of an occurrence would end its series (D29), so it only goes to tomorrow (HOJE-75).
    const occurrences = new Set(found.filter((row) => row.seriesId !== null).map((row) => row.id))
    if (moves.some((move) => move.to !== 'tomorrow' && occurrences.has(move.task_id))) throw seriesNeedsTomorrow()

    const { today } = await workspaceClock(tx, workspaceId, now)
    const [{ tomorrow }] = (await rows<{ tomorrow: string }>(tx, sql`SELECT (${today}::date + 1)::text AS tomorrow`)) as [
      { tomorrow: string },
    ]
    for (const move of moves) {
      const column: TaskColumn = move.to === 'backlog' ? 'backlog' : 'this_week'
      // A task already in its column stays in its place, so the same close twice changes nothing.
      if (columns.get(move.task_id) !== column) {
        await moveTask(tx, move.task_id, workspaceId, { column, beforeTaskId: null, byUserId: actor.userId }, now)
      }
      await setSchedule(tx, move.task_id, workspaceId, { on: move.to === 'tomorrow' ? tomorrow : null, time: null }, actor.userId, now)
    }
  })
  return readToday(db, actor, now)
}
