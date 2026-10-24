import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, focusSessions, subtasks, tasks, users, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { buildBoard } from '../../src/services/board.ts'
import { createList } from '../../src/services/lists.ts'
import { migratedDb } from '../support/db.ts'

// Saturday 2026-10-24, 12:00 in America/Sao_Paulo (UTC-3); the week started on Monday 2026-10-19.
const NOW = new Date('2026-10-24T15:00:00Z')
const TZ = 'America/Sao_Paulo'

let db: Database
let client: PGlite
let workspace: { id: string; timezone: string | null }
let listId: string
let userId: string

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  userId = randomUUID()
  await db.insert(users).values({ id: userId, email: 'a@b.c', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
  workspace = { id: randomUUID(), timezone: TZ }
  await db.insert(workspaces).values({ id: workspace.id, name: 'Mine', timezone: TZ, createdAt: NOW })
  listId = (await createList(db, { workspaceId: workspace.id, userId, name: 'Week', color: 4 })).id
})
afterEach(async () => {
  await client.close()
})

let position = 0
async function task(column: TaskColumn, options: { title?: string; estimate?: number; completedAt?: string } = {}) {
  const id = randomUUID()
  await db.insert(tasks).values({
    id,
    listId,
    title: options.title ?? `task ${position}`,
    estimateMinutes: options.estimate ?? null,
    column,
    position: position++,
    completedAt: column === 'done' ? new Date(options.completedAt ?? NOW) : null,
    createdAt: new Date('2026-10-01T00:00:00Z'),
  })
  return id
}

const board = (now = NOW) => buildBoard(db, listId, workspace, userId, now)
const titles = (views: Array<{ title: string }>) => views.map((view) => view.title)

describe('board service', () => {
  it('BOARD-05 the print scenario: 11 done this week, 0 today, 1 pending in Today gives 11/12 and 0/1', async () => {
    // Monday 2026-10-19 to Friday 2026-10-23, in local time.
    const weekDays = ['2026-10-19T12:00:00Z', '2026-10-20T12:00:00Z', '2026-10-21T12:00:00Z', '2026-10-22T12:00:00Z', '2026-10-23T12:00:00Z']
    for (let i = 0; i < 11; i++) await task('done', { completedAt: weekDays[i % weekDays.length] })
    // Sunday before the week (local), even if it is in the same UTC week of Monday 03:00: outside.
    await task('done', { completedAt: '2026-10-19T02:59:00Z' })
    await task('today', { title: 'pending today', estimate: 30 })
    await task('backlog', { estimate: 20 })

    const result = await board()
    expect(result.columns.this_week).toMatchObject({ done: 11, total: 12 })
    expect(result.columns.today).toMatchObject({ done: 0, total: 1 })
    expect(result.columns.done.today_count).toBe(0)
  })

  it('BOARD-01 BOARD-04 BOARD-05 sums the pending estimates per column, This week including Today', async () => {
    await task('backlog', { title: 'b1', estimate: 20 })
    await task('backlog', { title: 'b2' })
    await task('this_week', { title: 'w1', estimate: 45 })
    await task('today', { title: 't1', estimate: 30 })
    await task('today', { title: 't2', estimate: 60 })
    await task('done', { title: 'd1', estimate: 500 })
    await task('done', { title: 'd2', estimate: 500, completedAt: '2026-10-21T12:00:00Z' })

    const result = await board()
    expect(result.list).toEqual({ id: listId, name: 'Week', color: 4 })
    expect(result.timezone).toBe(TZ)
    expect(result.pending).toEqual({ count: 5, estimate_minutes: 155 })
    expect(result.columns.backlog).toEqual({ tasks: expect.any(Array), estimate_minutes: 20 })
    expect(titles(result.columns.backlog.tasks)).toEqual(['b1', 'b2'])
    expect(result.columns.this_week).toMatchObject({ estimate_minutes: 135, done: 2, total: 5 })
    expect(titles(result.columns.this_week.tasks)).toEqual(['w1'])
    expect(result.columns.today).toMatchObject({ estimate_minutes: 90, done: 1, total: 3 })
    expect(titles(result.columns.today.tasks)).toEqual(['t1', 't2'])
  })

  it('shows each card with its estimate, 0 spent seconds and the x/y count of its subtasks', async () => {
    const id = await task('today', { title: 'with subtasks', estimate: 87 })
    await db.insert(subtasks).values([
      { id: randomUUID(), taskId: id, title: 'a', done: true, position: 0 },
      { id: randomUUID(), taskId: id, title: 'b', done: false, position: 1 },
      { id: randomUUID(), taskId: id, title: 'c', done: false, position: 2 },
    ])
    const [card] = (await board()).columns.today.tasks
    expect(card).toEqual({ id, title: 'with subtasks', estimate_minutes: 87, spent_seconds: 0, position: expect.any(Number), subtasks: { done: 1, total: 3 } })
  })

  const focusSession = (taskId: string, startedAt: string, minutes: number, open = false) =>
    db.insert(focusSessions).values({
      id: randomUUID(),
      userId,
      workspaceId: workspace.id,
      listId,
      taskId,
      kind: 'task',
      deviceId: 'device-a',
      startedAt: new Date(startedAt),
      endedAt: open ? null : new Date(new Date(startedAt).getTime() + minutes * 60_000),
      deadlineAt: open ? new Date(new Date(startedAt).getTime() + minutes * 60_000) : null,
      lastSeenAt: new Date(startedAt),
      endReason: open ? null : 'pause',
    })

  it('TASK-01 BOARD-07 a task with sessions of 10min and 17min shows 1620 spent seconds, pending and done', async () => {
    const pending = await task('today', { title: 'pending', estimate: 60 })
    const done = await task('done', { title: 'done', estimate: 60, completedAt: '2026-10-24T14:00:00Z' })
    for (const id of [pending, done]) {
      await focusSession(id, '2026-10-24T12:00:00Z', 10)
      await focusSession(id, '2026-10-24T13:00:00Z', 17)
    }

    const result = await board()
    expect(result.columns.today.tasks.map((card) => [card.title, card.spent_seconds])).toEqual([['pending', 1620]])
    expect(result.columns.done.days[0]?.tasks.map((card) => [card.title, card.spent_seconds])).toEqual([['done', 1620]])
  })

  it('AD-001 settles the reader before summing: a session past its deadline counts up to the deadline and is closed', async () => {
    const id = await task('today', { title: 'due', estimate: 17 })
    await focusSession(id, '2026-10-24T14:00:00Z', 17, true)

    const [card] = (await board()).columns.today.tasks
    expect(card?.spent_seconds).toBe(1020)
    const [session] = await db.select().from(focusSessions)
    expect(session).toMatchObject({ endedAt: new Date('2026-10-24T14:17:00Z'), endReason: 'estimate' })
  })

  it('BOARD-09 with completions today, yesterday and 3 days ago, shows only today and yesterday', async () => {
    await task('done', { title: 'today 1', completedAt: '2026-10-24T13:00:00Z' })
    await task('done', { title: 'today 2', completedAt: '2026-10-24T03:30:00Z' })
    // Friday 23:00 local, although Saturday in UTC.
    await task('done', { title: 'yesterday', completedAt: '2026-10-24T02:00:00Z' })
    await task('done', { title: '3 days ago', completedAt: '2026-10-21T12:00:00Z' })

    const { done } = (await board()).columns
    expect(done.today_count).toBe(2)
    expect(done.days.map((group) => [group.date, titles(group.tasks)])).toEqual([
      ['2026-10-24', ['today 1', 'today 2']],
      ['2026-10-23', ['yesterday']],
    ])
  })

  it('BOARD-09 without completions today, shows only the last earlier day with completions', async () => {
    await task('done', { title: '3 days ago', completedAt: '2026-10-21T12:00:00Z' })
    await task('done', { title: '5 days ago', completedAt: '2026-10-19T12:00:00Z' })

    const { done } = (await board()).columns
    expect(done.today_count).toBe(0)
    expect(done.days.map((group) => [group.date, titles(group.tasks)])).toEqual([['2026-10-21', ['3 days ago']]])
  })

  it('BOARD-16 the day changing keeps the pending tasks of Today in Today', async () => {
    await task('today', { title: 'still today', estimate: 30 })
    await task('done', { title: 'done saturday', completedAt: '2026-10-24T13:00:00Z' })

    const saturday = await board()
    expect(titles(saturday.columns.today.tasks)).toEqual(['still today'])
    expect(saturday.columns.today).toMatchObject({ done: 1, total: 2 })

    // Sunday 2026-10-25, 09:00 local.
    const sunday = await board(new Date('2026-10-25T12:00:00Z'))
    expect(titles(sunday.columns.today.tasks)).toEqual(['still today'])
    expect(sunday.columns.today).toMatchObject({ done: 0, total: 1 })
    expect(sunday.columns.done.days.map((group) => group.date)).toEqual(['2026-10-24'])
  })

  it('an empty list has sums of 0 and today_count 0', async () => {
    expect(await board()).toEqual({
      list: { id: listId, name: 'Week', color: 4 },
      timezone: TZ,
      pending: { count: 0, estimate_minutes: 0 },
      columns: {
        backlog: { tasks: [], estimate_minutes: 0 },
        this_week: { tasks: [], estimate_minutes: 0, done: 0, total: 0 },
        today: { tasks: [], estimate_minutes: 0, done: 0, total: 0 },
        done: { today_count: 0, days: [] },
      },
    })
  })

  it('answers 404 for a list of another workspace', async () => {
    const error = await buildBoard(db, listId, { id: randomUUID(), timezone: TZ }, userId, NOW).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 404, detail: 'List not found' })
  })
})
