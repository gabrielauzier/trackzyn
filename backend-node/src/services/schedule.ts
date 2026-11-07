import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type TaskColumn, tasks, workspaces } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { daySql, dayTimezone } from './day.ts'
import { type TaskWithSubtasks, findTask, getTask, lockList, moveTask } from './tasks.ts'

/** A day (`YYYY-MM-DD`) and an optional start time (`HH:MM`), in the workspace's timezone; null clears it. */
export interface Schedule {
  on: string | null
  time: string | null
}

/** Today, the Monday and the Sunday of this week, and the wall-clock time of `now` (`HH:MM:SS`), in `timezone`. */
interface WorkspaceClock {
  timezone: string
  today: string
  weekStart: string
  weekEnd: string
  time: string
}

async function rows<T>(db: Database, query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows
}

/** The workspace's calendar at `now`, computed in SQL in its day timezone (AD-004). */
export async function workspaceClock(db: Database, workspaceId: string, now: Date): Promise<WorkspaceClock> {
  const [workspace] = await db.select({ timezone: workspaces.timezone }).from(workspaces).where(eq(workspaces.id, workspaceId))
  const timezone = await dayTimezone(db, { timezone: workspace?.timezone ?? null })
  const day = daySql(timezone, now)
  const weekStart = sql`(${day.weekStart} AT TIME ZONE ${timezone})::date`
  const [clock] = await rows<{ today: string; week_start: string; week_end: string; time: string }>(
    db,
    sql`SELECT (${day.today})::text AS today, (${weekStart})::text AS week_start, (${weekStart} + 6)::text AS week_end,
               to_char(${now.toISOString()}::timestamptz AT TIME ZONE ${timezone}, 'HH24:MI:SS') AS time`,
  )
  return { timezone, today: clock!.today, weekStart: clock!.week_start, weekEnd: clock!.week_end, time: clock!.time }
}

const scheduleError = (message: string, code: string) => new HttpError(422, message, {}, { code })

/**
 * Schedules the task for `schedule.on` at `schedule.time`, or clears it, and applies the rules of saving
 * (D3, D21): a new day or time clears `schedule_applied_at`; today takes the task to the end of Today and
 * marks it applied; a day of this week (Monday to Sunday) takes a Backlog task to the end of This week; This
 * week and Today keep a task given a later day. A day before today, or a time of today that has passed,
 * is refused with 422. An unchanged day and time change nothing, so clearing only the time of a task that
 * came to Today from an earlier day keeps that day.
 */
export async function setSchedule(
  db: Database,
  taskId: string,
  workspaceId: string,
  schedule: Schedule,
  byUserId: string,
  now: Date = new Date(),
): Promise<TaskWithSubtasks> {
  const task = await findTask(db, taskId, workspaceId)
  const on = schedule.on
  const time = schedule.time?.slice(0, 5) ?? null
  if (time !== null && on === null) throw scheduleError('A scheduled time needs a scheduled day', 'schedule_time_needs_day')

  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    await lockList(tx, task.listId)
    // Read again under the lock: a concurrent move may have changed the column.
    const current = await findTask(tx, task.id, workspaceId)
    const dayChanged = on !== current.scheduledOn
    const timeChanged = time !== (current.scheduledTime?.slice(0, 5) ?? null)
    if (!dayChanged && !timeChanged) return getTask(tx, current.id, workspaceId)

    let target: TaskColumn | null = null
    let appliedAt: Date | null = null
    if (on !== null) {
      const clock = await workspaceClock(tx, workspaceId, now)
      if (dayChanged && on < clock.today) throw scheduleError('The scheduled day is before today', 'schedule_in_past')
      if (on === clock.today && time !== null && `${time}:00` < clock.time) {
        throw scheduleError('The scheduled time of today has passed', 'schedule_in_past')
      }
      if (current.column !== 'done') {
        if (on === clock.today) {
          appliedAt = now
          if (current.column !== 'today') target = 'today'
        } else if (current.column === 'backlog' && on >= clock.weekStart && on <= clock.weekEnd) {
          target = 'this_week'
        }
      }
    }

    await tx
      .update(tasks)
      .set({ scheduledOn: on, scheduledTime: time, scheduleAppliedAt: appliedAt, updatedAt: now })
      .where(eq(tasks.id, current.id))
    if (target !== null) await moveTask(tx, current.id, workspaceId, { column: target, beforeTaskId: null, byUserId }, now)
    return getTask(tx, current.id, workspaceId)
  })
}
