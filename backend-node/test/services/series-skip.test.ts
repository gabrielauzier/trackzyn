import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, focusSessions, taskSeries, tasks } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import type { RecurrenceRule } from '../../src/services/recurrence.ts'
import { setRecurrence, skipOccurrence } from '../../src/services/series.ts'
import { migratedDb } from '../support/db.ts'
import { seedFocus } from '../support/focus.ts'

// Wednesday 2026-11-11, 14:07 in America/Sao_Paulo (UTC-3). The week runs from Monday 9 to Sunday 15.
const NOW = new Date('2026-11-11T17:07:00Z')

let db: Database
let client: PGlite
let seed: Awaited<ReturnType<typeof seedFocus>>

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  seed = await seedFocus(db, new Date('2026-11-01T12:00:00Z'))
})
afterEach(async () => {
  await client.close()
})

const FRIDAYS: RecurrenceRule = { freq: 'weekly', interval: 1, weekdays: [5], monthDay: null, until: null, count: null }

async function occurrence(column: TaskColumn, on: string, time: string | null, repeat: RecurrenceRule = FRIDAYS) {
  const id = await seed.addTask({ title: 'Weekly review', column })
  await db.update(tasks).set({ scheduledOn: on, scheduledTime: time }).where(eq(tasks.id, id))
  const seriesId = (await setRecurrence(db, id, seed.workspaceId, repeat, NOW)).series!.id
  return { id, seriesId }
}

const skip = (id: string) => skipOccurrence(db, id, seed.workspaceId, seed.userId, NOW)
const series = async (id: string) => (await db.select().from(taskSeries).where(eq(taskSeries.id, id)))[0]!

describe('skipOccurrence (US-12, D18)', () => {
  it('moves the same task to the next day of the rule at the same time, and counts one more occurrence', async () => {
    const { id, seriesId } = await occurrence('this_week', '2026-11-13', '14:00')
    const skipped = await skip(id)

    expect(skipped).toMatchObject({ id, scheduledOn: '2026-11-20', scheduledTime: '14:00:00', seriesId, column: 'this_week' })
    expect((await db.select().from(tasks)).map((task) => task.id)).toEqual([id])
    expect((await series(seriesId)).createdCount).toBe(2)
  })

  it('keeps the time spent on the task', async () => {
    const { id } = await occurrence('today', '2026-11-11', null)
    const session = await seed.addSession({ taskId: id, startedAt: new Date('2026-11-11T15:00:00Z'), endedAt: new Date('2026-11-11T15:25:00Z') })
    await skip(id)
    expect((await db.select().from(focusSessions).where(eq(focusSessions.id, session)))[0]).toMatchObject({ taskId: id })
  })

  it('past the count, the series ends and the task becomes a plain one, keeping its day', async () => {
    const { id, seriesId } = await occurrence('this_week', '2026-11-13', null, { ...FRIDAYS, count: 2 })
    expect(await skip(id)).toMatchObject({ scheduledOn: '2026-11-20', seriesId })

    const last = await skip(id)
    expect(last).toMatchObject({ seriesId: null, series: null, scheduledOn: '2026-11-20' })
    expect((await series(seriesId)).endedAt).toEqual(NOW)
  })

  it('answers 409 not_in_series for a task without a series, and changes nothing', async () => {
    const id = await seed.addTask({ column: 'this_week' })
    await db.update(tasks).set({ scheduledOn: '2026-11-13' }).where(eq(tasks.id, id))
    const error = await skip(id).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 409, extra: { code: 'not_in_series' } })
    expect((await db.select().from(tasks).where(eq(tasks.id, id)))[0]).toMatchObject({ scheduledOn: '2026-11-13' })
  })
})
