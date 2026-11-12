import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import {
  type TaskColumn,
  dayPlanBlocks,
  dayPlans,
  focusSessions,
  lists,
  subtasks,
  taskSeries,
  tasks,
  users,
  workspaces,
} from '../../src/db/schema.ts'
import { overview } from '../../src/services/reports.ts'
import { readToday } from '../../src/services/today.ts'
import { migratedDb } from '../support/db.ts'

// Wednesday 2026-11-11, 14:20 in America/Sao_Paulo (UTC-3, no daylight saving time in 2026).
const TZ = 'America/Sao_Paulo'
const SP = (local: string) => new Date(`${local}-03:00`)
const NOW = SP('2026-11-11T14:20:00')
const TODAY = '2026-11-11'
const EARLIER = new Date('2026-11-01T12:00:00Z')

let db: Database
let client: PGlite
let userId: string
let otherUserId: string
let workspaceId: string
let otherWorkspaceId: string
let listId: string
let otherWorkspaceListId: string

const member = async (id: string, email: string) =>
  db.insert(users).values({
    id,
    email,
    hashedPassword: 'x',
    isActive: true,
    isSuperuser: false,
    isVerified: true,
  })

async function list(workspace: string, name: string, color: number, position = 0, archived = false): Promise<string> {
  const id = randomUUID()
  await db.insert(lists).values({
    id,
    workspaceId: workspace,
    name,
    color,
    position,
    isArchived: archived,
    createdByUserId: userId,
    createdAt: EARLIER,
  })
  return id
}

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  userId = randomUUID()
  otherUserId = randomUUID()
  await member(userId, 'a@b.c')
  await member(otherUserId, 'o@b.c')
  workspaceId = randomUUID()
  otherWorkspaceId = randomUUID()
  await db.insert(workspaces).values([
    { id: workspaceId, name: 'Mine', timezone: TZ, createdAt: EARLIER },
    { id: otherWorkspaceId, name: 'Other', timezone: TZ, createdAt: EARLIER },
  ])
  listId = await list(workspaceId, 'Frete', 3)
  otherWorkspaceListId = await list(otherWorkspaceId, 'Theirs', 2)
})
afterEach(async () => {
  await client.close()
})

const actor = () => ({ userId, workspace: { id: workspaceId, timezone: TZ } })

async function task(
  column: TaskColumn,
  options: {
    list?: string
    title?: string
    estimate?: number
    on?: string
    time?: string
    position?: number
    applied?: boolean
  } = {},
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
    scheduleAppliedAt: options.applied === false ? null : column === 'today' ? EARLIER : null,
  })
  return id
}

async function session(values: {
  taskId?: string | null
  startedAt: Date
  endedAt: Date | null
  user?: string
  workspace?: string
  list?: string
  deadlineAt?: Date | null
}): Promise<string> {
  const id = randomUUID()
  const kind = values.taskId ? 'task' : 'break'
  await db.insert(focusSessions).values({
    id,
    userId: values.user ?? userId,
    workspaceId: values.workspace ?? workspaceId,
    listId: values.list ?? listId,
    taskId: values.taskId ?? null,
    kind,
    deviceId: 'device-a',
    startedAt: values.startedAt,
    endedAt: values.endedAt,
    deadlineAt: values.deadlineAt ?? null,
    plannedSeconds: kind === 'break' ? 600 : null,
    lastSeenAt: values.startedAt,
    endReason: values.endedAt ? 'pause' : null,
  })
  return id
}

type BlockSeed =
  | { kind: 'task'; taskId: string; start: string; minutes: number }
  | {
      kind: 'break'
      name: string
      start: string
      minutes: number
      startedAt?: Date
    }

async function plan(day: string, blocks: BlockSeed[], owner = { userId: '', workspaceId: '' }) {
  const planId = randomUUID()
  await db.insert(dayPlans).values({
    id: planId,
    userId: owner.userId || userId,
    workspaceId: owner.workspaceId || workspaceId,
    day,
    version: 1,
    updatedAt: EARLIER,
  })
  for (const block of blocks) {
    await db.insert(dayPlanBlocks).values({
      id: randomUUID(),
      planId,
      kind: block.kind,
      taskId: block.kind === 'task' ? block.taskId : null,
      name: block.kind === 'break' ? block.name : null,
      listId: block.kind === 'break' ? listId : null,
      startTime: block.start,
      minutes: block.minutes,
      startedAt: block.kind === 'break' ? (block.startedAt ?? null) : null,
    })
  }
}

describe('readToday: the clock and the workday (HOJE-03, HOJE-69)', () => {
  it('answers today, tomorrow, the timezone, the minute of now and the default workday', async () => {
    const read = await readToday(db, actor(), NOW)
    expect(read.server_now).toBe(NOW.toISOString())
    expect(read.day).toBe(TODAY)
    expect(read.tomorrow).toBe('2026-11-12')
    expect(read.timezone).toBe(TZ)
    expect(read.now_minute).toBe(14 * 60 + 20)
    expect(read.workday).toEqual({ start: '09:00', end: '18:00' })
  })

  it("answers the user's own workday", async () => {
    await db
      .update(users)
      .set({ preferences: { workday: { start: '08:30', end: '19:00' } } })
      .where(eq(users.id, userId))
    expect((await readToday(db, actor(), NOW)).workday).toEqual({
      start: '08:30',
      end: '19:00',
    })
  })

  it('HOJE-69 a new workspace timezone changes the day and the minute on the next read', async () => {
    // 22:30 in São Paulo is already 10:30 of the next day in Tokyo (UTC+9).
    const late = SP('2026-11-11T22:30:00')
    expect(await readToday(db, actor(), late)).toMatchObject({
      day: TODAY,
      now_minute: 22 * 60 + 30,
    })
    await db.update(workspaces).set({ timezone: 'Asia/Tokyo' }).where(eq(workspaces.id, workspaceId))
    expect(await readToday(db, actor(), late)).toMatchObject({
      day: '2026-11-12',
      tomorrow: '2026-11-13',
      timezone: 'Asia/Tokyo',
      now_minute: 10 * 60 + 30,
    })
  })
})

describe('readToday: Pendente (HOJE-23, HOJE-25, HOJE-28, HOJE-06)', () => {
  it('answers the pending tasks of Today of the active lists, with the list, estimate, position and subtasks', async () => {
    const id = await task('today', {
      title: 'Escrever',
      estimate: 90,
      position: 2,
    })
    await db.insert(subtasks).values([
      { id: randomUUID(), taskId: id, title: 'a', done: true, position: 0 },
      { id: randomUUID(), taskId: id, title: 'b', done: false, position: 1 },
    ])
    expect((await readToday(db, actor(), NOW)).pending).toEqual([
      {
        id,
        title: 'Escrever',
        list: { id: listId, name: 'Frete', color: 3 },
        estimate_minutes: 90,
        position: 2,
        scheduled_on: null,
        scheduled_minute: null,
        plan_minute: null,
        has_session_today: false,
        days_late: null,
        subtasks: { done: 1, total: 2 },
      },
    ])
  })

  it('leaves out the tasks of the other columns and the done ones', async () => {
    const kept = await task('today')
    await task('this_week')
    await task('backlog')
    await task('done')
    expect((await readToday(db, actor(), NOW)).pending.map((item) => item.id)).toEqual([kept])
  })

  it('leaves out a Today task of an archived list (L-048)', async () => {
    const kept = await task('today')
    await task('today', { list: await list(workspaceId, 'Old', 4, 1, true) })
    expect((await readToday(db, actor(), NOW)).pending.map((item) => item.id)).toEqual([kept])
  })

  it('leaves out a Today task of another workspace (L-048)', async () => {
    const kept = await task('today')
    await task('today', { list: otherWorkspaceListId })
    expect((await readToday(db, actor(), NOW)).pending.map((item) => item.id)).toEqual([kept])
  })

  it("leaves out the task of the reader's open session, and keeps another Today task (L-048)", async () => {
    const focused = await task('today', { position: 0 })
    const other = await task('today', { position: 1 })
    await session({
      taskId: focused,
      startedAt: SP('2026-11-11T14:00:00'),
      endedAt: null,
    })
    expect((await readToday(db, actor(), NOW)).pending.map((item) => item.id)).toEqual([other])
  })

  it("keeps a task another member has open, as only the reader's session leaves it out", async () => {
    const theirs = await task('today')
    await session({
      taskId: theirs,
      startedAt: SP('2026-11-11T14:00:00'),
      endedAt: null,
      user: otherUserId,
    })
    expect((await readToday(db, actor(), NOW)).pending.map((item) => item.id)).toEqual([theirs])
  })

  it('answers scheduled_minute only for a task scheduled today, and days_late as today minus the scheduled day', async () => {
    const today = await task('today', {
      on: TODAY,
      time: '13:00',
      position: 0,
    })
    const earlier = await task('today', {
      on: '2026-11-08',
      time: '09:00',
      position: 1,
    })
    const read = await readToday(db, actor(), NOW)
    expect(read.pending.find((item) => item.id === today)).toMatchObject({
      scheduled_on: TODAY,
      scheduled_minute: 780,
      days_late: null,
    })
    expect(read.pending.find((item) => item.id === earlier)).toMatchObject({
      scheduled_on: '2026-11-08',
      scheduled_minute: null,
      days_late: 3,
    })
  })

  it("answers plan_minute as the start of the task's first block in today's plan", async () => {
    const id = await task('today')
    await plan(TODAY, [
      { kind: 'task', taskId: id, start: '16:00', minutes: 30 },
      { kind: 'task', taskId: id, start: '13:30', minutes: 90 },
    ])
    expect((await readToday(db, actor(), NOW)).pending[0]!.plan_minute).toBe(13 * 60 + 30)
  })

  it("answers has_session_today for the reader's task session of today only", async () => {
    const worked = await task('today', { position: 0 })
    const yesterday = await task('today', { position: 1 })
    const theirs = await task('today', { position: 2 })
    await session({
      taskId: worked,
      startedAt: SP('2026-11-11T10:00:00'),
      endedAt: SP('2026-11-11T10:30:00'),
    })
    await session({
      taskId: yesterday,
      startedAt: SP('2026-11-10T10:00:00'),
      endedAt: SP('2026-11-10T10:30:00'),
    })
    await session({
      taskId: theirs,
      startedAt: SP('2026-11-11T10:00:00'),
      endedAt: SP('2026-11-11T10:30:00'),
      user: otherUserId,
    })
    const flags = Object.fromEntries((await readToday(db, actor(), NOW)).pending.map((item) => [item.id, item.has_session_today]))
    expect(flags).toEqual({
      [worked]: true,
      [yesterday]: false,
      [theirs]: false,
    })
  })

  it('AD-009 a task scheduled for today still in This week comes to Today and to Pendente on the read', async () => {
    const id = await task('this_week', {
      on: TODAY,
      time: '16:00',
      applied: false,
    })
    const read = await readToday(db, actor(), NOW)
    expect(read.pending.map((item) => item.id)).toEqual([id])
    expect(read.pending[0]!.scheduled_minute).toBe(16 * 60)
    const [row] = await db.select({ column: tasks.column }).from(tasks).where(eq(tasks.id, id))
    expect(row!.column).toBe('today')
  })
})

describe('readToday: the plan of today', () => {
  it('answers saved false and no blocks without a saved plan', async () => {
    expect((await readToday(db, actor(), NOW)).plan).toEqual({
      saved: false,
      blocks: [],
    })
  })

  it("answers today's blocks in order of start, a done task's block included, and not another member's plan", async () => {
    const pending = await task('today', { title: 'Escrever' })
    const finished = await task('done', { title: 'Revisar' })
    await plan(TODAY, [
      { kind: 'task', taskId: pending, start: '13:30', minutes: 90 },
      { kind: 'task', taskId: finished, start: '09:00', minutes: 60 },
      {
        kind: 'break',
        name: 'Almoço',
        start: '12:00',
        minutes: 60,
        startedAt: SP('2026-11-11T12:05:00'),
      },
    ])
    await plan(TODAY, [{ kind: 'task', taskId: pending, start: '08:00', minutes: 30 }], { userId: otherUserId, workspaceId })
    expect((await readToday(db, actor(), NOW)).plan).toEqual({
      saved: true,
      blocks: [
        {
          id: expect.any(String),
          kind: 'task',
          task_id: finished,
          title: 'Revisar',
          list_color: 3,
          start_minute: 540,
          minutes: 60,
          done: true,
        },
        {
          id: expect.any(String),
          kind: 'break',
          task_id: null,
          title: 'Almoço',
          list_color: 3,
          start_minute: 720,
          minutes: 60,
          done: true,
        },
        {
          id: expect.any(String),
          kind: 'task',
          task_id: pending,
          title: 'Escrever',
          list_color: 3,
          start_minute: 810,
          minutes: 90,
          done: false,
        },
      ],
    })
  })
})

describe('readToday: the sessions of today (HOJE-06, HOJE-68)', () => {
  it("answers the reader's sessions of today in order, with minutes of the day, and the open one until now", async () => {
    const write = await task('today', { title: 'Escrever' })
    const closed = await session({
      taskId: write,
      startedAt: SP('2026-11-11T09:00:00'),
      endedAt: SP('2026-11-11T10:30:00'),
    })
    const lunch = await session({
      startedAt: SP('2026-11-11T12:05:00'),
      endedAt: SP('2026-11-11T13:20:00'),
    })
    await plan(TODAY, [
      {
        kind: 'break',
        name: 'Almoço',
        start: '12:00',
        minutes: 60,
        startedAt: SP('2026-11-11T12:05:00'),
      },
    ])
    const open = await session({
      taskId: write,
      startedAt: SP('2026-11-11T13:48:00'),
      endedAt: null,
    })
    expect((await readToday(db, actor(), NOW)).sessions).toEqual([
      {
        id: closed,
        kind: 'task',
        task_id: write,
        title: 'Escrever',
        list_id: listId,
        list_color: 3,
        start_minute: 540,
        end_minute: 630,
        open: false,
      },
      {
        id: lunch,
        kind: 'break',
        task_id: null,
        title: 'Almoço',
        list_id: listId,
        list_color: 3,
        start_minute: 725,
        end_minute: 800,
        open: false,
      },
      {
        id: open,
        kind: 'task',
        task_id: write,
        title: 'Escrever',
        list_id: listId,
        list_color: 3,
        start_minute: 828,
        end_minute: 860,
        open: true,
      },
    ])
  })

  it('answers a break without a planned break with a null title', async () => {
    await session({
      startedAt: SP('2026-11-11T11:00:00'),
      endedAt: SP('2026-11-11T11:10:00'),
    })
    expect((await readToday(db, actor(), NOW)).sessions[0]!.title).toBeNull()
  })

  it("leaves out another member's session of the same day (L-048)", async () => {
    const id = await task('today')
    const mine = await session({
      taskId: id,
      startedAt: SP('2026-11-11T09:00:00'),
      endedAt: SP('2026-11-11T10:00:00'),
    })
    await session({
      taskId: id,
      startedAt: SP('2026-11-11T10:00:00'),
      endedAt: SP('2026-11-11T11:00:00'),
      user: otherUserId,
    })
    expect((await readToday(db, actor(), NOW)).sessions.map((item) => item.id)).toEqual([mine])
  })

  it("leaves out the reader's session in another workspace and the one of yesterday", async () => {
    const id = await task('today')
    const mine = await session({
      taskId: id,
      startedAt: SP('2026-11-11T09:00:00'),
      endedAt: SP('2026-11-11T10:00:00'),
    })
    const theirs = await task('today', { list: otherWorkspaceListId })
    await session({
      taskId: theirs,
      startedAt: SP('2026-11-11T10:00:00'),
      endedAt: SP('2026-11-11T11:00:00'),
      workspace: otherWorkspaceId,
      list: otherWorkspaceListId,
    })
    await session({
      taskId: id,
      startedAt: SP('2026-11-10T09:00:00'),
      endedAt: SP('2026-11-10T10:00:00'),
    })
    expect((await readToday(db, actor(), NOW)).sessions.map((item) => item.id)).toEqual([mine])
  })

  it('HOJE-68 a session from 23:30 to 00:30 counts as 00:00 to 00:30 today', async () => {
    const id = await task('today')
    const crossing = await session({
      taskId: id,
      startedAt: SP('2026-11-10T23:30:00'),
      endedAt: SP('2026-11-11T00:30:00'),
    })
    expect((await readToday(db, actor(), NOW)).sessions).toEqual([
      expect.objectContaining({
        id: crossing,
        start_minute: 0,
        end_minute: 30,
      }),
    ])
  })

  it('settles a session past its deadline first, so it ends at the deadline (AD-001)', async () => {
    const id = await task('today', { estimate: 30 })
    await session({
      taskId: id,
      startedAt: SP('2026-11-11T13:00:00'),
      endedAt: null,
      deadlineAt: SP('2026-11-11T13:30:00'),
    })
    const read = await readToday(db, actor(), NOW)
    expect(read.sessions).toEqual([
      expect.objectContaining({
        start_minute: 780,
        end_minute: 810,
        open: false,
      }),
    ])
    expect(read.pending.map((item) => item.id)).toEqual([id])
  })

  it('the task time of the sessions adds up to the task time of the reports for today (HOJE-49)', async () => {
    const a = await task('today', { position: 0 })
    const b = await task('today', { position: 1 })
    await session({
      taskId: a,
      startedAt: SP('2026-11-10T23:30:00'),
      endedAt: SP('2026-11-11T00:30:00'),
    })
    await session({
      taskId: b,
      startedAt: SP('2026-11-11T09:00:00'),
      endedAt: SP('2026-11-11T10:15:00'),
    })
    await session({
      startedAt: SP('2026-11-11T10:15:00'),
      endedAt: SP('2026-11-11T10:25:00'),
    })
    await session({
      taskId: a,
      startedAt: SP('2026-11-11T13:48:00'),
      endedAt: null,
    })
    const read = await readToday(db, actor(), NOW)
    const report = await overview(db, userId, { id: workspaceId, timezone: TZ }, { from: TODAY, to: TODAY, listId: null }, NOW)
    const taskSeconds = read.sessions
      .filter((item) => item.kind === 'task')
      .reduce((sum, item) => sum + (item.end_minute - item.start_minute) * 60, 0)
    expect(taskSeconds).toBe(30 * 60 + 75 * 60 + 32 * 60)
    expect(taskSeconds).toBe(report.tiles.task_seconds)
  })
})

/** A task completed at `completedAt` by `by` (the reader by default), as `moveTask` records it (AD-006). */
async function completed(completedAt: Date, options: { by?: string; title?: string; estimate?: number; list?: string } = {}) {
  const id = await task('done', { title: options.title, estimate: options.estimate, list: options.list })
  await db
    .update(tasks)
    .set({ completedAt, completedByUserId: options.by ?? userId })
    .where(eq(tasks.id, id))
  return id
}

describe('readToday: Feito hoje (HOJE-35, HOJE-36, HOJE-38, HOJE-40)', () => {
  it('answers a task the reader completed today with its list, estimate, completion, time, badge and series flag', async () => {
    const id = await completed(SP('2026-11-11T11:00:00'), { title: 'Escrever', estimate: 30 })
    await session({ taskId: id, startedAt: SP('2026-11-11T10:00:00'), endedAt: SP('2026-11-11T10:25:00') })
    expect((await readToday(db, actor(), NOW)).done).toEqual([
      {
        id,
        title: 'Escrever',
        list: { id: listId, name: 'Frete', color: 3 },
        estimate_minutes: 30,
        completed_at: SP('2026-11-11T11:00:00').toISOString(),
        spent_seconds: 25 * 60,
        verdict: 'early',
        diff_seconds: -300,
        series: false,
      },
    ])
  })

  it('HOJE-40 leaves out a task completed today by another member', async () => {
    const mine = await completed(SP('2026-11-11T11:00:00'))
    await completed(SP('2026-11-11T12:00:00'), { by: otherUserId })
    expect((await readToday(db, actor(), NOW)).done.map((item) => item.id)).toEqual([mine])
  })

  it('HOJE-40 leaves out a task the reader completed yesterday', async () => {
    const mine = await completed(SP('2026-11-11T00:10:00'))
    await completed(SP('2026-11-10T23:50:00'))
    expect((await readToday(db, actor(), NOW)).done.map((item) => item.id)).toEqual([mine])
  })

  it("leaves out the reader's completion of today in another workspace", async () => {
    const mine = await completed(SP('2026-11-11T11:00:00'))
    await completed(SP('2026-11-11T12:00:00'), { list: otherWorkspaceListId })
    expect((await readToday(db, actor(), NOW)).done.map((item) => item.id)).toEqual([mine])
  })

  it('answers the most recent completion first', async () => {
    const first = await completed(SP('2026-11-11T09:00:00'))
    const last = await completed(SP('2026-11-11T13:00:00'))
    const middle = await completed(SP('2026-11-11T11:00:00'))
    expect((await readToday(db, actor(), NOW)).done.map((item) => item.id)).toEqual([last, middle, first])
  })

  it("counts the time of every member in spent_seconds, as the reports' badge does", async () => {
    const id = await completed(SP('2026-11-11T11:00:00'), { estimate: 60 })
    await session({ taskId: id, startedAt: SP('2026-11-11T09:00:00'), endedAt: SP('2026-11-11T09:30:00') })
    await session({ taskId: id, startedAt: SP('2026-11-10T09:00:00'), endedAt: SP('2026-11-10T09:30:00'), user: otherUserId })
    expect((await readToday(db, actor(), NOW)).done[0]).toMatchObject({ spent_seconds: 3600, verdict: 'on_time', diff_seconds: 0 })
  })

  it('HOJE-38 answers a null verdict and diff 0 without an estimate', async () => {
    const id = await completed(SP('2026-11-11T11:00:00'))
    await session({ taskId: id, startedAt: SP('2026-11-11T10:00:00'), endedAt: SP('2026-11-11T10:40:00') })
    expect((await readToday(db, actor(), NOW)).done[0]).toMatchObject({
      estimate_minutes: null,
      spent_seconds: 2400,
      verdict: null,
      diff_seconds: 0,
    })
  })

  it('answers a late badge past 5% of the estimate', async () => {
    const id = await completed(SP('2026-11-11T11:00:00'), { estimate: 30 })
    await session({ taskId: id, startedAt: SP('2026-11-11T10:00:00'), endedAt: SP('2026-11-11T10:40:00') })
    expect((await readToday(db, actor(), NOW)).done[0]).toMatchObject({ verdict: 'late', diff_seconds: 600 })
  })

  it('answers series true for an occurrence of a series', async () => {
    const id = await completed(SP('2026-11-11T11:00:00'))
    const seriesId = randomUUID()
    await db.insert(taskSeries).values({ id: seriesId, workspaceId, freq: 'daily', createdAt: EARLIER })
    await db.update(tasks).set({ seriesId }).where(eq(tasks.id, id))
    expect((await readToday(db, actor(), NOW)).done[0]!.series).toBe(true)
  })

  it('answers nothing without completions today', async () => {
    expect((await readToday(db, actor(), NOW)).done).toEqual([])
  })
})
