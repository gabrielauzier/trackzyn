import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type HoursCountMode, tasks } from '../../src/db/schema.ts'
import { type ReportFilter, overview } from '../../src/services/reports.ts'
import { migratedDb } from '../support/db.ts'
import { seedFocus } from '../support/focus.ts'

// The seeded workspace is in America/Sao_Paulo (UTC-3, no daylight saving time in 2026).
const WEEK: ReportFilter = { from: '2026-10-19', to: '2026-10-25', listId: null }
const SP = (local: string) => new Date(`${local}-03:00`)
const NOW = SP('2026-10-25T12:00:00')
const H = 3600
const M = 60

let db: Database
let client: PGlite
let seed: Awaited<ReturnType<typeof seedFocus>>
beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  seed = await seedFocus(db, SP('2026-10-01T09:00:00'))
})
afterEach(async () => {
  await client.close()
})

const report = (mode: HoursCountMode, filter: ReportFilter = WEEK) =>
  overview(db, seed.userId, { id: seed.workspaceId, timezone: 'America/Sao_Paulo', hoursCountMode: mode }, filter, NOW)
const task = async (startedAt: Date, endedAt: Date, extra: { listId?: string; userId?: string } = {}) =>
  seed.addSession({ kind: 'task', taskId: await seed.addTask({ listId: extra.listId }), startedAt, endedAt, ...extra })
const pause = (startedAt: Date, endedAt: Date) => seed.addSession({ kind: 'break', startedAt, endedAt, plannedSeconds: 600 })
const dayOf = (result: Awaited<ReturnType<typeof report>>, date: string) => result.daily.find((item) => item.date === date)!

/** List A 09:00–11:00 and list B 10:00–12:00 on Monday, the spec example, and one task completed that day. */
async function twoListsOverlapping() {
  const listB = await seed.addList()
  await task(SP('2026-10-19T09:00:00'), SP('2026-10-19T11:00:00'))
  await task(SP('2026-10-19T10:00:00'), SP('2026-10-19T12:00:00'), { listId: listB })
  const done = await seed.addTask({ column: 'done' })
  await db.update(tasks).set({ completedAt: SP('2026-10-19T12:00:00'), completedByUserId: seed.userId }).where(eq(tasks.id, done))
  return listB
}

describe('overview in net hours (#42)', () => {
  it('HOURS-15 HOURS-17 HOURS-21 two lists 09–11 and 10–12: 3h worked, 4h gross, 3h that day, each list 2h', async () => {
    const listB = await twoListsOverlapping()

    const result = await report('net')

    expect(result.hours_count_mode).toBe('net')
    expect(result.tiles).toEqual({ work_days: 1, tasks_done: 1, task_seconds: 3 * H, avg_seconds_per_task: 3 * H })
    expect(result.gross_task_seconds).toBe(4 * H)
    expect(dayOf(result, '2026-10-19')).toEqual({ date: '2026-10-19', task_seconds: 3 * H, break_seconds: 0 })
    expect(result.by_list.map(({ list_id, seconds }) => ({ list_id, seconds }))).toEqual(
      expect.arrayContaining([
        { list_id: seed.listId, seconds: 2 * H },
        { list_id: listB, seconds: 2 * H },
      ]),
    )
    expect(result.by_list).toHaveLength(2)
  })

  it('HOURS-15 the most productive hours come from the union: 9, 10 and 11 tie with 1h each', async () => {
    await twoListsOverlapping()

    expect((await report('net')).productive).toEqual({ hours: [9, 10, 11], weekdays: [1], months: ['2026-10'] })
  })

  it('HOURS-20 HOURS-21 in gross the same week keeps every number of today: 4h worked, 4h gross, hour 10 the most productive', async () => {
    const listB = await twoListsOverlapping()

    const result = await report('gross')

    expect(result.hours_count_mode).toBe('gross')
    expect(result.tiles).toEqual({ work_days: 1, tasks_done: 1, task_seconds: 4 * H, avg_seconds_per_task: 4 * H })
    expect(result.gross_task_seconds).toBe(4 * H)
    expect(dayOf(result, '2026-10-19').task_seconds).toBe(4 * H)
    expect(result.productive.hours).toEqual([10])
    expect(result.by_list.find((item) => item.list_id === listB)?.seconds).toBe(2 * H)
  })

  it('HOURS-16 a break 10:30–11:30 over a task 09:00–11:00 counts 30min of break in net and 1h in gross; the task keeps 2h', async () => {
    await task(SP('2026-10-19T09:00:00'), SP('2026-10-19T11:00:00'))
    await pause(SP('2026-10-19T10:30:00'), SP('2026-10-19T11:30:00'))

    const net = await report('net')
    expect(net.break_seconds).toBe(30 * M)
    expect(dayOf(net, '2026-10-19')).toEqual({ date: '2026-10-19', task_seconds: 2 * H, break_seconds: 30 * M })
    expect(net.tiles.task_seconds).toBe(2 * H)

    const gross = await report('gross')
    expect(gross.break_seconds).toBe(H)
    expect(dayOf(gross, '2026-10-19').break_seconds).toBe(H)
  })

  it('HOURS-16 two breaks that overlap count once, and a period with only breaks keeps the whole break', async () => {
    await pause(SP('2026-10-20T15:00:00'), SP('2026-10-20T15:40:00'))
    await pause(SP('2026-10-20T15:20:00'), SP('2026-10-20T16:00:00'))

    const net = await report('net')
    expect(net.break_seconds).toBe(H)
    expect(dayOf(net, '2026-10-20')).toEqual({ date: '2026-10-20', task_seconds: 0, break_seconds: H })
    expect(net.tiles.task_seconds).toBe(0)
  })

  it('HOURS-36 two sessions 23:00–01:00 and 23:30–00:30 across midnight give 1h to each day in net, 2h in all', async () => {
    await task(SP('2026-10-20T23:00:00'), SP('2026-10-21T01:00:00'))
    await task(SP('2026-10-20T23:30:00'), SP('2026-10-21T00:30:00'))

    const net = await report('net')
    expect(dayOf(net, '2026-10-20').task_seconds).toBe(H)
    expect(dayOf(net, '2026-10-21').task_seconds).toBe(H)
    expect(net.tiles.task_seconds).toBe(2 * H)
    expect(net.gross_task_seconds).toBe(3 * H)
    expect(net.tiles.work_days).toBe(2)
  })

  it('HOURS-37 with the list filter the union takes only the sessions of that list', async () => {
    await twoListsOverlapping()

    const filtered = await report('net', { ...WEEK, listId: seed.listId })
    expect(filtered.tiles.task_seconds).toBe(2 * H)
    expect(filtered.gross_task_seconds).toBe(2 * H)
  })

  it('HOURS-39 another member’s overlapping session never enters the union', async () => {
    const other = await seed.addUser()
    await task(SP('2026-10-19T09:00:00'), SP('2026-10-19T11:00:00'))
    await task(SP('2026-10-19T10:00:00'), SP('2026-10-19T12:00:00'), { userId: other })

    const net = await report('net')
    expect(net.tiles.task_seconds).toBe(2 * H)
    expect(net.gross_task_seconds).toBe(2 * H)
  })

  it('HOURS-38 without overlap net equals gross and still reports net', async () => {
    await task(SP('2026-10-19T09:00:00'), SP('2026-10-19T10:00:00'))
    await task(SP('2026-10-19T10:00:00'), SP('2026-10-19T11:00:00'))

    const net = await report('net')
    expect(net.hours_count_mode).toBe('net')
    expect(net.tiles.task_seconds).toBe(2 * H)
    expect(net.gross_task_seconds).toBe(2 * H)
  })

  it('HOURS-22 floors the net total once from the exact union: 0.0–10.6 s and 5.0–20.7 s is 20 s', async () => {
    const at = (seconds: number) => new Date(SP('2026-10-19T09:00:00').getTime() + seconds * 1000)
    await task(at(0), at(10.6))
    await task(at(5), at(20.7))

    const net = await report('net')
    expect(net.tiles.task_seconds).toBe(20)
    expect(dayOf(net, '2026-10-19').task_seconds).toBe(20)
    // 10.6 + 15.7 = 26.3, floored once.
    expect(net.gross_task_seconds).toBe(26)
  })
})
