import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { lists, tasks, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { spentSeconds } from '../../src/services/focus-settle.ts'
import { isAwaitingExtend } from '../../src/services/focus-state.ts'
import { overview } from '../../src/services/reports.ts'
import { type AgendaFilter, createSession, deleteSession, listSessions, updateSession } from '../../src/services/sessions.ts'
import { migratedDb } from '../support/db.ts'
import { seedFocus } from '../support/focus.ts'

// America/Sao_Paulo is UTC-3.
const SP = (local: string) => new Date(`${local}-03:00`)
const NOW = SP('2026-11-04T12:00:00')
const WEEK: AgendaFilter = { from: '2026-11-02', to: '2026-11-08', listId: null }

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

const actor = () => ({ userId: seed.userId })

/** The status, detail and code of the HttpError `promise` rejects with. */
async function failure(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(HttpError)
  const http = error as HttpError
  return { status: http.statusCode, detail: http.detail, code: http.extra.code }
}

async function otherWorkspaceTask() {
  const workspaceId = randomUUID()
  const listId = randomUUID()
  const taskId = randomUUID()
  await db.insert(workspaces).values({ id: workspaceId, name: 'Other', timezone: 'America/Sao_Paulo', createdAt: NOW })
  await db.insert(lists).values({ id: listId, workspaceId, name: 'Elsewhere', color: 3, position: 0, createdByUserId: seed.userId, createdAt: NOW })
  await db.insert(tasks).values({ id: taskId, listId, title: 'Theirs', column: 'today', position: 0, createdAt: NOW })
  return taskId
}

describe('listSessions', () => {
  it('AGENDA-01 AGENDA-03 AGENDA-04 returns each session uncut with task, list, color and origin; a break has no task', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const task = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-02T09:00:00'), endedAt: SP('2026-11-02T10:15:00') })
    const pause = await seed.addSession({
      kind: 'break',
      startedAt: SP('2026-11-02T10:15:00'),
      endedAt: SP('2026-11-02T10:20:00'),
      plannedSeconds: 300,
    })

    const found = await listSessions(db, actor(), workspace, WEEK, NOW)

    expect(found).toEqual([
      {
        id: task,
        kind: 'task',
        origin: 'focus',
        task_id: write,
        task_title: 'Write',
        list_id: seed.listId,
        list_name: 'Work',
        list_color: 1,
        started_at: SP('2026-11-02T09:00:00').toISOString(),
        ended_at: SP('2026-11-02T10:15:00').toISOString(),
      },
      {
        id: pause,
        kind: 'break',
        origin: 'focus',
        task_id: null,
        task_title: null,
        list_id: seed.listId,
        list_name: 'Work',
        list_color: 1,
        started_at: SP('2026-11-02T10:15:00').toISOString(),
        ended_at: SP('2026-11-02T10:20:00').toISOString(),
      },
    ])
  })

  it('AGENDA-05 returns the open session with ended_at null', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const open = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-04T11:20:00') })

    const found = await listSessions(db, actor(), workspace, WEEK, NOW)

    expect(found.map((s) => ({ id: s.id, started_at: s.started_at, ended_at: s.ended_at }))).toEqual([
      { id: open, started_at: SP('2026-11-04T11:20:00').toISOString(), ended_at: null },
    ])
  })

  it('AGENDA-07 a session from 23:30 to 00:30 comes whole when asking for only the first day and for only the second', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const id = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-02T23:30:00'), endedAt: SP('2026-11-03T00:30:00') })
    // Outside both days: ends at the first midnight, starts at the second.
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-01T23:00:00'), endedAt: SP('2026-11-02T00:00:00') })
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-04T00:00:00'), endedAt: SP('2026-11-04T00:30:00') })
    const whole = { started_at: SP('2026-11-02T23:30:00').toISOString(), ended_at: SP('2026-11-03T00:30:00').toISOString() }

    const first = await listSessions(db, actor(), workspace, { from: '2026-11-02', to: '2026-11-02', listId: null }, NOW)
    const second = await listSessions(db, actor(), workspace, { from: '2026-11-03', to: '2026-11-03', listId: null }, NOW)

    expect(first.map((s) => ({ id: s.id, started_at: s.started_at, ended_at: s.ended_at }))).toEqual([{ id, ...whole }])
    expect(second.map((s) => ({ id: s.id, started_at: s.started_at, ended_at: s.ended_at }))).toEqual([{ id, ...whole }])
  })

  it('AGENDA-10 leaves out the sessions of another user and of another workspace of the same user', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const mine = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-02T09:00:00'), endedAt: SP('2026-11-02T10:00:00') })
    await seed.addSession({
      kind: 'task',
      taskId: write,
      userId: await seed.addUser(),
      startedAt: SP('2026-11-02T11:00:00'),
      endedAt: SP('2026-11-02T12:00:00'),
    })
    const otherWorkspace = randomUUID()
    const otherList = randomUUID()
    await db.insert(workspaces).values({ id: otherWorkspace, name: 'Other', timezone: 'America/Sao_Paulo', createdAt: NOW })
    await db.insert(lists).values({ id: otherList, workspaceId: otherWorkspace, name: 'Elsewhere', color: 3, position: 0, createdByUserId: seed.userId, createdAt: NOW })
    await seed.addSession({
      kind: 'break',
      workspaceId: otherWorkspace,
      listId: otherList,
      startedAt: SP('2026-11-02T13:00:00'),
      endedAt: SP('2026-11-02T13:05:00'),
    })

    const found = await listSessions(db, actor(), workspace, WEEK, NOW)

    expect(found.map((s) => s.id)).toEqual([mine])
  })

  it('AD-001 an open session past its deadline comes closed at the deadline', async () => {
    const write = await seed.addTask({ title: 'Write', estimate: 25 })
    const id = await seed.addSession({
      kind: 'task',
      taskId: write,
      startedAt: SP('2026-11-04T10:00:00'),
      deadlineAt: SP('2026-11-04T10:25:00'),
    })

    const found = await listSessions(db, actor(), workspace, WEEK, NOW)

    expect(found.map((s) => ({ id: s.id, ended_at: s.ended_at }))).toEqual([{ id, ended_at: SP('2026-11-04T10:25:00').toISOString() }])
    const row = await seed.session(id)
    expect(row.endedAt?.toISOString()).toBe(SP('2026-11-04T10:25:00').toISOString())
    expect(row.endReason).toBe('estimate')
  })

  it('AGENDA-09 the list filter keeps only the sessions of that list', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const other = await seed.addList()
    const plan = await seed.addTask({ title: 'Plan', listId: other })
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-02T09:00:00'), endedAt: SP('2026-11-02T10:00:00') })
    const kept = await seed.addSession({ kind: 'task', taskId: plan, listId: other, startedAt: SP('2026-11-02T10:00:00'), endedAt: SP('2026-11-02T11:00:00') })
    const keptBreak = await seed.addSession({ kind: 'break', listId: other, startedAt: SP('2026-11-02T11:00:00'), endedAt: SP('2026-11-02T11:05:00') })

    const found = await listSessions(db, actor(), workspace, { ...WEEK, listId: other }, NOW)

    expect(found.map((s) => ({ id: s.id, list_id: s.list_id, list_name: s.list_name, list_color: s.list_color }))).toEqual([
      { id: kept, list_id: other, list_name: 'Other', list_color: 2 },
      { id: keptBreak, list_id: other, list_name: 'Other', list_color: 2 },
    ])
  })

  it('AGENDA-11 a week without sessions returns none', async () => {
    const write = await seed.addTask({ title: 'Write' })
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-10-26T09:00:00'), endedAt: SP('2026-10-26T10:00:00') })

    expect(await listSessions(db, actor(), workspace, WEEK, NOW)).toEqual([])
  })
})

describe('createSession', () => {
  const YESTERDAY = { startedAt: SP('2026-11-03T17:30:00'), endedAt: SP('2026-11-03T18:45:00') }

  it('AGENDA-20 records a task session with origin manual and answers it as the agenda shows it', async () => {
    const write = await seed.addTask({ title: 'Write' })

    const created = await createSession(db, actor(), workspace, { kind: 'task', taskId: write, ...YESTERDAY }, NOW)

    expect(created).toEqual({
      id: expect.any(String),
      kind: 'task',
      origin: 'manual',
      task_id: write,
      task_title: 'Write',
      list_id: seed.listId,
      list_name: 'Work',
      list_color: 1,
      started_at: YESTERDAY.startedAt.toISOString(),
      ended_at: YESTERDAY.endedAt.toISOString(),
    })
    const row = await seed.session(created.id)
    expect(row).toMatchObject({
      userId: seed.userId,
      workspaceId: seed.workspaceId,
      origin: 'manual',
      deviceId: 'agenda',
      endReason: 'manual',
      deadlineAt: null,
    })
    expect(row.lastSeenAt.toISOString()).toBe(YESTERDAY.endedAt.toISOString())
  })

  it('AGENDA-21 a manual session of 1h 15min adds 4500 s to the time spent on the task', async () => {
    const write = await seed.addTask({ title: 'Write' })
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-03T09:00:00'), endedAt: SP('2026-11-03T09:10:00') })
    expect((await spentSeconds(db, [write], NOW)).get(write)).toBe(600)

    await createSession(db, actor(), workspace, { kind: 'task', taskId: write, ...YESTERDAY }, NOW)

    expect((await spentSeconds(db, [write], NOW)).get(write)).toBe(600 + 4500)
  })

  it('AGENDA-22 the overview of the day counts the manual session in task_seconds', async () => {
    const write = await seed.addTask({ title: 'Write' })

    await createSession(db, actor(), workspace, { kind: 'task', taskId: write, ...YESTERDAY }, NOW)

    const day = await overview(db, seed.userId, workspace, { from: '2026-11-03', to: '2026-11-03', listId: null }, NOW)
    expect(day.tiles.task_seconds).toBe(4500)
    expect(day.daily).toEqual([{ date: '2026-11-03', task_seconds: 4500, break_seconds: 0 }])
  })

  it('AGENDA-16 records a break on the chosen list', async () => {
    const other = await seed.addList()

    const created = await createSession(
      db,
      actor(),
      workspace,
      { kind: 'break', listId: other, startedAt: SP('2026-11-03T12:00:00'), endedAt: SP('2026-11-03T12:30:00') },
      NOW,
    )

    expect(created).toMatchObject({ kind: 'break', origin: 'manual', task_id: null, task_title: null, list_id: other, list_name: 'Other' })
    const day = await overview(db, seed.userId, workspace, { from: '2026-11-03', to: '2026-11-03', listId: null }, NOW)
    expect(day.break_seconds).toBe(1800)
  })

  it('records time on a task already in Done (spec assumption: any column of an active list)', async () => {
    const done = await seed.addTask({ title: 'Shipped', column: 'done' })

    const created = await createSession(db, actor(), workspace, { kind: 'task', taskId: done, ...YESTERDAY }, NOW)

    expect(created.task_id).toBe(done)
  })

  it('AGENDA-23 refuses an end in the future with invalid_time, with 5 s of tolerance', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const end = (seconds: number) => new Date(NOW.getTime() + seconds * 1000)

    expect(
      await failure(createSession(db, actor(), workspace, { kind: 'task', taskId: write, startedAt: SP('2026-11-04T11:00:00'), endedAt: end(6) }, NOW)),
    ).toMatchObject({ status: 422, code: 'invalid_time' })
    const tolerated = await createSession(
      db,
      actor(),
      workspace,
      { kind: 'task', taskId: write, startedAt: SP('2026-11-04T11:00:00'), endedAt: end(5) },
      NOW,
    )
    expect(tolerated.ended_at).toBe(end(5).toISOString())
  })

  it('AGENDA-24 refuses 0 s, 30 s, 24 h + 1 s and an end before the start with invalid_duration; 1 min and 24 h pass', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const end = SP('2026-11-04T11:00:00')
    const lasting = (seconds: number) => ({ kind: 'task' as const, taskId: write, startedAt: new Date(end.getTime() - seconds * 1000), endedAt: end })

    for (const seconds of [0, 30, 24 * 3600 + 1, -60]) {
      expect(await failure(createSession(db, actor(), workspace, lasting(seconds), NOW))).toMatchObject({ status: 422, code: 'invalid_duration' })
    }
    const minute = await createSession(db, actor(), workspace, lasting(60), NOW)
    const day = await createSession(db, actor(), workspace, lasting(24 * 3600), NOW)
    expect([minute.started_at, day.started_at]).toEqual([
      new Date(end.getTime() - 60_000).toISOString(),
      new Date(end.getTime() - 24 * 3600_000).toISOString(),
    ])
    expect((await spentSeconds(db, [write], NOW)).get(write)).toBe(60 + 24 * 3600)
  })

  it('AGENDA-25 refuses a task of another workspace or of an archived list with 404 Task not found', async () => {
    const theirs = await otherWorkspaceTask()
    const archivedList = await seed.addList()
    const archived = await seed.addTask({ title: 'Old', listId: archivedList })
    await db.update(lists).set({ isArchived: true }).where(eq(lists.id, archivedList))

    for (const taskId of [theirs, archived, randomUUID()]) {
      expect(await failure(createSession(db, actor(), workspace, { kind: 'task', taskId, ...YESTERDAY }, NOW))).toEqual({
        status: 404,
        detail: 'Task not found',
        code: undefined,
      })
    }
    expect(await listSessions(db, actor(), workspace, WEEK, NOW)).toEqual([])
  })

  it('design risk: a manual session after the estimate ran out takes the task out of awaiting Estender', async () => {
    const write = await seed.addTask({ title: 'Write', estimate: 25 })
    await seed.addSession({
      kind: 'task',
      taskId: write,
      startedAt: SP('2026-11-03T09:00:00'),
      endedAt: SP('2026-11-03T09:25:00'),
      endReason: 'estimate',
    })
    const task = { id: write, estimateMinutes: 25 }
    expect(await isAwaitingExtend(db, seed.userId, task, 25 * 60)).toBe(true)

    await createSession(db, actor(), workspace, { kind: 'task', taskId: write, ...YESTERDAY }, NOW)

    expect(await isAwaitingExtend(db, seed.userId, task, 25 * 60 + 4500)).toBe(false)
  })
})

describe('updateSession and deleteSession', () => {
  const focusHour = async (taskId: string) =>
    seed.addSession({ kind: 'task', taskId, startedAt: SP('2026-11-03T14:00:00'), endedAt: SP('2026-11-03T15:00:00') })

  it('AGENDA-29 AGENDA-31 moving the end of a focus session from 15:00 to 15:30 adds 1800 s and keeps origin focus', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const id = await focusHour(write)
    expect((await spentSeconds(db, [write], NOW)).get(write)).toBe(3600)

    const updated = await updateSession(db, actor(), workspace, id, { endedAt: SP('2026-11-03T15:30:00') }, NOW)

    expect(updated).toMatchObject({
      id,
      origin: 'focus',
      task_id: write,
      started_at: SP('2026-11-03T14:00:00').toISOString(),
      ended_at: SP('2026-11-03T15:30:00').toISOString(),
    })
    expect((await spentSeconds(db, [write], NOW)).get(write)).toBe(3600 + 1800)
    expect((await seed.session(id)).origin).toBe('focus')
  })

  it('AGENDA-30 moving the whole session keeps its length', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const id = await focusHour(write)

    const updated = await updateSession(
      db,
      actor(),
      workspace,
      id,
      { startedAt: SP('2026-11-02T09:00:00'), endedAt: SP('2026-11-02T10:00:00') },
      NOW,
    )

    expect([updated.started_at, updated.ended_at]).toEqual([SP('2026-11-02T09:00:00').toISOString(), SP('2026-11-02T10:00:00').toISOString()])
    expect((await spentSeconds(db, [write], NOW)).get(write)).toBe(3600)
  })

  it('AGENDA-31 changing the task moves the time to the new task and its list', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const other = await seed.addList()
    const plan = await seed.addTask({ title: 'Plan', listId: other })
    const id = await focusHour(write)

    const updated = await updateSession(db, actor(), workspace, id, { taskId: plan }, NOW)

    expect(updated).toMatchObject({ task_id: plan, task_title: 'Plan', list_id: other, list_name: 'Other' })
    const spent = await spentSeconds(db, [write, plan], NOW)
    expect([spent.get(write), spent.get(plan)]).toEqual([undefined, 3600])
  })

  it('AGENDA-31 changing the list of a break', async () => {
    const other = await seed.addList()
    const id = await seed.addSession({ kind: 'break', startedAt: SP('2026-11-03T12:00:00'), endedAt: SP('2026-11-03T12:10:00') })

    const updated = await updateSession(db, actor(), workspace, id, { listId: other }, NOW)

    expect(updated).toMatchObject({ kind: 'break', task_id: null, list_id: other, list_name: 'Other' })
  })

  it('AGENDA-31 applies the checks of creation: invalid_time, invalid_duration and 404 Task not found', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const id = await focusHour(write)
    const theirs = await otherWorkspaceTask()

    expect(await failure(updateSession(db, actor(), workspace, id, { endedAt: new Date(NOW.getTime() + 60_000) }, NOW))).toMatchObject({
      status: 422,
      code: 'invalid_time',
    })
    expect(await failure(updateSession(db, actor(), workspace, id, { endedAt: SP('2026-11-03T14:00:30') }, NOW))).toMatchObject({
      status: 422,
      code: 'invalid_duration',
    })
    expect(await failure(updateSession(db, actor(), workspace, id, { startedAt: SP('2026-11-02T13:59:59') }, NOW))).toMatchObject({
      status: 422,
      code: 'invalid_duration',
    })
    expect(await failure(updateSession(db, actor(), workspace, id, { taskId: theirs }, NOW))).toMatchObject({
      status: 404,
      detail: 'Task not found',
    })
    const row = await seed.session(id)
    expect([row.taskId, row.startedAt.toISOString(), row.endedAt?.toISOString()]).toEqual([
      write,
      SP('2026-11-03T14:00:00').toISOString(),
      SP('2026-11-03T15:00:00').toISOString(),
    ])
  })

  it('AGENDA-32 deleting takes the length out of the time spent and the session out of the agenda', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const id = await focusHour(write)
    await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-03T16:00:00'), endedAt: SP('2026-11-03T16:30:00') })

    await deleteSession(db, actor(), workspace, id, NOW)

    expect((await spentSeconds(db, [write], NOW)).get(write)).toBe(1800)
    expect((await listSessions(db, actor(), workspace, WEEK, NOW)).map((s) => s.id)).not.toContain(id)
  })

  it('AGENDA-33 editing or deleting the open session is refused with 409 session_running', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const id = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-04T11:00:00') })

    expect(await failure(updateSession(db, actor(), workspace, id, { startedAt: SP('2026-11-04T10:30:00') }, NOW))).toMatchObject({
      status: 409,
      code: 'session_running',
    })
    expect(await failure(deleteSession(db, actor(), workspace, id, NOW))).toMatchObject({ status: 409, code: 'session_running' })
    const row = await seed.session(id)
    expect([row.startedAt.toISOString(), row.endedAt]).toEqual([SP('2026-11-04T11:00:00').toISOString(), null])
  })

  it('AD-001 a session past its deadline is settled first and can then be edited', async () => {
    const write = await seed.addTask({ title: 'Write', estimate: 25 })
    const id = await seed.addSession({ kind: 'task', taskId: write, startedAt: SP('2026-11-04T10:00:00'), deadlineAt: SP('2026-11-04T10:25:00') })

    const updated = await updateSession(db, actor(), workspace, id, { endedAt: SP('2026-11-04T10:30:00') }, NOW)

    expect(updated.ended_at).toBe(SP('2026-11-04T10:30:00').toISOString())
  })

  it('AGENDA-34 a session of another user or that does not exist answers 404 Session not found', async () => {
    const write = await seed.addTask({ title: 'Write' })
    const theirs = await seed.addSession({
      kind: 'task',
      taskId: write,
      userId: await seed.addUser(),
      startedAt: SP('2026-11-03T14:00:00'),
      endedAt: SP('2026-11-03T15:00:00'),
    })

    for (const id of [theirs, randomUUID()]) {
      expect(await failure(updateSession(db, actor(), workspace, id, { endedAt: SP('2026-11-03T15:30:00') }, NOW))).toMatchObject({
        status: 404,
        detail: 'Session not found',
      })
      expect(await failure(deleteSession(db, actor(), workspace, id, NOW))).toMatchObject({ status: 404, detail: 'Session not found' })
    }
    const row = await seed.session(theirs)
    expect(row.endedAt?.toISOString()).toBe(SP('2026-11-03T15:00:00').toISOString())
  })
})
