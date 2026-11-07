import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { and, asc, eq, ne } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, focusSessions, subtasks, taskSeries, tasks } from '../../src/db/schema.ts'
import * as focus from '../../src/services/focus.ts'
import type { RecurrenceRule } from '../../src/services/recurrence.ts'
import { setSchedule } from '../../src/services/schedule.ts'
import { setRecurrence } from '../../src/services/series.ts'
import { moveTask } from '../../src/services/tasks.ts'
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

const rule = (given: Partial<RecurrenceRule> & Pick<RecurrenceRule, 'freq'>): RecurrenceRule => ({
  interval: 1,
  weekdays: null,
  monthDay: null,
  until: null,
  count: null,
  ...given,
})
const FRIDAYS = rule({ freq: 'weekly', weekdays: [5] })

/** A task of `column` scheduled for `on` at `time`, repeating by `repeat`. */
async function occurrence(column: TaskColumn, on: string, time: string | null, repeat: RecurrenceRule) {
  const id = await seed.addTask({ title: 'Weekly review', estimate: 45, column })
  await db
    .update(tasks)
    .set({ notes: 'Check the metrics', scheduledOn: on, scheduledTime: time })
    .where(eq(tasks.id, id))
  await db.insert(subtasks).values([
    { id: randomUUID(), taskId: id, title: 'Inbox', done: true, position: 0 },
    { id: randomUUID(), taskId: id, title: 'Calendar', done: false, position: 1 },
  ])
  const seriesId = (await setRecurrence(db, id, seed.workspaceId, repeat, NOW)).series!.id
  return { id, seriesId }
}

const complete = (id: string, at = NOW) => moveTask(db, id, seed.workspaceId, { column: 'done', beforeTaskId: null, byUserId: seed.userId }, at)
const row = async (id: string) => (await db.select().from(tasks).where(eq(tasks.id, id)))[0]!
const series = async (id: string) => (await db.select().from(taskSeries).where(eq(taskSeries.id, id)))[0]!
/** The occurrences of the series other than `except`. */
const others = async (seriesId: string, except: string) =>
  db
    .select()
    .from(tasks)
    .where(and(eq(tasks.seriesId, seriesId), ne(tasks.id, except)))
    .orderBy(asc(tasks.createdAt))
const subtasksOf = async (id: string) =>
  (await db.select().from(subtasks).where(eq(subtasks.taskId, id)).orderBy(asc(subtasks.position))).map((s) => ({ title: s.title, done: s.done }))

describe('completing an occurrence creates the next one (US-10, D13, D17, D19)', () => {
  it('copies title, notes, estimate, list and the subtasks unchecked, on the next day of the rule at the same time', async () => {
    const { id, seriesId } = await occurrence('today', '2026-11-11', '09:00', rule({ freq: 'daily' }))
    await complete(id)

    const [next] = await others(seriesId, id)
    expect(next).toMatchObject({
      title: 'Weekly review',
      notes: 'Check the metrics',
      estimateMinutes: 45,
      listId: seed.listId,
      seriesId,
      scheduledOn: '2026-11-12',
      scheduledTime: '09:00:00',
      completedAt: null,
      // Thursday 12 is in this week: the rules of saving take it to This week (D3).
      column: 'this_week',
    })
    expect(await subtasksOf(next!.id)).toEqual([
      { title: 'Inbox', done: false },
      { title: 'Calendar', done: false },
    ])
    expect((await series(seriesId)).createdCount).toBe(2)
    // The completed one stays done, with its own subtasks.
    expect(await row(id)).toMatchObject({ column: 'done', seriesId, scheduledOn: '2026-11-11' })
    expect(await subtasksOf(id)).toEqual([
      { title: 'Inbox', done: true },
      { title: 'Calendar', done: false },
    ])
  })

  it('D27 an occurrence moved to another time for this one only: the next one is born at the time of the series', async () => {
    const { id, seriesId } = await occurrence('today', '2026-11-11', '15:00', rule({ freq: 'daily' }))
    await setSchedule(db, id, seed.workspaceId, { on: '2026-11-11', time: '16:30' }, seed.userId, NOW)
    expect(await series(seriesId)).toMatchObject({ time: '15:00:00' })

    await complete(id)
    const [next] = await others(seriesId, id)
    expect(next).toMatchObject({ scheduledOn: '2026-11-12', scheduledTime: '15:00:00' })
    expect(await row(id)).toMatchObject({ scheduledTime: '16:30:00' })
  })

  it('a next day after this week goes to Backlog; completed early, the occurrence day is not repeated', async () => {
    const { id, seriesId } = await occurrence('this_week', '2026-11-13', null, FRIDAYS)
    await complete(id)
    const [next] = await others(seriesId, id)
    expect(next).toMatchObject({ scheduledOn: '2026-11-20', scheduledTime: null, column: 'backlog' })
  })

  it('completed late, the missed days are skipped', async () => {
    const { id, seriesId } = await occurrence('today', '2026-10-30', null, FRIDAYS)
    await complete(id)
    expect((await others(seriesId, id)).map((task) => task.scheduledOn)).toEqual(['2026-11-13'])
  })

  it('the time spent and the sessions stay on the completed occurrence', async () => {
    const { id, seriesId } = await occurrence('today', '2026-11-11', null, rule({ freq: 'daily' }))
    const session = await seed.addSession({ taskId: id, startedAt: new Date('2026-11-11T15:00:00Z'), endedAt: new Date('2026-11-11T15:25:00Z') })
    await complete(id)

    const [next] = await others(seriesId, id)
    expect((await seed.session(session)).taskId).toBe(id)
    expect(await db.select().from(focusSessions).where(eq(focusSessions.taskId, next!.id))).toEqual([])
  })

  it('moving the completed occurrence back out of done keeps the new one, and completing it again creates no third', async () => {
    const { id, seriesId } = await occurrence('today', '2026-11-11', null, rule({ freq: 'daily' }))
    await complete(id)
    const [next] = await others(seriesId, id)

    await moveTask(db, id, seed.workspaceId, { column: 'today', beforeTaskId: null, byUserId: seed.userId }, NOW)
    expect((await others(seriesId, id)).map((task) => task.id)).toEqual([next!.id])
    expect(await row(next!.id)).toMatchObject({ column: 'this_week', scheduledOn: '2026-11-12' })

    // Another occurrence is pending: one open occurrence at a time (D13).
    await complete(id)
    expect((await others(seriesId, id)).map((task) => task.id)).toEqual([next!.id])
    expect((await series(seriesId)).createdCount).toBe(2)
  })

  it('a series that created its count of occurrences ends instead, with no new task', async () => {
    const { id, seriesId } = await occurrence('today', '2026-11-11', null, rule({ freq: 'daily', count: 2 }))
    await complete(id)
    const [second] = await others(seriesId, id)
    expect((await series(seriesId)).endedAt).toBeNull()

    const later = new Date('2026-11-12T15:00:00Z')
    await complete(second!.id, later)
    expect(await others(seriesId, second!.id)).toHaveLength(1)
    expect(await series(seriesId)).toMatchObject({ createdCount: 2, endedAt: later })
  })

  it('a next day past until ends the series, with no new task', async () => {
    const { id, seriesId } = await occurrence('today', '2026-11-11', null, rule({ freq: 'weekly', weekdays: [3], until: '2026-11-17' }))
    await complete(id)
    expect(await others(seriesId, id)).toEqual([])
    expect((await series(seriesId)).endedAt).toEqual(NOW)
  })

  it('completing on the focus screen creates the next occurrence too, inside the focus transaction', async () => {
    const { id, seriesId } = await occurrence('today', '2026-11-11', '16:00', rule({ freq: 'daily' }))
    await focus.startFocus(db, seed, { actionId: randomUUID(), occurredAt: NOW, deviceId: 'A' }, { taskId: id, takeover: false }, NOW)
    const at = new Date('2026-11-11T17:20:00Z')
    await focus.completeFocus(db, seed, { actionId: randomUUID(), occurredAt: at, deviceId: 'A' }, { taskId: id }, at)

    expect(await row(id)).toMatchObject({ column: 'done', completedByUserId: seed.userId })
    const [next] = await others(seriesId, id)
    expect(next).toMatchObject({ scheduledOn: '2026-11-12', scheduledTime: '16:00:00', column: 'this_week' })
    expect((await series(seriesId)).createdCount).toBe(2)
  })
})
