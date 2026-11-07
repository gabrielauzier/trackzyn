import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, taskSeries, tasks, users, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { createList, updateList } from '../../src/services/lists.ts'
import { applyDueSchedules, setSchedule } from '../../src/services/schedule.ts'
import { moveTask } from '../../src/services/tasks.ts'
import { migratedDb } from '../support/db.ts'

// Wednesday 2026-11-11, 14:07 in America/Sao_Paulo (UTC-3). The week runs from Monday 2026-11-09 to Sunday 2026-11-15.
const NOW = new Date('2026-11-11T17:07:00Z')
const TZ = 'America/Sao_Paulo'
const EARLIER = new Date('2026-11-10T03:00:00Z')

let db: Database
let client: PGlite
let workspaceId: string
let listId: string
let userId: string

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  userId = randomUUID()
  await db.insert(users).values({ id: userId, email: 'a@b.c', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
  workspaceId = randomUUID()
  await db.insert(workspaces).values({ id: workspaceId, name: 'Mine', timezone: TZ, createdAt: NOW })
  listId = (await createList(db, { workspaceId, userId, name: 'Work', color: 1 })).id
})
afterEach(async () => {
  await client.close()
})

const positions = new Map<TaskColumn, number>()
async function task(
  column: TaskColumn,
  options: { title?: string; on?: string; time?: string; appliedAt?: Date } = {},
): Promise<string> {
  const id = randomUUID()
  const position = positions.get(column) ?? 0
  positions.set(column, position + 1)
  await db.insert(tasks).values({
    id,
    listId,
    title: options.title ?? `${column} ${position}`,
    column,
    position,
    completedAt: column === 'done' ? EARLIER : null,
    createdAt: EARLIER,
    scheduledOn: options.on ?? null,
    scheduledTime: options.time ?? null,
    scheduleAppliedAt: options.appliedAt ?? null,
  })
  return id
}
beforeEach(() => positions.clear())

const schedule = (id: string, on: string | null, time: string | null = null, now = NOW) =>
  setSchedule(db, id, workspaceId, { on, time }, userId, now)

const row = async (id: string) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0]!

async function column(name: TaskColumn) {
  return (
    await db
      .select({ id: tasks.id, position: tasks.position })
      .from(tasks)
      .where(and(eq(tasks.listId, listId), eq(tasks.column, name)))
      .orderBy(asc(tasks.position))
  ).map((found) => found.id)
}

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(HttpError)
  return error as HttpError
}

describe('setSchedule: the rules of saving a schedule (US-1, US-2, D3, D21)', () => {
  it('saves the day and the time, in steps of 15 minutes, and reads them back', async () => {
    const id = await task('this_week')
    const saved = await schedule(id, '2026-11-13', '14:00')
    expect(saved).toMatchObject({ scheduledOn: '2026-11-13', scheduledTime: '14:00:00', column: 'this_week' })
  })

  it('clears schedule_applied_at when the day changes', async () => {
    const id = await task('this_week', { on: '2026-11-13', appliedAt: EARLIER })
    await schedule(id, '2026-11-14')
    expect(await row(id)).toMatchObject({ scheduledOn: '2026-11-14', scheduleAppliedAt: null })
  })

  it('D26 keeps schedule_applied_at when only the time changes', async () => {
    const id = await task('this_week', { on: '2026-11-13', time: '09:00', appliedAt: EARLIER })
    await schedule(id, '2026-11-13', '10:30')
    expect(await row(id)).toMatchObject({ scheduledOn: '2026-11-13', scheduledTime: '10:30:00', scheduleAppliedAt: EARLIER })
  })

  it('D26 a task taken out of Today by hand, with an earlier day, does not come back when its time changes; a new day brings it', async () => {
    const id = await task('backlog', { on: '2026-11-10', time: '09:00', appliedAt: EARLIER })
    expect(await schedule(id, '2026-11-10', '10:30')).toMatchObject({ column: 'backlog', scheduledTime: '10:30:00', scheduleAppliedAt: EARLIER })
    expect(await applyDueSchedules(db, workspaceId, NOW)).toBe(0)
    expect(await row(id)).toMatchObject({ column: 'backlog', scheduleAppliedAt: EARLIER })

    expect(await schedule(id, '2026-11-11', '15:00')).toMatchObject({ column: 'today', scheduledOn: '2026-11-11', scheduleAppliedAt: NOW })
  })

  it('D26 a task taken out of Today by hand, with the day of today, stays out when only its time changes', async () => {
    const id = await task('backlog', { on: '2026-11-11', time: '15:00', appliedAt: EARLIER })
    expect(await schedule(id, '2026-11-11', '16:00')).toMatchObject({ column: 'backlog', scheduledTime: '16:00:00', scheduleAppliedAt: EARLIER })
  })

  it('D3 takes a Backlog task with a day of this week to the end of This week, keeping the day and the time', async () => {
    const first = await task('this_week')
    const id = await task('backlog')
    const stays = await task('backlog')
    const moved = await schedule(id, '2026-11-13', '14:00')
    expect(moved).toMatchObject({ column: 'this_week', position: 1, scheduledOn: '2026-11-13', scheduledTime: '14:00:00', scheduleAppliedAt: null })
    expect(await column('this_week')).toEqual([first, id])
    expect(await column('backlog')).toEqual([stays])
  })

  it('D3 counts Sunday as this week and the next Monday as the next week (weeks run Monday to Sunday)', async () => {
    const sunday = await task('backlog')
    const monday = await task('backlog')
    expect((await schedule(sunday, '2026-11-15')).column).toBe('this_week')
    expect((await schedule(monday, '2026-11-16')).column).toBe('backlog')
  })

  it('D21 takes a task scheduled for today to the end of Today, keeping the day and the time, and marks it applied', async () => {
    const first = await task('today')
    const fromBacklog = await task('backlog')
    const fromWeek = await task('this_week')
    expect(await schedule(fromBacklog, '2026-11-11', '16:00')).toMatchObject({
      column: 'today',
      position: 1,
      scheduledOn: '2026-11-11',
      scheduledTime: '16:00:00',
      scheduleAppliedAt: NOW,
    })
    expect(await schedule(fromWeek, '2026-11-11')).toMatchObject({ column: 'today', position: 2, scheduledOn: '2026-11-11', scheduledTime: null, scheduleAppliedAt: NOW })
    expect(await column('today')).toEqual([first, fromBacklog, fromWeek])
  })

  it('D3 keeps a task of This week or Today given a later day where it is', async () => {
    const week = [await task('this_week'), await task('this_week')]
    const today = [await task('today'), await task('today')]
    expect(await schedule(week[0]!, '2026-11-20', '10:00')).toMatchObject({ column: 'this_week', position: 0, scheduledOn: '2026-11-20' })
    expect(await schedule(today[0]!, '2026-11-13')).toMatchObject({ column: 'today', position: 0, scheduledOn: '2026-11-13', scheduleAppliedAt: null })
    expect(await column('this_week')).toEqual(week)
    expect(await column('today')).toEqual(today)
  })

  it('decides today in the workspace timezone, not in UTC', async () => {
    // 2026-11-12T02:30Z is still Wednesday 2026-11-11, 23:30 in Sao Paulo.
    const late = new Date('2026-11-12T02:30:00Z')
    const tomorrow = await task('backlog')
    const today = await task('backlog')
    expect(await schedule(tomorrow, '2026-11-12', null, late)).toMatchObject({ column: 'this_week', scheduleAppliedAt: null })
    expect(await schedule(today, '2026-11-11', '23:45', late)).toMatchObject({ column: 'today', scheduleAppliedAt: late })
  })

  it('decides the week in the workspace timezone: Sunday night local is not next Monday', async () => {
    // 2026-11-16T01:00Z is Monday in UTC but Sunday 2026-11-15, 22:00 in Sao Paulo.
    const sundayNight = new Date('2026-11-16T01:00:00Z')
    const id = await task('backlog')
    expect(await schedule(id, '2026-11-16', null, sundayNight)).toMatchObject({ column: 'backlog', scheduledOn: '2026-11-16', scheduleAppliedAt: null })
  })

  it('refuses a day before today with 422 schedule_in_past and keeps the task as it was', async () => {
    const id = await task('backlog', { on: '2026-11-20' })
    const error = await refusal(schedule(id, '2026-11-10'))
    expect(error).toMatchObject({ statusCode: 422, extra: { code: 'schedule_in_past' } })
    expect(await row(id)).toMatchObject({ scheduledOn: '2026-11-20', column: 'backlog' })
  })

  it('refuses a time of today that has passed, in the workspace timezone, and takes one still ahead', async () => {
    const id = await task('backlog')
    const error = await refusal(schedule(id, '2026-11-11', '14:00'))
    expect(error).toMatchObject({ statusCode: 422, extra: { code: 'schedule_in_past' } })
    expect(await row(id)).toMatchObject({ scheduledOn: null, scheduledTime: null, column: 'backlog' })
    expect(await schedule(id, '2026-11-11', '14:15')).toMatchObject({ scheduledTime: '14:15:00', column: 'today' })
  })

  it('refuses a time without a day with 422', async () => {
    const id = await task('backlog')
    const error = await refusal(schedule(id, null, '10:00'))
    expect(error).toMatchObject({ statusCode: 422, extra: { code: 'schedule_time_needs_day' } })
  })

  it('US-2 clearing the time keeps the day, even the earlier day of a task that came to Today', async () => {
    const id = await task('today', { on: '2026-11-10', time: '09:00', appliedAt: EARLIER })
    expect(await schedule(id, '2026-11-10', null)).toMatchObject({ scheduledOn: '2026-11-10', scheduledTime: null, column: 'today' })
  })

  it('US-2 clearing the schedule sets the day and the time to null and keeps the column', async () => {
    const id = await task('this_week', { on: '2026-11-13', time: '09:00' })
    expect(await schedule(id, null, null)).toMatchObject({ scheduledOn: null, scheduledTime: null, scheduleAppliedAt: null, column: 'this_week' })
  })
})

describe('setSchedule on an occurrence of a series (US-12, D29)', () => {
  async function occurrence(column: TaskColumn) {
    const seriesId = randomUUID()
    await db.insert(taskSeries).values({ id: seriesId, workspaceId, freq: 'daily', time: '09:00', createdCount: 2, createdAt: EARLIER })
    const done = await task('done', { on: '2026-11-10', time: '09:00' })
    const open = await task(column, { on: '2026-11-11', time: '09:00', appliedAt: EARLIER })
    await db.update(tasks).set({ seriesId }).where(inArray(tasks.id, [done, open]))
    return { seriesId, done, open }
  }
  const seriesRow = async (id: string) => (await db.select().from(taskSeries).where(eq(taskSeries.id, id)))[0]!

  it('clearing the day ends the series and leaves the task plain, without day or time, in its column', async () => {
    const { seriesId, done, open } = await occurrence('today')
    expect(await schedule(open, null)).toMatchObject({ seriesId: null, series: null, scheduledOn: null, scheduledTime: null, column: 'today' })
    expect((await seriesRow(seriesId)).endedAt).toEqual(NOW)
    // The completed occurrence keeps pointing at the ended series.
    expect(await row(done)).toMatchObject({ seriesId })
  })

  it('clearing the day of a completed occurrence leaves the series running', async () => {
    const { seriesId, done } = await occurrence('this_week')
    expect(await schedule(done, null)).toMatchObject({ scheduledOn: null, seriesId })
    expect((await seriesRow(seriesId)).endedAt).toBeNull()
  })
})

describe('applyDueSchedules: the task comes to Today on its day (US-4, D1, D21)', () => {
  const apply = (now = NOW) => applyDueSchedules(db, workspaceId, now)

  it('moves the due tasks of Backlog and This week to the end of Today in order of day, time and position, keeping day and time', async () => {
    const already = await task('today')
    const lateTime = await task('backlog', { title: 'today 09:00', on: '2026-11-11', time: '09:00' })
    const earlyTime = await task('this_week', { title: 'today 08:00', on: '2026-11-11', time: '08:00' })
    const yesterday = await task('backlog', { title: 'yesterday', on: '2026-11-10' })
    const sameTimeAfter = await task('backlog', { title: 'today 09:00, later position', on: '2026-11-11', time: '09:00' })
    const future = await task('backlog', { title: 'tomorrow', on: '2026-11-12' })

    expect(await apply()).toBe(4)

    expect(await column('today')).toEqual([already, yesterday, earlyTime, lateTime, sameTimeAfter])
    expect(await column('backlog')).toEqual([future])
    expect((await row(future)).position).toBe(0)
    expect(await row(lateTime)).toMatchObject({ column: 'today', scheduledOn: '2026-11-11', scheduledTime: '09:00:00', scheduleAppliedAt: NOW, updatedAt: NOW })
    expect(await row(yesterday)).toMatchObject({ column: 'today', scheduledOn: '2026-11-10', scheduledTime: null, scheduleAppliedAt: NOW })
    expect(await row(future)).toMatchObject({ column: 'backlog', scheduleAppliedAt: null })
  })

  it('does not bring back a task taken out of Today by hand', async () => {
    const id = await task('backlog')
    await schedule(id, '2026-11-11')
    await moveTask(db, id, workspaceId, { column: 'backlog', beforeTaskId: null, byUserId: userId }, NOW)
    expect(await apply(new Date(NOW.getTime() + 60_000))).toBe(0)
    expect(await row(id)).toMatchObject({ column: 'backlog', scheduledOn: '2026-11-11', scheduleAppliedAt: NOW })
  })

  it('leaves the tasks of Today and Done where they are', async () => {
    const inToday = [await task('today'), await task('today', { on: '2026-11-10' })]
    const done = await task('done', { on: '2026-11-11', time: '10:00' })
    expect(await apply()).toBe(0)
    expect(await column('today')).toEqual(inToday)
    expect(await row(inToday[1]!)).toMatchObject({ column: 'today', position: 1, scheduleAppliedAt: null })
    expect(await row(done)).toMatchObject({ column: 'done', scheduleAppliedAt: null })
  })

  it('moves the task at the start of its day, whatever its scheduled time', async () => {
    // 2026-11-12T03:05Z is Thursday 2026-11-12, 00:05 in Sao Paulo.
    const startOfDay = new Date('2026-11-12T03:05:00Z')
    const id = await task('this_week', { on: '2026-11-12', time: '23:00' })
    expect(await apply(startOfDay)).toBe(1)
    expect(await row(id)).toMatchObject({ column: 'today', scheduledTime: '23:00:00', scheduleAppliedAt: startOfDay })
  })

  it('decides today in the workspace timezone, not in UTC', async () => {
    // 2026-11-12T02:30Z is Thursday in UTC but still Wednesday 2026-11-11, 23:30 in Sao Paulo.
    const id = await task('this_week', { on: '2026-11-12' })
    expect(await apply(new Date('2026-11-12T02:30:00Z'))).toBe(0)
    expect(await row(id)).toMatchObject({ column: 'this_week', scheduleAppliedAt: null })
  })

  it('moves the tasks of the workspace only', async () => {
    const otherWorkspace = randomUUID()
    await db.insert(workspaces).values({ id: otherWorkspace, name: 'Theirs', timezone: TZ, createdAt: NOW })
    const otherList = (await createList(db, { workspaceId: otherWorkspace, userId, name: 'Theirs', color: 2 })).id
    const theirs = randomUUID()
    await db.insert(tasks).values({ id: theirs, listId: otherList, title: 'theirs', column: 'backlog', position: 0, createdAt: EARLIER, scheduledOn: '2026-11-11' })
    expect(await apply()).toBe(0)
    expect(await row(theirs)).toMatchObject({ column: 'backlog', scheduleAppliedAt: null })
  })

  it('D25 leaves the due tasks of an archived list where they are; after it is restored, the next read moves them', async () => {
    const id = await task('backlog', { on: '2026-11-10' })
    await updateList(db, listId, workspaceId, { isArchived: true }, NOW)
    expect(await apply()).toBe(0)
    expect(await row(id)).toMatchObject({ column: 'backlog', scheduleAppliedAt: null })

    await updateList(db, listId, workspaceId, { isArchived: false }, NOW)
    const later = new Date(NOW.getTime() + 60_000)
    expect(await apply(later)).toBe(1)
    expect(await row(id)).toMatchObject({ column: 'today', scheduledOn: '2026-11-10', scheduleAppliedAt: later })
  })

  it('moves a task once when two reads apply the schedules at the same time', async () => {
    const already = await task('today')
    const id = await task('backlog', { on: '2026-11-11' })
    const results = await Promise.all([apply(), apply()])
    expect(results.reduce((sum, moved) => sum + moved, 0)).toBe(1)
    expect(await column('today')).toEqual([already, id])
    expect(await row(id)).toMatchObject({ column: 'today', position: 1, scheduleAppliedAt: NOW })
  })
})
