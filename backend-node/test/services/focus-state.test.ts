import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { focusSessions } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { readFocusState } from '../../src/services/focus-state.ts'
import { migratedDb } from '../support/db.ts'
import { at, seedFocus } from '../support/focus.ts'

// 10:00 in America/Sao_Paulo, the seeded workspace's zone.
const T0 = new Date('2026-10-24T13:00:00Z')

let db: Database
let client: PGlite
let seed: Awaited<ReturnType<typeof seedFocus>>
beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  seed = await seedFocus(db, T0)
})
afterEach(async () => {
  await client.close()
})

const read = (now: Date) =>
  readFocusState(db, seed.userId, { id: seed.workspaceId, timezone: 'America/Sao_Paulo' }, seed.listId, now)

describe('readFocusState', () => {
  it('FOCUS-02 without a session, shows the first pending task of Today with its spent time, and the totals of Today', async () => {
    const first = await seed.addTask({ title: 'first', estimate: 60 })
    await seed.addTask({ title: 'second', estimate: 30 })
    await seed.addTask({ title: 'later', estimate: 500, column: 'this_week' })
    await seed.addTask({ title: 'finished', estimate: 500, column: 'done' })
    await seed.addSession({ taskId: first, startedAt: T0, endedAt: at(T0, 10) })

    const state = await read(at(T0, 20))

    expect(state).toEqual({
      server_now: at(T0, 20).toISOString(),
      session: null,
      task: { id: first, title: 'first', estimate_minutes: 60, spent_seconds: 600, awaiting_extend: false },
      today: { pending: 2, done: 1, estimate_minutes: 90 },
      stale: null,
    })
  })

  it('FOCUS-02 with a task session open, shows it and its task, counting the open session up to now', async () => {
    await seed.addTask({ title: 'first', estimate: 60 })
    const second = await seed.addTask({ title: 'second', estimate: 30 })
    const id = await seed.addSession({ taskId: second, startedAt: T0, deadlineAt: at(T0, 30) })

    const state = await read(at(T0, 1))

    expect(state.session).toEqual({
      id,
      kind: 'task',
      task_id: second,
      list_id: seed.listId,
      device_id: 'device-a',
      started_at: T0.toISOString(),
      deadline_at: at(T0, 30).toISOString(),
      planned_seconds: null,
    })
    expect(state.task).toEqual({ id: second, title: 'second', estimate_minutes: 30, spent_seconds: 60, awaiting_extend: false })
  })

  it('during a break, shows the break and the first pending task of Today', async () => {
    const first = await seed.addTask({ title: 'first', estimate: 60 })
    await seed.addSession({ kind: 'break', startedAt: T0, plannedSeconds: 300, deadlineAt: at(T0, 5) })

    const state = await read(at(T0, 2))

    expect(state.session).toMatchObject({ kind: 'break', task_id: null, planned_seconds: 300, deadline_at: at(T0, 5).toISOString() })
    expect(state.task?.id).toBe(first)
  })

  it('FOCUS-10 a task whose last session ended with estimate awaits extend', async () => {
    const id = await seed.addTask({ estimate: 30 })
    await seed.addSession({ taskId: id, startedAt: T0, endedAt: at(T0, 30), endReason: 'estimate' })

    expect((await read(at(T0, 40))).task).toMatchObject({ spent_seconds: 1800, awaiting_extend: true })
  })

  it('FOCUS-10 FOCUS-11 a session past its deadline is closed at the deadline on read and the task awaits extend', async () => {
    const id = await seed.addTask({ estimate: 30 })
    await seed.addSession({ taskId: id, startedAt: T0, deadlineAt: at(T0, 30) })

    const state = await read(at(T0, 150))

    expect(state.session).toBeNull()
    expect(state.task).toMatchObject({ id, spent_seconds: 1800, awaiting_extend: true })
  })

  it('FOCUS-13 spent above the estimate in an extended session without deadline does not await extend, open or paused', async () => {
    const id = await seed.addTask({ estimate: 30 })
    await seed.addSession({ taskId: id, startedAt: T0, endedAt: at(T0, 30), endReason: 'estimate' })
    const extended = await seed.addSession({ taskId: id, startedAt: at(T0, 31) })

    expect((await read(at(T0, 41))).task).toMatchObject({ spent_seconds: 2400, awaiting_extend: false })

    await db.update(focusSessions).set({ endedAt: at(T0, 41), endReason: 'pause' }).where(eq(focusSessions.id, extended))
    expect((await read(at(T0, 50))).task).toMatchObject({ spent_seconds: 2400, awaiting_extend: false })
  })

  it('FOCUS-14 a task without estimate never awaits extend', async () => {
    const id = await seed.addTask({ estimate: null })
    await seed.addSession({ taskId: id, startedAt: T0, endedAt: at(T0, 30) })

    expect((await read(at(T0, 40))).task).toMatchObject({ estimate_minutes: null, spent_seconds: 1800, awaiting_extend: false })
  })

  it('FOCUS-09 with no pending task in Today, shows no task', async () => {
    await seed.addTask({ column: 'done' })

    const state = await read(T0)

    expect(state.task).toBeNull()
    expect(state.today).toEqual({ pending: 0, done: 1, estimate_minutes: 0 })
  })

  it('SYNC-11 an open session without signal for 121 s is stale; for 119 s or 120 s it is not', async () => {
    const taskId = await seed.addTask({ estimate: null })
    const id = await seed.addSession({ taskId, startedAt: T0, lastSeenAt: at(T0, 10) })

    expect((await read(at(T0, 10, 119))).stale).toBeNull()
    expect((await read(at(T0, 10, 120))).stale).toBeNull()
    expect((await read(at(T0, 12, 1))).stale).toEqual({ session_id: id, last_seen_at: at(T0, 10).toISOString(), seconds: 121 })
  })

  it('answers 404 for a list of another workspace', async () => {
    const error = await readFocusState(db, seed.userId, { id: randomUUID(), timezone: null }, seed.listId, T0).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 404 })
  })
})
