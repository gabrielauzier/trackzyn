import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, dayPlanBlocks, dayPlans, tasks, users, workspaces } from '../../src/db/schema.ts'
import { createList, updateList } from '../../src/services/lists.ts'
import { getPlan, listCandidates, listPlanned } from '../../src/services/plans.ts'
import { migratedDb } from '../support/db.ts'

// Tuesday 2026-11-10, 22:30 in America/Sao_Paulo (UTC-3), already Wednesday 2026-11-11 in UTC: "today" is the
// workspace's day, so 2026-11-10 is still editable.
const NOW = new Date('2026-11-11T01:30:00Z')
const TZ = 'America/Sao_Paulo'
const TODAY = '2026-11-10'
const YESTERDAY = '2026-11-09'
const TOMORROW = '2026-11-11'
const EARLIER = new Date('2026-11-01T12:00:00Z')

let db: Database
let client: PGlite
let userId: string
let otherUserId: string
let workspaceId: string
let otherWorkspaceId: string
let listId: string
let breakListId: string

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  userId = randomUUID()
  otherUserId = randomUUID()
  await db.insert(users).values([
    { id: userId, email: 'a@b.c', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true },
    { id: otherUserId, email: 'o@b.c', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true },
  ])
  workspaceId = randomUUID()
  otherWorkspaceId = randomUUID()
  await db.insert(workspaces).values([
    { id: workspaceId, name: 'Mine', timezone: TZ, createdAt: EARLIER },
    { id: otherWorkspaceId, name: 'Other', timezone: TZ, createdAt: EARLIER },
  ])
  listId = (await createList(db, { workspaceId, userId, name: 'Work', color: 3 })).id
  breakListId = (await createList(db, { workspaceId, userId, name: 'Pausas', color: 5 })).id
})
afterEach(async () => {
  await client.close()
})

const actor = () => ({ userId, workspaceId })

async function task(
  column: TaskColumn,
  options: { list?: string; title?: string; estimate?: number; on?: string; time?: string; position?: number } = {},
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
    scheduleAppliedAt: column === 'today' ? EARLIER : null,
  })
  return id
}

type BlockSeed =
  | { kind: 'task'; taskId: string; start: string; minutes: number }
  | { kind: 'break'; name: string; listId: string; start: string; minutes: number }

async function plan(day: string, blocks: BlockSeed[], owner: { userId: string; workspaceId: string } = actor(), version = 1) {
  const planId = randomUUID()
  await db.insert(dayPlans).values({ id: planId, userId: owner.userId, workspaceId: owner.workspaceId, day, version, updatedAt: EARLIER })
  for (const block of blocks) {
    await db.insert(dayPlanBlocks).values({
      id: randomUUID(),
      planId,
      kind: block.kind,
      taskId: block.kind === 'task' ? block.taskId : null,
      name: block.kind === 'break' ? block.name : null,
      listId: block.kind === 'break' ? block.listId : null,
      startTime: block.start,
      minutes: block.minutes,
    })
  }
  return planId
}

describe('getPlan: the plan of one day (PLAN-11, PLAN-12, PLAN-34)', () => {
  it('answers an empty plan with version 0 and the default workday 09:00 to 18:00 when nothing is saved', async () => {
    expect(await getPlan(db, actor(), TOMORROW, NOW)).toEqual({
      day: TOMORROW,
      version: 0,
      editable: true,
      workday: { start: '09:00', end: '18:00' },
      blocks: [],
    })
  })

  it('answers the workday of the user preferences (PLAN-22)', async () => {
    await db.update(users).set({ preferences: { theme: 'dark', workday: { start: '08:30', end: '17:15' } } }).where(eq(users.id, userId))
    expect((await getPlan(db, actor(), TOMORROW, NOW)).workday).toEqual({ start: '08:30', end: '17:15' })
  })

  it('answers the saved blocks in order of start, with the task, its list and the break (PLAN-11)', async () => {
    const review = await task('backlog', { title: 'Review', estimate: 90, on: '2026-11-20' })
    await plan(
      TOMORROW,
      [
        { kind: 'break', name: 'Almoço', listId: breakListId, start: '12:00', minutes: 60 },
        { kind: 'task', taskId: review, start: '09:15', minutes: 120 },
      ],
      actor(),
      3,
    )
    const read = await getPlan(db, actor(), TOMORROW, NOW)
    expect(read.version).toBe(3)
    expect(read.blocks).toEqual([
      {
        id: expect.any(String),
        kind: 'task',
        start: '09:15',
        minutes: 120,
        task: {
          id: review,
          title: 'Review',
          list: { id: listId, name: 'Work', color: 3 },
          done: false,
          scheduled_on: '2026-11-20',
          estimate_minutes: 90,
        },
      },
      { id: expect.any(String), kind: 'break', start: '12:00', minutes: 60, name: 'Almoço', list: { id: breakListId, name: 'Pausas', color: 5 }, started_at: null },
    ])
  })

  it('answers only the plan of the user in the workspace (PLAN-12)', async () => {
    const shared = await task('today')
    await plan(TOMORROW, [{ kind: 'task', taskId: shared, start: '10:00', minutes: 60 }], { userId: otherUserId, workspaceId })
    await plan(TOMORROW, [{ kind: 'break', name: 'Café', listId: breakListId, start: '10:00', minutes: 15 }], {
      userId,
      workspaceId: otherWorkspaceId,
    })
    expect(await getPlan(db, actor(), TOMORROW, NOW)).toMatchObject({ version: 0, blocks: [] })
  })

  it('answers only the plan of the day asked', async () => {
    const shared = await task('today')
    await plan(TODAY, [{ kind: 'task', taskId: shared, start: '10:00', minutes: 60 }])
    expect(await getPlan(db, actor(), TOMORROW, NOW)).toMatchObject({ version: 0, blocks: [] })
  })

  it('is editable today and tomorrow in the workspace timezone, and read-only yesterday (PLAN-34)', async () => {
    expect((await getPlan(db, actor(), YESTERDAY, NOW)).editable).toBe(false)
    expect((await getPlan(db, actor(), TODAY, NOW)).editable).toBe(true)
    expect((await getPlan(db, actor(), TOMORROW, NOW)).editable).toBe(true)
  })

  it('answers a done task as done (PLAN-39)', async () => {
    const finished = await task('done')
    await plan(TOMORROW, [{ kind: 'task', taskId: finished, start: '10:00', minutes: 60 }])
    const [block] = (await getPlan(db, actor(), TOMORROW, NOW)).blocks
    expect(block).toMatchObject({ kind: 'task', task: { id: finished, done: true } })
  })

  it('leaves out the task blocks and the breaks of an archived list (PLAN-40)', async () => {
    const archived = (await createList(db, { workspaceId, userId, name: 'Old', color: 1 })).id
    const gone = await task('backlog', { list: archived })
    const kept = await task('backlog')
    await plan(TOMORROW, [
      { kind: 'task', taskId: gone, start: '09:00', minutes: 60 },
      { kind: 'break', name: 'Café', listId: archived, start: '10:00', minutes: 15 },
      { kind: 'task', taskId: kept, start: '11:00', minutes: 60 },
    ])
    await updateList(db, archived, workspaceId, { isArchived: true }, NOW)
    const read = await getPlan(db, actor(), TOMORROW, NOW)
    expect(read.blocks.map((block) => (block.kind === 'task' ? block.task.id : block.name))).toEqual([kept])
  })
})

describe('listCandidates: the pending tasks to plan (PLAN-02, PLAN-40)', () => {
  it('answers the pending tasks of the active lists with column, estimate and scheduled day, those of the day first', async () => {
    const backlog = await task('backlog', { title: 'Backlog', estimate: 30, position: 0 })
    const week = await task('this_week', { title: 'Week', position: 0 })
    const today = await task('today', { title: 'Today', position: 0 })
    const ofTheDay = await task('backlog', { title: 'Of the day', on: TOMORROW, time: '14:30', position: 1 })
    await task('done', { title: 'Done' })
    const archived = (await createList(db, { workspaceId, userId, name: 'Old', color: 1 })).id
    await task('today', { list: archived, title: 'Archived' })
    await updateList(db, archived, workspaceId, { isArchived: true }, NOW)
    const otherList = (await createList(db, { workspaceId: otherWorkspaceId, userId, name: 'Theirs', color: 2 })).id
    await task('today', { list: otherList, title: 'Other workspace' })

    const found = await listCandidates(db, actor(), TOMORROW, NOW)
    expect(found.map((candidate) => candidate.id)).toEqual([ofTheDay, today, week, backlog])
    expect(found[0]).toEqual({
      id: ofTheDay,
      title: 'Of the day',
      list: { id: listId, name: 'Work', color: 3 },
      column: 'backlog',
      position: 1,
      estimate_minutes: null,
      scheduled_on: TOMORROW,
      scheduled_time: '14:30',
    })
    expect(found[3]).toMatchObject({ id: backlog, column: 'backlog', estimate_minutes: 30, scheduled_on: null, scheduled_time: null })
  })

  it('answers at most 500 tasks', async () => {
    await db.insert(tasks).values(
      Array.from({ length: 501 }, (_, position) => ({
        id: randomUUID(),
        listId,
        title: `Task ${position}`,
        column: 'backlog' as const,
        position,
        createdAt: EARLIER,
      })),
    )
    expect(await listCandidates(db, actor(), TOMORROW, NOW)).toHaveLength(500)
  })
})

describe('listPlanned: the saved blocks of a period, for the Agenda (PLAN-24, PLAN-12)', () => {
  it('answers the blocks of the user in the workspace, in order of day and start, each with its day', async () => {
    const review = await task('today', { title: 'Review' })
    await plan(TOMORROW, [
      { kind: 'task', taskId: review, start: '14:00', minutes: 60 },
      { kind: 'break', name: 'Café', listId: breakListId, start: '10:00', minutes: 15 },
    ])
    await plan(TODAY, [{ kind: 'task', taskId: review, start: '16:45', minutes: 30 }])
    await plan('2026-11-12', [{ kind: 'break', name: 'Almoço', listId: breakListId, start: '12:00', minutes: 60 }])

    const found = await listPlanned(db, actor(), TODAY, TOMORROW)
    expect(found.map((block) => [block.day, block.start, block.kind])).toEqual([
      [TODAY, '16:45', 'task'],
      [TOMORROW, '10:00', 'break'],
      [TOMORROW, '14:00', 'task'],
    ])
    expect(found[1]).toEqual({
      id: expect.any(String),
      day: TOMORROW,
      kind: 'break',
      start: '10:00',
      minutes: 15,
      name: 'Café',
      list: { id: breakListId, name: 'Pausas', color: 5 },
      started_at: null,
    })
    expect(found[2]).toMatchObject({ day: TOMORROW, kind: 'task', minutes: 60, task: { id: review, title: 'Review', done: false } })
  })

  it('leaves out the plans of other users and other workspaces (PLAN-12)', async () => {
    const shared = await task('today')
    await plan(TOMORROW, [{ kind: 'task', taskId: shared, start: '10:00', minutes: 60 }], { userId: otherUserId, workspaceId })
    await plan(TOMORROW, [{ kind: 'break', name: 'Café', listId: breakListId, start: '10:00', minutes: 15 }], {
      userId,
      workspaceId: otherWorkspaceId,
    })
    expect(await listPlanned(db, actor(), TODAY, TOMORROW)).toEqual([])
  })

  it('leaves out the blocks of an archived list (PLAN-40)', async () => {
    const archived = (await createList(db, { workspaceId, userId, name: 'Old', color: 1 })).id
    const gone = await task('backlog', { list: archived })
    const kept = await task('backlog')
    await plan(TOMORROW, [
      { kind: 'task', taskId: gone, start: '09:00', minutes: 60 },
      { kind: 'break', name: 'Café', listId: archived, start: '10:00', minutes: 15 },
      { kind: 'task', taskId: kept, start: '11:00', minutes: 60 },
    ])
    await updateList(db, archived, workspaceId, { isArchived: true }, NOW)
    expect((await listPlanned(db, actor(), TOMORROW, TOMORROW)).map((block) => block.start)).toEqual(['11:00'])
  })
})
