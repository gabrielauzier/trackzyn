import { randomUUID } from 'node:crypto'
import { and, eq, ne } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type Task, type TaskSeries, taskSeries, tasks } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { type RecurrenceRule, nextOccurrence } from './recurrence.ts'
import { setSchedule, workspaceClock } from './schedule.ts'
import { type TaskWithSubtasks, duplicateTask, findTask, getTask, lockList } from './tasks.ts'

const seriesError = (message: string, code: string) => new HttpError(422, message, {}, { code })

/** What a read needs of a stored series. */
export type SeriesFields = Pick<TaskSeries, 'id' | 'freq' | 'interval' | 'weekdays' | 'monthDay' | 'until' | 'count' | 'createdCount' | 'endedAt'>

/** The rule of a stored series. */
export function ruleOf(series: SeriesFields): RecurrenceRule {
  return {
    freq: series.freq,
    interval: series.interval,
    weekdays: series.weekdays,
    monthDay: series.monthDay,
    until: series.until,
    count: series.count,
  }
}

/**
 * What a task read answers about its series: the rule and the next day it projects after the occurrence's
 * day (`next_on`), or null once the series ended or has no occurrence left (US-7, US-11).
 */
export function seriesView(series: SeriesFields, scheduledOn: string | null) {
  const rule = ruleOf(series)
  const nextOn = series.endedAt === null && scheduledOn !== null ? nextOccurrence(rule, scheduledOn, scheduledOn, series.createdCount) : null
  return {
    id: series.id,
    rule: { freq: rule.freq, interval: rule.interval, weekdays: rule.weekdays, month_day: rule.monthDay, until: rule.until, count: rule.count },
    next_on: nextOn,
  }
}

/** The series `id`, locked until the end of the transaction: one change of its occurrences at a time. */
export async function lockSeries(tx: Database, id: string): Promise<TaskSeries | null> {
  const [found] = await tx.select().from(taskSeries).where(eq(taskSeries.id, id)).for('update')
  return found ?? null
}

/** Refuses a rule that misses the days its frequency needs, or whose end is before the occurrence's day (422). */
function checkRule(rule: RecurrenceRule, scheduledOn: string): void {
  if ((rule.freq === 'weekly') !== (rule.weekdays !== null && rule.weekdays.length > 0)) {
    throw seriesError('A weekly rule needs at least one weekday, and only a weekly rule takes weekdays', 'recurrence_weekdays')
  }
  if ((rule.freq === 'monthly') !== (rule.monthDay !== null)) {
    throw seriesError('A monthly rule needs a day of the month, and only a monthly rule takes one', 'recurrence_month_day')
  }
  if (rule.until !== null && rule.count !== null) throw seriesError('A rule ends by a day or by a count, not both', 'recurrence_end')
  if (rule.until !== null && rule.until < scheduledOn) throw seriesError('The rule ends before the scheduled day', 'recurrence_until_before_day')
}

/**
 * Makes the task repeat by `rule`, or stops it (US-9, D15). A task without a live series gets a new one,
 * becomes its open occurrence and counts 1 in `created_count`; a task of a live series changes the rule from
 * there on, keeping the count. Null ends the series (`ended_at`) and leaves the task as a plain one; the
 * completed occurrences keep pointing at it. The rule starts from the task's scheduled day, so a task without
 * one is refused with 422, as are a weekly rule without weekdays and an end before that day.
 */
export async function setRecurrence(
  db: Database,
  taskId: string,
  workspaceId: string,
  rule: RecurrenceRule | null,
  now: Date = new Date(),
): Promise<TaskWithSubtasks> {
  const task = await findTask(db, taskId, workspaceId)
  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    await lockList(tx, task.listId)
    const current = await findTask(tx, task.id, workspaceId)
    const series = current.seriesId === null ? null : await lockSeries(tx, current.seriesId)
    const live = series !== null && series.endedAt === null ? series : null

    if (rule === null) {
      if (live !== null) {
        await tx.update(taskSeries).set({ endedAt: now }).where(eq(taskSeries.id, live.id))
        await tx.update(tasks).set({ seriesId: null, updatedAt: now }).where(eq(tasks.id, current.id))
      }
      return getTask(tx, current.id, workspaceId)
    }

    if (current.scheduledOn === null) throw seriesError('A recurrence needs a scheduled day', 'recurrence_needs_day')
    checkRule(rule, current.scheduledOn)
    const columns = { freq: rule.freq, interval: rule.interval, weekdays: rule.weekdays, monthDay: rule.monthDay, until: rule.until, count: rule.count }
    if (live !== null) {
      await tx.update(taskSeries).set(columns).where(eq(taskSeries.id, live.id))
    } else {
      const id = randomUUID()
      await tx.insert(taskSeries).values({ id, workspaceId, ...columns, createdCount: 1, endedAt: null, createdAt: now })
      await tx.update(tasks).set({ seriesId: id, updatedAt: now }).where(eq(tasks.id, current.id))
    }
    return getTask(tx, current.id, workspaceId)
  })
}

/**
 * Creates the next occurrence of the series of `occurrence`, which is leaving the pending columns (completed,
 * or deleted on its own): a copy with the same title, notes, estimate, list and subtasks, none of them done
 * (D19), on the first day of the rule after its day and after today (D17), at the same time. The time spent
 * and the sessions stay on `occurrence`. The column follows the rules of saving a schedule (D3), and the
 * series counts one more occurrence. When the rule has no occurrence left (`count` or `until`), the series
 * ends instead. Nothing happens for an ended series or while another occurrence is pending (D13), so two
 * completions at once create one occurrence: the series is locked for the update. Runs in the caller's
 * transaction, which holds the lock of the list.
 */
export async function createNextOccurrence(
  tx: Database,
  occurrence: Task,
  workspaceId: string,
  byUserId: string,
  now: Date,
): Promise<TaskWithSubtasks | null> {
  if (occurrence.seriesId === null) return null
  const series = await lockSeries(tx, occurrence.seriesId)
  if (series === null || series.endedAt !== null) return null
  const [pending] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.seriesId, series.id), ne(tasks.column, 'done'), ne(tasks.id, occurrence.id)))
    .limit(1)
  if (pending) return null

  const { today } = await workspaceClock(tx, workspaceId, now)
  const next = nextOccurrence(ruleOf(series), occurrence.scheduledOn ?? today, today, series.createdCount)
  if (next === null) {
    await tx.update(taskSeries).set({ endedAt: now }).where(eq(taskSeries.id, series.id))
    return null
  }
  const copy = await duplicateTask(tx, occurrence.id, workspaceId, now)
  await tx.update(tasks).set({ seriesId: series.id }).where(eq(tasks.id, copy.id))
  await tx.update(taskSeries).set({ createdCount: series.createdCount + 1 }).where(eq(taskSeries.id, series.id))
  return setSchedule(tx, copy.id, workspaceId, { on: next, time: occurrence.scheduledTime }, byUserId, now)
}

/** Which occurrences a delete or a schedule change covers (D16): this one, or this one and the next ones. */
export type SeriesScope = 'occurrence' | 'series'

/**
 * Deletes the task (US-12). For an occurrence of a series, `occurrence` deletes only this one and creates
 * the next, as completing it would (`createNextOccurrence`); `series` deletes it and ends the series. The
 * completed occurrences stay, with their time, in both cases. Without a series the scope changes nothing.
 */
export async function deleteOccurrence(
  db: Database,
  taskId: string,
  workspaceId: string,
  scope: SeriesScope,
  byUserId: string,
  now: Date = new Date(),
): Promise<void> {
  const task = await findTask(db, taskId, workspaceId)
  await db.transaction(async (transaction) => {
    const tx = transaction as Database
    await lockList(tx, task.listId)
    const current = await findTask(tx, task.id, workspaceId)
    if (current.seriesId !== null) {
      if (scope === 'series') {
        const series = await lockSeries(tx, current.seriesId)
        if (series !== null && series.endedAt === null) await tx.update(taskSeries).set({ endedAt: now }).where(eq(taskSeries.id, series.id))
      } else if (current.column !== 'done') {
        await createNextOccurrence(tx, current, workspaceId, byUserId, now)
      }
    }
    await tx.delete(tasks).where(eq(tasks.id, current.id))
  })
}
