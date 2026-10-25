import type { PGlite } from '@electric-sql/pglite'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { lists, tasks, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { type ReportFilter, overview } from '../../src/services/reports.ts'
import { migratedDb } from '../support/db.ts'
import { seedFocus } from '../support/focus.ts'

// The seeded workspace is in America/Sao_Paulo (UTC-3, no daylight saving time in 2026): a day there
// starts at 03:00Z, so a UTC grouping lands sessions on other days than the ones asserted here.
const WEEK: ReportFilter = { from: '2026-10-19', to: '2026-10-25', listId: null }
const SP = (local: string) => new Date(`${local}-03:00`)
const NOW = SP('2026-10-25T12:00:00')

let db: Database
let client: PGlite
let seed: Awaited<ReturnType<typeof seedFocus>>
let workspace: { id: string; timezone: string | null }
beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  seed = await seedFocus(db, SP('2026-10-01T09:00:00'))
  workspace = { id: seed.workspaceId, timezone: 'America/Sao_Paulo' }
})
afterEach(async () => {
  await client.close()
})

/** A task session on a new task of `listId` (the seeded list by default). */
const task = async (startedAt: Date, endedAt: Date | null, extra: { listId?: string; userId?: string } = {}) =>
  seed.addSession({ kind: 'task', taskId: await seed.addTask({ listId: extra.listId }), startedAt, endedAt, ...extra })
const pause = (startedAt: Date, endedAt: Date, extra: { listId?: string } = {}) =>
  seed.addSession({ kind: 'break', startedAt, endedAt, plannedSeconds: 600, ...extra })

/** A task completed at `completedAt` by `userId` (the seeded user by default). */
async function completed(completedAt: Date, options: { userId?: string; listId?: string } = {}) {
  const id = await seed.addTask({ column: 'done', listId: options.listId })
  await db.update(tasks).set({ completedAt, completedByUserId: options.userId ?? seed.userId }).where(eq(tasks.id, id))
  return id
}

const H = 3600
const M = 60
const day = (date: string, taskSeconds: number, breakSeconds = 0) => ({ date, task_seconds: taskSeconds, break_seconds: breakSeconds })
const quietWeek = (...busy: ReturnType<typeof day>[]) =>
  ['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'].map(
    (date) => busy.find((item) => item.date === date) ?? day(date, 0),
  )

describe('overview', () => {
  it('REPORT-02 1h30 on Monday, 2h on Wednesday, a 10min break and 2 completions: 2 days, 3h 30min, 1h 45min per task', async () => {
    // Monday 21:00-22:30 in São Paulo is Tuesday 00:00-01:30 in UTC.
    await task(SP('2026-10-19T21:00:00'), SP('2026-10-19T22:30:00'))
    await task(SP('2026-10-21T14:00:00'), SP('2026-10-21T16:00:00'))
    await pause(SP('2026-10-21T16:00:00'), SP('2026-10-21T16:10:00'))
    await completed(SP('2026-10-19T22:30:00'))
    await completed(SP('2026-10-25T00:10:00'))
    // REPORT-09: another member's completion and the user's completion before the period do not count.
    await completed(SP('2026-10-21T16:00:00'), { userId: await seed.addUser() })
    await completed(SP('2026-10-18T23:50:00'))

    const report = await overview(db, seed.userId, workspace, WEEK, NOW)

    expect(report.timezone).toBe('America/Sao_Paulo')
    expect(report.range).toEqual({ from: '2026-10-19', to: '2026-10-25' })
    expect(report.tiles).toEqual({ work_days: 2, tasks_done: 2, task_seconds: 3 * H + 30 * M, avg_seconds_per_task: H + 45 * M })
    expect(report.daily).toEqual(quietWeek(day('2026-10-19', H + 30 * M), day('2026-10-21', 2 * H, 10 * M)))
    expect(report.break_seconds).toBe(10 * M)
    // REPORT-05: Wednesday has the most task time; hours 14, 15 and 21 have one full hour each.
    expect(report.productive).toEqual({ hours: [14, 15, 21], weekdays: [3], months: ['2026-10'] })
    expect(report.by_list).toEqual([{ list_id: seed.listId, name: 'Work', color: 1, is_archived: false, seconds: 3 * H + 30 * M }])
  })

  it('REPORT-03 answers a null average without completions', async () => {
    await task(SP('2026-10-20T09:00:00'), SP('2026-10-20T10:00:00'))

    const report = await overview(db, seed.userId, workspace, WEEK, NOW)

    expect(report.tiles).toEqual({ work_days: 1, tasks_done: 0, task_seconds: H, avg_seconds_per_task: null })
  })

  it('REPORT-10 splits a 23:30-00:30 session into 30min on each day', async () => {
    await task(SP('2026-10-20T23:30:00'), SP('2026-10-21T00:30:00'))

    const report = await overview(db, seed.userId, workspace, WEEK, NOW)

    expect(report.daily).toEqual(quietWeek(day('2026-10-20', 30 * M), day('2026-10-21', 30 * M)))
    expect(report.tiles).toMatchObject({ work_days: 2, task_seconds: H })
    expect(report.productive.hours).toEqual([0, 23])
    expect(report.productive.weekdays).toEqual([2, 3])
  })

  it('REPORT-11 counts an open session until now, and a due one until its deadline (AD-001)', async () => {
    await task(SP('2026-10-25T11:15:00'), null)

    const open = await overview(db, seed.userId, workspace, WEEK, NOW)
    expect(open.tiles.task_seconds).toBe(45 * M)
    expect(open.daily.at(-1)).toEqual(day('2026-10-25', 45 * M))

    const other = await seedFocus(db, NOW)
    await other.addSession({ kind: 'break', startedAt: SP('2026-10-25T11:00:00'), plannedSeconds: 600, deadlineAt: SP('2026-10-25T11:10:00') })
    const due = await overview(db, other.userId, { id: other.workspaceId, timezone: 'America/Sao_Paulo' }, WEEK, NOW)
    expect(due.break_seconds).toBe(10 * M)
  })

  it('REPORT-09 leaves out the sessions of another user of the same workspace', async () => {
    const someone = await seed.addUser()
    await task(SP('2026-10-20T09:00:00'), SP('2026-10-20T11:00:00'), { userId: someone })
    await task(SP('2026-10-20T14:00:00'), SP('2026-10-20T14:20:00'))

    const report = await overview(db, seed.userId, workspace, WEEK, NOW)

    expect(report.tiles.task_seconds).toBe(20 * M)
    expect(report.daily[1]).toEqual(day('2026-10-20', 20 * M))
  })

  it('counts only the part of a session inside the period (Edge Case)', async () => {
    await task(SP('2026-10-18T23:00:00'), SP('2026-10-19T00:45:00'))
    await task(SP('2026-10-25T23:40:00'), SP('2026-10-26T01:00:00'))

    const report = await overview(db, seed.userId, workspace, WEEK, SP('2026-10-26T02:00:00'))

    expect(report.daily[0]).toEqual(day('2026-10-19', 45 * M))
    expect(report.daily[6]).toEqual(day('2026-10-25', 20 * M))
    expect(report.tiles.task_seconds).toBe(65 * M)
  })

  it('AD-004 sums the days and hours across both daylight saving changes of America/New_York', async () => {
    await db.update(workspaces).set({ timezone: 'America/New_York' }).where(eq(workspaces.id, seed.workspaceId))
    const ny = { id: seed.workspaceId, timezone: 'America/New_York' }
    // 2026-11-01: at 02:00 EDT the clock goes back to 01:00 EST, so the day has 25 hours and 01:00 twice.
    await task(new Date('2026-11-01T00:30:00-04:00'), new Date('2026-11-01T03:30:00-05:00'))
    // Its midnight is 05:00Z (EST), not 04:00Z.
    await task(new Date('2026-11-01T23:30:00-05:00'), new Date('2026-11-02T00:30:00-05:00'))
    // 2026-03-08: at 02:00 EST the clock jumps to 03:00 EDT, a day of 23 hours.
    await task(new Date('2026-03-07T23:00:00-05:00'), new Date('2026-03-08T04:00:00-04:00'))

    const fall = await overview(db, seed.userId, ny, { from: '2026-10-31', to: '2026-11-02', listId: null }, new Date('2026-11-03T12:00:00Z'))
    expect(fall.daily).toEqual([day('2026-10-31', 0), day('2026-11-01', 4 * H + 30 * M), day('2026-11-02', 30 * M)])
    expect(fall.productive.hours).toEqual([1])

    const spring = await overview(db, seed.userId, ny, { from: '2026-03-07', to: '2026-03-08', listId: null }, new Date('2026-03-09T12:00:00Z'))
    expect(spring.daily).toEqual([day('2026-03-07', H), day('2026-03-08', 3 * H)])
    expect(spring.productive.hours).toEqual([0, 1, 3, 23])
  })

  it('REPORT-05 a tie between Monday and Wednesday answers both, and the tied months and hours too', async () => {
    await task(SP('2026-09-28T10:00:00'), SP('2026-09-28T11:00:00'))
    await task(SP('2026-10-21T16:00:00'), SP('2026-10-21T17:00:00'))

    const report = await overview(db, seed.userId, workspace, { from: '2026-09-28', to: '2026-10-25', listId: null }, NOW)

    expect(report.productive).toEqual({ hours: [10, 16], weekdays: [1, 3], months: ['2026-09', '2026-10'] })
  })

  it('a period of one day answers one daily item and the productive times of that day (Edge Case)', async () => {
    await task(SP('2026-10-20T09:00:00'), SP('2026-10-20T10:00:00'))
    await task(SP('2026-10-21T18:00:00'), SP('2026-10-21T18:50:00'))

    const report = await overview(db, seed.userId, workspace, { from: '2026-10-21', to: '2026-10-21', listId: null }, NOW)

    expect(report.daily).toEqual([day('2026-10-21', 50 * M)])
    expect(report.productive).toEqual({ hours: [18], weekdays: [3], months: ['2026-10'] })
  })

  it('REPORT-12 a period without sessions answers zeros and empty lists', async () => {
    const report = await overview(db, seed.userId, workspace, WEEK, NOW)

    expect(report.tiles).toEqual({ work_days: 0, tasks_done: 0, task_seconds: 0, avg_seconds_per_task: null })
    expect(report.daily).toEqual(quietWeek())
    expect(report.productive).toEqual({ hours: [], weekdays: [], months: [] })
    expect(report.by_list).toEqual([])
    expect(report.break_seconds).toBe(0)
  })

  it('REPORT-06 REPORT-08 one slice per list with time, archived lists included, the largest first', async () => {
    const archived = await seed.addList()
    await db.update(lists).set({ isArchived: true }).where(eq(lists.id, archived))
    await seed.addList() // a list without time stays out
    await task(SP('2026-10-20T09:00:00'), SP('2026-10-20T09:40:00'))
    await task(SP('2026-10-20T10:00:00'), SP('2026-10-20T11:00:00'), { listId: archived })
    await pause(SP('2026-10-20T11:00:00'), SP('2026-10-20T11:05:00'), { listId: archived })

    const report = await overview(db, seed.userId, workspace, WEEK, NOW)

    expect(report.by_list).toEqual([
      { list_id: archived, name: 'Other', color: 2, is_archived: true, seconds: H },
      { list_id: seed.listId, name: 'Work', color: 1, is_archived: false, seconds: 40 * M },
    ])
    expect(report.break_seconds).toBe(5 * M)
  })

  it('REPORT-07 with a list filter counts only that list: sessions, breaks, completions and productive times', async () => {
    const other = await seed.addList()
    await task(SP('2026-10-20T09:00:00'), SP('2026-10-20T10:00:00'))
    await pause(SP('2026-10-20T10:00:00'), SP('2026-10-20T10:10:00'))
    await completed(SP('2026-10-20T10:00:00'))
    await task(SP('2026-10-22T15:00:00'), SP('2026-10-22T15:30:00'), { listId: other })
    await pause(SP('2026-10-22T15:30:00'), SP('2026-10-22T15:35:00'), { listId: other })
    await completed(SP('2026-10-22T15:30:00'), { listId: other })
    await completed(SP('2026-10-23T15:30:00'), { listId: other })

    const report = await overview(db, seed.userId, workspace, { ...WEEK, listId: other }, NOW)

    expect(report.tiles).toEqual({ work_days: 1, tasks_done: 2, task_seconds: 30 * M, avg_seconds_per_task: 15 * M })
    expect(report.daily).toEqual(quietWeek(day('2026-10-22', 30 * M, 5 * M)))
    expect(report.break_seconds).toBe(5 * M)
    expect(report.productive).toEqual({ hours: [15], weekdays: [4], months: ['2026-10'] })
    expect(report.by_list.map((item) => item.list_id)).toEqual([other])
  })

  it('answers 404 for a list of another workspace', async () => {
    const foreign = await seedFocus(db, NOW)
    const error = await overview(db, seed.userId, workspace, { ...WEEK, listId: foreign.listId }, NOW).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 404, detail: 'List not found' })
  })

  it('answers 10 000 sessions over 366 days in less than 2 s', async () => {
    const taskId = await seed.addTask()
    // One 40-minute session every 52 minutes and 42 seconds from 2025-10-25 03:00Z: 10 000 sessions in 366 days.
    await db.execute(sql`
      INSERT INTO focus_sessions (id, user_id, workspace_id, list_id, task_id, kind, device_id, started_at, ended_at, last_seen_at, end_reason)
      SELECT gen_random_uuid(), ${seed.userId}, ${seed.workspaceId}, ${seed.listId}, ${taskId}, 'task', 'device-a',
             start, start + interval '40 minutes', start, 'pause'
      FROM (SELECT timestamptz '2025-10-25 03:00:00Z' + n * interval '3162 seconds' AS start FROM generate_series(0, 9999) AS n) AS g`)

    const began = performance.now()
    const report = await overview(db, seed.userId, workspace, { from: '2025-10-25', to: '2026-10-25', listId: null }, NOW)
    const elapsed = performance.now() - began
    console.info(`overview of 10 000 sessions over 366 days: ${Math.round(elapsed)} ms`)

    expect(report.daily).toHaveLength(366)
    expect(report.tiles.task_seconds).toBe(10_000 * 40 * M)
    expect(elapsed).toBeLessThan(2000)
  })
})
