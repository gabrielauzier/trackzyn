import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, taskSeries, tasks, users, workspaces } from '../../src/db/schema.ts'
import { createList, updateList } from '../../src/services/lists.ts'
import { listScheduled } from '../../src/services/scheduled.ts'
import { migratedDb } from '../support/db.ts'

// Wednesday 2026-11-11, 14:07 in America/Sao_Paulo (UTC-3). The week runs from Monday 2026-11-09 to Sunday 2026-11-15.
const NOW = new Date('2026-11-11T17:07:00Z')
const TZ = 'America/Sao_Paulo'
const EARLIER = new Date('2026-11-10T03:00:00Z')
const WEEK = ['2026-11-09', '2026-11-15'] as const
const NEXT_WEEK = ['2026-11-16', '2026-11-22'] as const

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
  listId = (await createList(db, { workspaceId, userId, name: 'Work', color: 3 })).id
})
afterEach(async () => {
  await client.close()
})

async function task(
  column: TaskColumn,
  options: { on?: string; time?: string; position?: number; estimate?: number; seriesId?: string; list?: string; title?: string } = {},
): Promise<string> {
  const id = randomUUID()
  await db.insert(tasks).values({
    id,
    listId: options.list ?? listId,
    title: options.title ?? 'Review',
    column,
    position: options.position ?? 0,
    estimateMinutes: options.estimate ?? null,
    completedAt: column === 'done' ? EARLIER : null,
    createdAt: EARLIER,
    scheduledOn: options.on ?? null,
    scheduledTime: options.time ?? null,
    // Already applied, so the read does not move them to Today unless a test wants it.
    scheduleAppliedAt: column === 'today' ? EARLIER : null,
    seriesId: options.seriesId ?? null,
  })
  return id
}

async function series(options: { time?: string | null; count?: number; until?: string; createdCount?: number; ended?: boolean } = {}) {
  const id = randomUUID()
  await db.insert(taskSeries).values({
    id,
    workspaceId,
    freq: 'weekly',
    interval: 1,
    weekdays: [5],
    count: options.count ?? null,
    until: options.until ?? null,
    createdCount: options.createdCount ?? 1,
    time: options.time === undefined ? '14:00' : options.time,
    endedAt: options.ended ? EARLIER : null,
    createdAt: EARLIER,
  })
  return id
}

const read = (period: readonly [string, string] = WEEK) => listScheduled(db, workspaceId, period[0], period[1], NOW)

describe('listScheduled: the scheduled tasks of a period (US-5, US-14, D9)', () => {
  it('answers the pending tasks of the period with a time in timed, with list, column, estimate and no series', async () => {
    const id = await task('this_week', { on: '2026-11-13', time: '14:00', position: 2, estimate: 90, title: 'Write' })
    const { timed, untimed } = await read()
    expect(untimed).toEqual([])
    expect(timed).toEqual([
      {
        id,
        title: 'Write',
        list: { id: listId, name: 'Work', color: 3 },
        column: 'this_week',
        position: 2,
        estimate_minutes: 90,
        scheduled_on: '2026-11-13',
        scheduled_time: '14:00',
        series: null,
        kind: 'task',
      },
    ])
  })

  it('orders timed by day and time', async () => {
    const late = await task('this_week', { on: '2026-11-12', time: '16:00' })
    const friday = await task('this_week', { on: '2026-11-13', time: '08:00' })
    const early = await task('this_week', { on: '2026-11-12', time: '09:30', position: 1 })
    expect((await read()).timed.map((found) => found.id)).toEqual([early, late, friday])
  })

  it('US-14 answers the tasks without a time in untimed, by day and then in the order of the board: Today, This week, Backlog, position', async () => {
    const backlog = await task('backlog', { on: '2026-11-20' })
    const weekSecond = await task('this_week', { on: '2026-11-20', position: 1 })
    const weekFirst = await task('this_week', { on: '2026-11-20', position: 0 })
    const today = await task('today', { on: '2026-11-20' })
    const earlierDay = await task('backlog', { on: '2026-11-17' })
    const { untimed, timed } = await read(NEXT_WEEK)
    expect(timed).toEqual([])
    expect(untimed.map((found) => found.id)).toEqual([earlierDay, today, weekFirst, weekSecond, backlog])
    expect(untimed[0]).toMatchObject({ scheduled_on: '2026-11-17', scheduled_time: null, column: 'backlog' })
  })

  it('D5 leaves out done tasks, tasks outside the period and tasks without a schedule', async () => {
    await task('done', { on: '2026-11-13', time: '10:00' })
    await task('done', { on: '2026-11-13' })
    await task('this_week', { on: '2026-11-16', time: '10:00' })
    await task('this_week')
    const inside = await task('this_week', { on: '2026-11-15', time: '23:45' })
    const { timed, untimed, projected } = await read()
    expect(timed.map((found) => found.id)).toEqual([inside])
    expect(untimed).toEqual([])
    expect(projected).toEqual([])
  })

  it('D9 answers the tasks of every list of the workspace and none of another workspace', async () => {
    const otherList = (await createList(db, { workspaceId, userId, name: 'Home', color: 5 })).id
    const strangerWorkspace = randomUUID()
    await db.insert(workspaces).values({ id: strangerWorkspace, name: 'Theirs', timezone: TZ, createdAt: NOW })
    const strangerList = (await createList(db, { workspaceId: strangerWorkspace, userId, name: 'Theirs', color: 1 })).id
    const mine = await task('this_week', { on: '2026-11-13', time: '10:00' })
    const home = await task('this_week', { on: '2026-11-13', time: '11:00', list: otherList })
    await task('this_week', { on: '2026-11-13', time: '12:00', list: strangerList })
    const { timed } = await read()
    expect(timed.map((found) => [found.id, found.list.name])).toEqual([
      [mine, 'Work'],
      [home, 'Home'],
    ])
  })

  it('leaves out the tasks of archived lists', async () => {
    const archived = (await createList(db, { workspaceId, userId, name: 'Old', color: 2 })).id
    await task('this_week', { on: '2026-11-13', time: '10:00', list: archived })
    await updateList(db, archived, workspaceId, { isArchived: true }, NOW)
    expect((await read()).timed).toEqual([])
  })

  it('AD-009 applies the due schedules first: a Backlog task of today answers in Today', async () => {
    const id = await task('backlog', { on: '2026-11-11', time: '18:00' })
    const { timed } = await read()
    expect(timed).toEqual([expect.objectContaining({ id, column: 'today' })])
    expect((await db.select().from(tasks).where(eq(tasks.id, id)))[0]).toMatchObject({ column: 'today', scheduleAppliedAt: NOW })
  })

  it('US-11 answers the rule of the live series of an open occurrence', async () => {
    const seriesId = await series({ count: 5 })
    await task('this_week', { on: '2026-11-13', time: '14:00', seriesId })
    const { timed } = await read()
    expect(timed[0]!.series).toEqual({
      id: seriesId,
      rule: { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: 5 },
    })
  })
})

describe('listScheduled: the projected occurrences of a series (US-11, D14)', () => {
  it('projects the next days of the rule after the open occurrence, at the time of the series, with its title, list, estimate and rule', async () => {
    const seriesId = await series()
    const id = await task('this_week', { on: '2026-11-13', time: '14:00', seriesId, estimate: 45, title: 'Weekly review' })
    const { projected, timed } = await read(['2026-11-09', '2026-11-29'])
    expect(timed.map((found) => found.id)).toEqual([id])
    expect(projected).toEqual([
      {
        series_id: seriesId,
        task_id: id,
        title: 'Weekly review',
        list: { id: listId, name: 'Work', color: 3 },
        on: '2026-11-20',
        time: '14:00',
        estimate_minutes: 45,
        rule: { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: null },
      },
      expect.objectContaining({ on: '2026-11-27', time: '14:00', task_id: id }),
    ])
  })

  it('D27 projects at the time of the series when the open occurrence moved to another time on its own', async () => {
    const seriesId = await series({ time: '14:00' })
    await task('this_week', { on: '2026-11-13', time: '09:00', seriesId })
    expect((await read(NEXT_WEEK)).projected.map((found) => [found.on, found.time])).toEqual([['2026-11-20', '14:00']])
  })

  it('projects into the period only: an open occurrence of an earlier week still projects into a later one', async () => {
    const seriesId = await series()
    const id = await task('today', { on: '2026-11-06', time: '14:00', seriesId })
    const { projected, timed } = await read(NEXT_WEEK)
    expect(timed).toEqual([])
    expect(projected).toEqual([expect.objectContaining({ task_id: id, on: '2026-11-20' })])
  })

  it('D17 projects after today: a missed open occurrence projects its next day from today on', async () => {
    const seriesId = await series()
    await task('today', { on: '2026-11-06', time: '14:00', seriesId })
    expect((await read()).projected.map((found) => found.on)).toEqual(['2026-11-13'])
  })

  it('stops at count: the open occurrence is the created_count-th', async () => {
    const seriesId = await series({ count: 3, createdCount: 2 })
    await task('this_week', { on: '2026-11-13', time: '14:00', seriesId })
    expect((await read(['2026-11-09', '2026-12-06'])).projected.map((found) => found.on)).toEqual(['2026-11-20'])
  })

  it('stops at until, the day included', async () => {
    const seriesId = await series({ until: '2026-11-27' })
    await task('this_week', { on: '2026-11-13', time: '14:00', seriesId })
    expect((await read(['2026-11-09', '2026-12-06'])).projected.map((found) => found.on)).toEqual(['2026-11-20', '2026-11-27'])
  })

  it('US-11 does not project a series without a time, and its open occurrence answers in untimed with the series', async () => {
    const seriesId = await series({ time: null })
    const id = await task('this_week', { on: '2026-11-13', seriesId })
    const { projected, untimed } = await read(['2026-11-09', '2026-11-29'])
    expect(projected).toEqual([])
    expect(untimed).toEqual([expect.objectContaining({ id, series: expect.objectContaining({ id: seriesId }) })])
  })

  it('does not project an ended series, and its task answers without a series', async () => {
    const seriesId = await series({ ended: true })
    await task('this_week', { on: '2026-11-13', time: '14:00', seriesId })
    const { projected, timed } = await read(['2026-11-09', '2026-11-29'])
    expect(projected).toEqual([])
    expect(timed[0]!.series).toBeNull()
  })

  it('does not project from a completed occurrence', async () => {
    const seriesId = await series()
    await task('done', { on: '2026-11-13', time: '14:00', seriesId })
    expect((await read(['2026-11-09', '2026-11-29'])).projected).toEqual([])
  })
})
