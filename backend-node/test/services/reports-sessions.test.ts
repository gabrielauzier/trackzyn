import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { type ReportFilter, overview } from '../../src/services/reports.ts'
import { sessionsReport } from '../../src/services/reports-sessions.ts'
import { migratedDb } from '../support/db.ts'
import { seedFocus } from '../support/focus.ts'

// America/Sao_Paulo is UTC-3: 22:00 on Monday is already Tuesday in UTC.
const WEEK: ReportFilter = { from: '2026-10-19', to: '2026-10-25', listId: null }
const SP = (local: string) => new Date(`${local}-03:00`)
const NOW = SP('2026-10-25T12:00:00')
const M = 60

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

describe('sessionsReport', () => {
  it('REPORT-20 groups 3 task sessions and 1 break of two days by day, with start, end, task or break, list and duration', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const review = await seed.addTask({ title: 'Review' })
    const other = await seed.addList()
    const plan = await seed.addTask({ title: 'Plan', listId: other })
    const first = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-10-19T22:00:00'), endedAt: SP('2026-10-19T22:50:00') })
    const second = await seed.addSession({ kind: 'task', taskId: review, startedAt: SP('2026-10-21T09:00:00'), endedAt: SP('2026-10-21T09:25:00') })
    const pause = await seed.addSession({ kind: 'break', startedAt: SP('2026-10-21T09:25:00'), endedAt: SP('2026-10-21T09:30:00'), plannedSeconds: 300 })
    const third = await seed.addSession({ kind: 'task', taskId: plan, listId: other, startedAt: SP('2026-10-21T09:30:00'), endedAt: SP('2026-10-21T10:30:00') })
    // REPORT-09: another user's session in the same workspace stays out.
    await seed.addSession({ kind: 'task', taskId: write, userId: await seed.addUser(), startedAt: SP('2026-10-21T11:00:00'), endedAt: SP('2026-10-21T11:30:00') })

    const report = await sessionsReport(db, seed.userId, workspace, WEEK, NOW)

    const row = (id: string, kind: string, task: string | null, list: string, start: string, end: string, seconds: number) => ({
      id,
      kind,
      task_title: task,
      list_name: list,
      started_at: SP(start).toISOString(),
      ended_at: SP(end).toISOString(),
      seconds,
    })
    expect(report).toEqual({
      days: [
        {
          date: '2026-10-21',
          sessions: [
            row(third, 'task', 'Plan', 'Other', '2026-10-21T09:30:00', '2026-10-21T10:30:00', 60 * M),
            row(pause, 'break', null, 'Work', '2026-10-21T09:25:00', '2026-10-21T09:30:00', 5 * M),
            row(second, 'task', 'Review', 'Work', '2026-10-21T09:00:00', '2026-10-21T09:25:00', 25 * M),
          ],
        },
        { date: '2026-10-19', sessions: [row(first, 'task', 'Write', 'Work', '2026-10-19T22:00:00', '2026-10-19T22:50:00', 50 * M)] },
      ],
    })
  })

  it('REPORT-21 shows an open session with a null end and its time until now', async () => {
    const taskId = await seed.addTask({ title: 'Write' })
    const id = await seed.addSession({ kind: 'task', taskId, startedAt: SP('2026-10-25T11:20:00') })

    const report = await sessionsReport(db, seed.userId, workspace, WEEK, NOW)

    expect(report.days).toEqual([
      {
        date: '2026-10-25',
        sessions: [
          { id, kind: 'task', task_title: 'Write', list_name: 'Work', started_at: SP('2026-10-25T11:20:00').toISOString(), ended_at: null, seconds: 40 * M },
        ],
      },
    ])
  })

  it('AD-001 shows a due open session ended at its deadline', async () => {
    const id = await seed.addSession({ kind: 'break', startedAt: SP('2026-10-25T11:00:00'), plannedSeconds: 600, deadlineAt: SP('2026-10-25T11:10:00') })

    const report = await sessionsReport(db, seed.userId, workspace, WEEK, NOW)

    expect(report.days[0]!.sessions[0]).toMatchObject({ id, ended_at: SP('2026-10-25T11:10:00').toISOString(), seconds: 10 * M })
  })

  it('REPORT-20 lists a session crossing a period edge or midnight once, on its local start day in the period, with only its part inside the period', async () => {
    const taskId = await seed.addTask({ title: 'Write' })
    // Before the period until 00:30 of its first day: listed on 2026-10-19 with 30 min.
    const before = await seed.addSession({ kind: 'task', taskId, startedAt: SP('2026-10-18T23:30:00'), endedAt: SP('2026-10-19T00:30:00') })
    // Across midnight inside the period: listed once, on the start day, with the whole hour.
    const across = await seed.addSession({ kind: 'break', startedAt: SP('2026-10-21T23:30:00'), endedAt: SP('2026-10-22T00:30:00'), plannedSeconds: 3600 })
    // From the last day of the period until after it: listed on 2026-10-25 with 30 min.
    const after = await seed.addSession({ kind: 'task', taskId, startedAt: SP('2026-10-25T23:30:00'), endedAt: SP('2026-10-26T00:30:00') })
    const now = SP('2026-10-26T02:00:00')

    const report = await sessionsReport(db, seed.userId, workspace, WEEK, now)

    const row = (id: string, start: string, end: string, seconds: number) => ({
      id,
      started_at: SP(start).toISOString(),
      ended_at: SP(end).toISOString(),
      seconds,
    })
    expect(report.days.map((item) => ({ date: item.date, sessions: item.sessions.map(({ id, started_at, ended_at, seconds }) => ({ id, started_at, ended_at, seconds })) }))).toEqual([
      { date: '2026-10-25', sessions: [row(after, '2026-10-25T23:30:00', '2026-10-26T00:30:00', 30 * M)] },
      { date: '2026-10-21', sessions: [row(across, '2026-10-21T23:30:00', '2026-10-22T00:30:00', 60 * M)] },
      { date: '2026-10-19', sessions: [row(before, '2026-10-18T23:30:00', '2026-10-19T00:30:00', 30 * M)] },
    ])
    // The durations add up to the overview's task and break time of the same period.
    const { tiles, break_seconds } = await overview(db, seed.userId, workspace, WEEK, now)
    const listed = report.days.flatMap((item) => item.sessions).reduce((total, session) => total + session.seconds, 0)
    expect(listed).toBe(120 * M)
    expect(tiles.task_seconds + break_seconds).toBe(listed)
  })

  it('REPORT-20 leaves out a session starting at midnight right after the last day of the period', async () => {
    const taskId = await seed.addTask()
    await seed.addSession({ kind: 'task', taskId, startedAt: SP('2026-10-26T00:00:00'), endedAt: SP('2026-10-26T00:30:00') })
    const now = SP('2026-10-26T02:00:00')

    expect(await sessionsReport(db, seed.userId, workspace, WEEK, now)).toEqual({ days: [] })
    expect((await overview(db, seed.userId, workspace, WEEK, now)).tiles.task_seconds).toBe(0)
  })

  it('REPORT-22 a period without sessions answers no days', async () => {
    const taskId = await seed.addTask()
    await seed.addSession({ kind: 'task', taskId, startedAt: SP('2026-10-18T10:00:00'), endedAt: SP('2026-10-18T11:00:00') })

    expect(await sessionsReport(db, seed.userId, workspace, WEEK, NOW)).toEqual({ days: [] })
  })

  it('REPORT-07 with a list filter lists only that list, and 404 for a list of another workspace', async () => {
    const other = await seed.addList()
    const taskId = await seed.addTask()
    await seed.addSession({ kind: 'task', taskId, startedAt: SP('2026-10-20T09:00:00'), endedAt: SP('2026-10-20T09:30:00') })
    const id = await seed.addSession({ kind: 'break', listId: other, startedAt: SP('2026-10-20T10:00:00'), endedAt: SP('2026-10-20T10:05:00'), plannedSeconds: 300 })

    const report = await sessionsReport(db, seed.userId, workspace, { ...WEEK, listId: other }, NOW)
    expect(report.days.flatMap((item) => item.sessions.map((session) => session.id))).toEqual([id])

    const foreign = await seedFocus(db, NOW)
    const error = await sessionsReport(db, seed.userId, workspace, { ...WEEK, listId: foreign.listId }, NOW).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 404 })
  })
})
