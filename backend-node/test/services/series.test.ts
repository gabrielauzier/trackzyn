import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { taskSeries, tasks, users, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { toTaskRead } from '../../src/routes/tasks.ts'
import { buildBoard } from '../../src/services/board.ts'
import { createList } from '../../src/services/lists.ts'
import { getTask } from '../../src/services/tasks.ts'
import type { RecurrenceRule } from '../../src/services/recurrence.ts'
import { seriesView, setRecurrence } from '../../src/services/series.ts'
import { migratedDb } from '../support/db.ts'

// Wednesday 2026-11-11, 14:07 in America/Sao_Paulo (UTC-3); Friday 2026-11-13 is two days on.
const NOW = new Date('2026-11-11T17:07:00Z')
const TZ = 'America/Sao_Paulo'

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

async function task(on: string | null, time: string | null = null): Promise<string> {
  const id = randomUUID()
  await db.insert(tasks).values({ id, listId, title: 'Review', column: 'backlog', position: 0, createdAt: NOW, scheduledOn: on, scheduledTime: time })
  return id
}

const rule = (given: Partial<RecurrenceRule> & Pick<RecurrenceRule, 'freq'>): RecurrenceRule => ({
  interval: 1,
  weekdays: null,
  monthDay: null,
  until: null,
  count: null,
  ...given,
})
const FRIDAYS = rule({ freq: 'weekly', weekdays: [5] })

const row = async (id: string) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0]!
const series = async (id: string) => (await db.select().from(taskSeries).where(eq(taskSeries.id, id)))[0]!

async function refusal(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(HttpError)
  const http = error as HttpError
  expect(http.statusCode).toBe(422)
  return http.extra?.code
}

describe('setRecurrence (US-9, D15)', () => {
  it('creates the series, links the task as its open occurrence and counts 1', async () => {
    const id = await task('2026-11-13', '14:00')
    const read = await setRecurrence(db, id, workspaceId, FRIDAYS, NOW)

    const seriesId = (await row(id)).seriesId
    expect(seriesId).not.toBeNull()
    expect(read.series?.id).toBe(seriesId)
    expect(await series(seriesId!)).toMatchObject({
      workspaceId,
      freq: 'weekly',
      interval: 1,
      weekdays: [5],
      monthDay: null,
      until: null,
      count: null,
      createdCount: 1,
      endedAt: null,
    })
    // The task keeps its day and time: the series takes them from the open occurrence.
    expect(await row(id)).toMatchObject({ scheduledOn: '2026-11-13', scheduledTime: '14:00:00' })
  })

  it('changes the rule of the series from there on, keeping the count of created occurrences', async () => {
    const id = await task('2026-11-13')
    const seriesId = (await setRecurrence(db, id, workspaceId, FRIDAYS, NOW)).series!.id
    await db.update(taskSeries).set({ createdCount: 4 }).where(eq(taskSeries.id, seriesId))

    const read = await setRecurrence(db, id, workspaceId, rule({ freq: 'monthly', monthDay: 13, count: 10 }), NOW)
    expect(read.series?.id).toBe(seriesId)
    expect(await series(seriesId)).toMatchObject({ freq: 'monthly', weekdays: null, monthDay: 13, count: 10, createdCount: 4, endedAt: null })
    expect((await db.select().from(taskSeries)).length).toBe(1)
  })

  it('stopping ends the series and leaves the open occurrence as a plain task', async () => {
    const id = await task('2026-11-13', '14:00')
    const seriesId = (await setRecurrence(db, id, workspaceId, FRIDAYS, NOW)).series!.id
    const later = new Date('2026-11-12T12:00:00Z')

    const read = await setRecurrence(db, id, workspaceId, null, later)
    expect(read.series).toBeNull()
    expect(await row(id)).toMatchObject({ seriesId: null, scheduledOn: '2026-11-13', scheduledTime: '14:00:00' })
    expect((await series(seriesId)).endedAt?.toISOString()).toBe(later.toISOString())
  })

  it('refuses a rule for a task without a scheduled day', async () => {
    const id = await task(null)
    expect(await refusal(setRecurrence(db, id, workspaceId, FRIDAYS, NOW))).toBe('recurrence_needs_day')
    expect((await row(id)).seriesId).toBeNull()
    expect(await db.select().from(taskSeries)).toEqual([])
  })

  it('refuses a weekly rule without weekdays', async () => {
    const id = await task('2026-11-13')
    expect(await refusal(setRecurrence(db, id, workspaceId, rule({ freq: 'weekly', weekdays: [] }), NOW))).toBe('recurrence_weekdays')
    expect(await refusal(setRecurrence(db, id, workspaceId, rule({ freq: 'weekly' }), NOW))).toBe('recurrence_weekdays')
    expect(await db.select().from(taskSeries)).toEqual([])
  })

  it('refuses an end day before the scheduled day, and takes the scheduled day itself', async () => {
    const id = await task('2026-11-13')
    expect(await refusal(setRecurrence(db, id, workspaceId, rule({ freq: 'daily', until: '2026-11-12' }), NOW))).toBe('recurrence_until_before_day')
    expect(await db.select().from(taskSeries)).toEqual([])

    await setRecurrence(db, id, workspaceId, rule({ freq: 'daily', until: '2026-11-13' }), NOW)
    expect(await series((await row(id)).seriesId!)).toMatchObject({ until: '2026-11-13' })
  })

  it('a task read answers the rule and the next day it projects, or null when no occurrence is left', async () => {
    const id = await task('2026-11-13', '14:00')
    const read = await setRecurrence(db, id, workspaceId, rule({ freq: 'weekly', weekdays: [5], count: 2 }), NOW)
    expect(seriesView(read.series!, read.scheduledOn)).toEqual({
      id: read.series!.id,
      rule: { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: 2 },
      next_on: '2026-11-20',
    })
    await db.update(taskSeries).set({ createdCount: 2 }).where(eq(taskSeries.id, read.series!.id))
    expect(seriesView(await series(read.series!.id), read.scheduledOn).next_on).toBeNull()
    expect(seriesView({ ...read.series!, endedAt: NOW }, read.scheduledOn).next_on).toBeNull()
  })

  it('the task read and the board card answer the series, and null for a task without one', async () => {
    const id = await task('2026-11-13', '14:00')
    const plain = await task('2026-11-14')
    const seriesId = (await setRecurrence(db, id, workspaceId, FRIDAYS, NOW)).series!.id
    const expected = {
      id: seriesId,
      rule: { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: null },
      next_on: '2026-11-20',
    }

    expect(toTaskRead(await getTask(db, id, workspaceId)).series).toEqual(expected)
    expect(toTaskRead(await getTask(db, plain, workspaceId)).series).toBeNull()
    const cards = (await buildBoard(db, listId, { id: workspaceId, timezone: TZ }, userId, NOW)).columns.backlog.tasks
    expect(cards.find((card) => card.id === id)?.series).toEqual(expected)
    expect(cards.find((card) => card.id === plain)?.series).toBeNull()
  })
})
