import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq, inArray } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, dayPlanBlocks, dayPlans, tasks, users, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { createList } from '../../src/services/lists.ts'
import { type BlockInput, getPlan, savePlan } from '../../src/services/plans.ts'
import { migratedDb } from '../support/db.ts'

// Wednesday 2026-11-11, 14:07 in America/Sao_Paulo (UTC-3). The week runs from Monday 2026-11-09 to Sunday 2026-11-15.
const NOW = new Date('2026-11-11T17:07:00Z')
const TZ = 'America/Sao_Paulo'
const TODAY = '2026-11-11'
const TOMORROW = '2026-11-12'
const YESTERDAY = '2026-11-10'
const NEXT_WEEK = '2026-11-18'
const EARLIER = new Date('2026-11-01T12:00:00Z')

let db: Database
let client: PGlite
let userId: string
let otherUserId: string
let workspaceId: string
let otherWorkspaceId: string
let listId: string
let otherListId: string

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
  otherListId = (await createList(db, { workspaceId: otherWorkspaceId, userId, name: 'Theirs', color: 2 })).id
})
afterEach(async () => {
  await client.close()
})

const actor = () => ({ userId, workspaceId })

async function task(column: TaskColumn, options: { list?: string; estimate?: number; on?: string; time?: string } = {}): Promise<string> {
  const id = randomUUID()
  await db.insert(tasks).values({
    id,
    listId: options.list ?? listId,
    title: 'Review',
    column,
    position: 0,
    estimateMinutes: options.estimate ?? null,
    completedAt: column === 'done' ? EARLIER : null,
    createdAt: EARLIER,
    scheduledOn: options.on ?? null,
    scheduledTime: options.time ?? null,
    scheduleAppliedAt: column === 'today' ? EARLIER : null,
  })
  return id
}

const readTask = async (id: string) => {
  const [row] = await db
    .select({ column: tasks.column, scheduledOn: tasks.scheduledOn, scheduledTime: tasks.scheduledTime, estimateMinutes: tasks.estimateMinutes })
    .from(tasks)
    .where(eq(tasks.id, id))
  return row!
}

const shape = (blocks: Awaited<ReturnType<typeof getPlan>>['blocks']) => blocks.map(({ id: _id, ...block }) => block)

async function failure(promise: Promise<unknown>): Promise<HttpError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(HttpError)
  return error as HttpError
}

describe('savePlan: replaces the plan of the day (PLAN-08, PLAN-35)', () => {
  it('saves the blocks of a new plan with version 1 and answers the saved plan', async () => {
    const review = await task('today', { estimate: 45 })
    const blocks: BlockInput[] = [
      { kind: 'task', taskId: review, start: '09:00', minutes: 45 },
      { kind: 'break', name: 'Almoço', listId, start: '12:00', minutes: 60 },
    ]
    const saved = await savePlan(db, actor(), TOMORROW, { baseVersion: 0, blocks }, NOW)
    expect(saved.version).toBe(1)
    expect(shape(saved.blocks)).toEqual([
      { kind: 'task', start: '09:00', minutes: 45, task: expect.objectContaining({ id: review }) },
      { kind: 'break', start: '12:00', minutes: 60, name: 'Almoço', list: { id: listId, name: 'Work', color: 3 }, started_at: null },
    ])
    expect(await getPlan(db, actor(), TOMORROW, NOW)).toEqual(saved)
  })

  it('replaces the whole day, and sending the same body with the new version gives the same plan', async () => {
    const first = await task('today')
    const second = await task('today')
    await savePlan(db, actor(), TOMORROW, { baseVersion: 0, blocks: [{ kind: 'task', taskId: first, start: '09:00', minutes: 60 }] }, NOW)
    const body: BlockInput[] = [
      { kind: 'task', taskId: second, start: '10:30', minutes: 30 },
      { kind: 'task', taskId: second, start: '15:07', minutes: 90 },
    ]
    const replaced = await savePlan(db, actor(), TOMORROW, { baseVersion: 1, blocks: body }, NOW)
    expect(replaced.version).toBe(2)
    expect(shape(replaced.blocks).map((block) => [block.start, block.minutes])).toEqual([
      ['10:30', 30],
      ['15:07', 90],
    ])
    const again = await savePlan(db, actor(), TOMORROW, { baseVersion: 2, blocks: body }, NOW)
    expect(again.version).toBe(3)
    expect(shape(again.blocks)).toEqual(shape(replaced.blocks))
    expect(await db.select().from(dayPlans)).toHaveLength(1)
    expect(await db.select().from(dayPlanBlocks)).toHaveLength(2)
  })

  it('answers 409 plan_changed for another version and writes nothing (PLAN-35)', async () => {
    const first = await task('today')
    const second = await task('backlog')
    await savePlan(db, actor(), TOMORROW, { baseVersion: 0, blocks: [{ kind: 'task', taskId: first, start: '09:00', minutes: 60 }] }, NOW)

    for (const baseVersion of [0, 2]) {
      const error = await failure(
        savePlan(db, actor(), TOMORROW, { baseVersion, blocks: [{ kind: 'task', taskId: second, start: '11:00', minutes: 60 }] }, NOW),
      )
      expect(error.statusCode).toBe(409)
      expect(error.extra).toEqual({ code: 'plan_changed' })
    }
    const read = await getPlan(db, actor(), TOMORROW, NOW)
    expect(read.version).toBe(1)
    expect(shape(read.blocks)).toEqual([{ kind: 'task', start: '09:00', minutes: 60, task: expect.objectContaining({ id: first }) }])
    expect((await readTask(second)).scheduledOn).toBeNull()
  })

  it('answers 409 plan_changed for a version above 0 when nothing is saved yet', async () => {
    const error = await failure(savePlan(db, actor(), TOMORROW, { baseVersion: 1, blocks: [] }, NOW))
    expect(error.statusCode).toBe(409)
    expect(error.extra).toEqual({ code: 'plan_changed' })
    expect(await db.select().from(dayPlans)).toEqual([])
  })

  it('answers 422 plan_day_past for a day before today in the workspace timezone and writes nothing (PLAN-34)', async () => {
    const review = await task('backlog')
    const error = await failure(
      savePlan(db, actor(), YESTERDAY, { baseVersion: 0, blocks: [{ kind: 'task', taskId: review, start: '09:00', minutes: 60 }] }, NOW),
    )
    expect(error.statusCode).toBe(422)
    expect(error.extra).toEqual({ code: 'plan_day_past' })
    expect(await db.select().from(dayPlans)).toEqual([])
    expect((await readTask(review)).scheduledOn).toBeNull()
  })

  it('keeps the plans of other users and other days apart (PLAN-12)', async () => {
    const review = await task('today')
    await savePlan(db, { userId: otherUserId, workspaceId }, TOMORROW, { baseVersion: 0, blocks: [{ kind: 'task', taskId: review, start: '08:00', minutes: 60 }] }, NOW)
    await savePlan(db, actor(), NEXT_WEEK, { baseVersion: 0, blocks: [{ kind: 'task', taskId: review, start: '08:00', minutes: 60 }] }, NOW)
    const mine = await savePlan(db, actor(), TOMORROW, { baseVersion: 0, blocks: [] }, NOW)
    expect(mine).toMatchObject({ version: 1, blocks: [] })
    expect((await getPlan(db, { userId: otherUserId, workspaceId }, TOMORROW, NOW)).blocks).toHaveLength(1)
    expect((await getPlan(db, actor(), NEXT_WEEK, NOW)).blocks).toHaveLength(1)
  })

  it('answers 422 for a task of another workspace and writes nothing (PLAN-43)', async () => {
    const mine = await task('backlog')
    const theirs = await task('today', { list: otherListId })
    const error = await failure(
      savePlan(
        db,
        actor(),
        TOMORROW,
        {
          baseVersion: 0,
          blocks: [
            { kind: 'task', taskId: mine, start: '09:00', minutes: 60 },
            { kind: 'task', taskId: theirs, start: '10:00', minutes: 60 },
          ],
        },
        NOW,
      ),
    )
    expect(error.statusCode).toBe(422)
    expect(await db.select().from(dayPlans)).toEqual([])
    expect((await readTask(mine)).scheduledOn).toBeNull()
  })

  it('answers 422 for a break with a list of another workspace and writes nothing (PLAN-43)', async () => {
    const error = await failure(
      savePlan(db, actor(), TOMORROW, { baseVersion: 0, blocks: [{ kind: 'break', name: 'Café', listId: otherListId, start: '10:00', minutes: 15 }] }, NOW),
    )
    expect(error.statusCode).toBe(422)
    expect(await db.select().from(dayPlans)).toEqual([])
  })
})

describe('savePlan: the day of the planned tasks (PLAN-09, PLAN-10, PLAN-38)', () => {
  it('gives a Backlog task without a day the day of the plan, without a time, and takes it to This week (D3)', async () => {
    const review = await task('backlog', { estimate: 30 })
    await savePlan(db, actor(), TOMORROW, { baseVersion: 0, blocks: [{ kind: 'task', taskId: review, start: '14:00', minutes: 90 }] }, NOW)
    expect(await readTask(review)).toEqual({ column: 'this_week', scheduledOn: TOMORROW, scheduledTime: null, estimateMinutes: 30 })
  })

  it('takes a Backlog task planned for today to Today (D3)', async () => {
    const review = await task('backlog')
    await savePlan(db, actor(), TODAY, { baseVersion: 0, blocks: [{ kind: 'task', taskId: review, start: '16:00', minutes: 60 }] }, NOW)
    expect(await readTask(review)).toEqual({ column: 'today', scheduledOn: TODAY, scheduledTime: null, estimateMinutes: null })
  })

  it('keeps a Backlog task planned for a later week in Backlog with the day (D3)', async () => {
    const review = await task('backlog')
    await savePlan(db, actor(), NEXT_WEEK, { baseVersion: 0, blocks: [{ kind: 'task', taskId: review, start: '09:00', minutes: 60 }] }, NOW)
    expect(await readTask(review)).toMatchObject({ column: 'backlog', scheduledOn: NEXT_WEEK, scheduledTime: null })
  })

  it('keeps the day and the time of a task scheduled for another day (PLAN-38, PLAN-10)', async () => {
    const meeting = await task('backlog', { on: NEXT_WEEK, time: '13:00:00', estimate: 60 })
    const later = await task('this_week', { on: '2026-11-14', estimate: 20 })
    await savePlan(
      db,
      actor(),
      TOMORROW,
      {
        baseVersion: 0,
        blocks: [
          { kind: 'task', taskId: meeting, start: '09:00', minutes: 120 },
          { kind: 'task', taskId: later, start: '11:00', minutes: 5 },
        ],
      },
      NOW,
    )
    expect(await readTask(meeting)).toEqual({ column: 'backlog', scheduledOn: NEXT_WEEK, scheduledTime: '13:00:00', estimateMinutes: 60 })
    expect(await readTask(later)).toEqual({ column: 'this_week', scheduledOn: '2026-11-14', scheduledTime: null, estimateMinutes: 20 })
  })

  it('changes neither the time nor the estimate of any task (PLAN-10)', async () => {
    const tasksBefore = [await task('backlog', { estimate: 30 }), await task('today', { on: TOMORROW, time: '08:15:00', estimate: 240 })]
    const before = await db.select().from(tasks).where(inArray(tasks.id, tasksBefore))
    await savePlan(
      db,
      actor(),
      TOMORROW,
      {
        baseVersion: 0,
        blocks: tasksBefore.map((taskId, index) => ({ kind: 'task' as const, taskId, start: `1${index}:00`, minutes: 600 })),
      },
      NOW,
    )
    const after = await db.select().from(tasks).where(inArray(tasks.id, tasksBefore))
    for (const row of before) {
      const now = after.find((candidate) => candidate.id === row.id)!
      expect(now.scheduledTime).toBe(row.scheduledTime)
      expect(now.estimateMinutes).toBe(row.estimateMinutes)
    }
  })
})
