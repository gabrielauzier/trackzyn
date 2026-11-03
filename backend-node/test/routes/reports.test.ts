import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

const DAY_MS = 24 * 60 * 60 * 1000
const date = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)

/** An owner in a UTC workspace with a 10-minute open focus session and one task completed; a viewer and a stranger. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const { owner, workspaceId } = roles
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'UTC' } })
  const listId = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Work', color: 3 })).json().id as string
  const focusTask = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Focus', estimate_minutes: 60, column: 'today' })).json()
    .id as string
  const doneTask = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Done', column: 'today' })).json().id as string
  await call('POST', `/api/tasks/${doneTask}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
  const startedAt = new Date(Date.now() - 600_000)
  const started = await call('POST', '/api/focus/start', owner.token, workspaceId, {
    action_id: randomUUID(),
    occurred_at: startedAt.toISOString(),
    device_id: 'A',
    task_id: focusTask,
  })
  expect(started.statusCode).toBe(200)
  // Ten minutes before a UTC midnight the session covers two days.
  const workDays = startedAt.toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10) ? 1 : 2
  return { ...roles, listId, workDays }
}

const period = (from: string, to: string, listId?: string) => `from=${from}&to=${to}${listId ? `&list_id=${listId}` : ''}`

describe('GET /api/reports/overview', () => {
  it('REPORT-01 REPORT-09 answers the overview of the logged-in user only; a viewer reads their own, empty one', async () => {
    const { owner, viewer, workspaceId, listId, workDays } = await setup()
    const query = period(date(-1), date(1))

    const owners = await call('GET', `/api/reports/overview?${query}`, owner.token, workspaceId)
    expect(owners.statusCode).toBe(200)
    const report = owners.json()
    expect(report).toMatchObject({ timezone: 'UTC', range: { from: date(-1), to: date(1) }, break_seconds: 0 })
    expect(report.daily).toHaveLength(3)
    expect(report.tiles).toMatchObject({ work_days: workDays, tasks_done: 1 })
    expect(report.tiles.task_seconds).toBeGreaterThanOrEqual(600)
    expect(report.tiles.task_seconds).toBeLessThan(660)
    expect(report.by_list).toEqual([{ list_id: listId, name: 'Work', color: 3, is_archived: false, seconds: report.tiles.task_seconds }])
    expect(report.done.days[0].tasks[0]).toMatchObject({ title: 'Done', verdict: null })

    const viewers = await call('GET', `/api/reports/overview?${query}`, viewer.token, workspaceId)
    expect(viewers.statusCode).toBe(200)
    expect(viewers.json().tiles).toEqual({ work_days: 0, tasks_done: 0, task_seconds: 0, avg_seconds_per_task: null })
    expect(viewers.json().by_list).toEqual([])
    expect(viewers.json().done.days).toEqual([])
  })

  it('REPORT-13 answers 422 when the period ends before it starts or has 367 days, and 200 for 366 days', async () => {
    const { owner, workspaceId } = await setup()
    const get = (query: string) => call('GET', `/api/reports/overview?${query}`, owner.token, workspaceId)

    const reversed = await get(period('2026-10-21', '2026-10-20'))
    expect(reversed.statusCode).toBe(422)
    expect(reversed.json().detail[0]).toMatchObject({ loc: ['query', 'to'], msg: 'The period must not end before it starts' })

    const tooLong = await get(period('2025-10-25', '2026-10-26'))
    expect(tooLong.statusCode).toBe(422)
    expect(tooLong.json().detail[0]).toMatchObject({ loc: ['query', 'to'], msg: 'The period can have at most 366 days' })

    const longest = await get(period('2025-10-25', '2026-10-25'))
    expect(longest.statusCode).toBe(200)
    expect(longest.json().daily).toHaveLength(366)

    expect((await get(period('2026-10-20', '2026-10-20'))).json().daily).toHaveLength(1)
    expect((await get('from=2026-10-20')).statusCode).toBe(422)
    expect((await get(period('2026-10-20', '2026-02-31'))).statusCode).toBe(422)
  })

  it('REPORT-07 filters by list_id; a list of another workspace answers 404', async () => {
    const { owner, workspaceId, listId, strangerWorkspaceId, stranger } = await setup()
    const other = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Home', color: 2 })).json().id as string

    const mine = await call('GET', `/api/reports/overview?${period(date(-1), date(1), listId)}`, owner.token, workspaceId)
    expect(mine.json().tiles.tasks_done).toBe(1)
    const empty = await call('GET', `/api/reports/overview?${period(date(-1), date(1), other)}`, owner.token, workspaceId)
    expect(empty.json().tiles).toEqual({ work_days: 0, tasks_done: 0, task_seconds: 0, avg_seconds_per_task: null })

    const theirs = (await call('POST', '/api/lists', stranger.token, strangerWorkspaceId, { name: 'Theirs', color: 1 })).json().id as string
    const foreign = await call('GET', `/api/reports/overview?${period(date(-1), date(1), theirs)}`, owner.token, workspaceId)
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toEqual({ detail: 'List not found' })
  })
})

describe('GET /api/reports/sessions', () => {
  it('REPORT-20 REPORT-21 answers the user sessions with the open one in progress; a viewer gets no days', async () => {
    const { owner, viewer, workspaceId, workDays } = await setup()
    const query = period(date(-1), date(1))

    const owners = await call('GET', `/api/reports/sessions?${query}`, owner.token, workspaceId)
    expect(owners.statusCode).toBe(200)
    const sessions = owners.json().days.flatMap((item: { sessions: unknown[] }) => item.sessions)
    // The open session is cut at a UTC midnight it crosses: one piece per day it touches.
    expect(sessions).toHaveLength(workDays)
    expect(sessions[0]).toMatchObject({ kind: 'task', task_title: 'Focus', list_name: 'Work', ended_at: null })

    const viewers = await call('GET', `/api/reports/sessions?${query}`, viewer.token, workspaceId)
    expect(viewers.statusCode).toBe(200)
    expect(viewers.json()).toEqual({ days: [] })
  })

  it('REPORT-13 answers 422 for a reversed period or 367 days and 200 for 366; 404 for a list of another workspace', async () => {
    const { owner, workspaceId, stranger, strangerWorkspaceId } = await setup()
    const get = (query: string) => call('GET', `/api/reports/sessions?${query}`, owner.token, workspaceId)

    expect((await get(period('2026-10-21', '2026-10-20'))).statusCode).toBe(422)
    expect((await get(period('2025-10-25', '2026-10-26'))).statusCode).toBe(422)
    expect((await get(period('2025-10-25', '2026-10-25'))).statusCode).toBe(200)

    const theirs = (await call('POST', '/api/lists', stranger.token, strangerWorkspaceId, { name: 'Theirs', color: 1 })).json().id as string
    expect((await get(period(date(-1), date(1), theirs))).statusCode).toBe(404)
  })
})
