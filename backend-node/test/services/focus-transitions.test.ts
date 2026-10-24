import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type FocusEndReason, type TaskColumn, focusSessions, tasks } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import * as focus from '../../src/services/focus.ts'
import { type FocusState, readFocusState } from '../../src/services/focus-state.ts'
import { migratedDb } from '../support/db.ts'
import { seedFocus } from '../support/focus.ts'

// The table of transition cases shared with the frontend (docs/focus-transitions.json).

interface CaseTask {
  key: string
  estimate_minutes?: number | null
  column?: TaskColumn
  completed_at?: number | null
}
interface CaseSession {
  task: string | null
  kind?: 'task' | 'break'
  device?: string
  started_at: number
  ended_at?: number | null
  end_reason?: FocusEndReason | null
  deadline_at?: number | null
  planned_seconds?: number | null
  last_seen_at?: number
}
interface CaseState {
  session: { kind: string; task: string | null; device: string; started_at: number; deadline_at: number | null; planned_seconds: number | null } | null
  task: { key: string; spent_seconds: number; awaiting_extend: boolean } | null
  today: { pending: number; done: number; estimate_minutes: number }
  stale: { last_seen_at: number; seconds: number } | null
}
interface CaseAction {
  type: string
  at: number
  received_at?: number
  device?: string
  task?: string
  takeover?: boolean
  minutes?: number
  decision?: 'keep' | 'cut'
}
interface TransitionCase {
  name: string
  requirements: string[]
  given: { tasks: CaseTask[]; sessions: CaseSession[]; state: CaseState }
  action: CaseAction
  expect: {
    status: number
    code?: string
    sessions: CaseSession[]
    tasks?: Array<{ key: string; column: TaskColumn; completed_at?: number | null }>
    state?: CaseState
  }
}

const table = JSON.parse(readFileSync(join(import.meta.dirname, '../../../docs/focus-transitions.json'), 'utf8')) as {
  t0: string
  cases: TransitionCase[]
}
const T0 = new Date(table.t0)
const time = (minutes: number) => new Date(T0.getTime() + minutes * 60_000)
const minutesOf = (date: Date | string | null) => (date === null ? null : (new Date(date).getTime() - T0.getTime()) / 60_000)
const COLUMN_ORDER: TaskColumn[] = ['backlog', 'this_week', 'today', 'done']

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

/** A session with every default of the table filled in. */
function fullSession(session: CaseSession): Required<CaseSession> {
  return {
    task: session.task,
    kind: session.kind ?? (session.task === null ? 'break' : 'task'),
    device: session.device ?? 'A',
    started_at: session.started_at,
    ended_at: session.ended_at ?? null,
    end_reason: session.end_reason ?? null,
    deadline_at: session.deadline_at ?? null,
    planned_seconds: session.planned_seconds ?? null,
    last_seen_at: session.last_seen_at ?? session.started_at,
  }
}

async function given(testCase: TransitionCase) {
  const ids = new Map<string, string>()
  for (const task of testCase.given.tasks) {
    const id = await seed.addTask({ title: task.key, estimate: task.estimate_minutes ?? null, column: task.column ?? 'today' })
    if (task.completed_at !== undefined && task.completed_at !== null) {
      await db.update(tasks).set({ completedAt: time(task.completed_at) }).where(eq(tasks.id, id))
    }
    ids.set(task.key, id)
  }
  for (const raw of testCase.given.sessions) {
    const session = fullSession(raw)
    await seed.addSession({
      kind: session.kind,
      taskId: session.task === null ? null : ids.get(session.task)!,
      deviceId: session.device,
      startedAt: time(session.started_at),
      endedAt: session.ended_at === null ? null : time(session.ended_at),
      endReason: session.end_reason,
      deadlineAt: session.deadline_at === null ? null : time(session.deadline_at),
      plannedSeconds: session.planned_seconds,
      lastSeenAt: time(session.last_seen_at),
    })
  }
  return ids
}

function projectState(state: FocusState, keys: Map<string, string>): CaseState {
  const keyOf = (id: string | null) => (id === null ? null : ([...keys].find(([, value]) => value === id)?.[0] ?? id))
  return {
    session: state.session && {
      kind: state.session.kind,
      task: keyOf(state.session.task_id),
      device: state.session.device_id,
      started_at: minutesOf(state.session.started_at)!,
      deadline_at: minutesOf(state.session.deadline_at),
      planned_seconds: state.session.planned_seconds,
    },
    task: state.task && { key: keyOf(state.task.id)!, spent_seconds: state.task.spent_seconds, awaiting_extend: state.task.awaiting_extend },
    today: state.today,
    stale: state.stale && { last_seen_at: minutesOf(state.stale.last_seen_at)!, seconds: state.stale.seconds },
  }
}

async function sessionsNow(keys: Map<string, string>) {
  const keyOf = (id: string | null) => (id === null ? null : [...keys].find(([, value]) => value === id)?.[0])
  const found = await db.select().from(focusSessions).orderBy(asc(focusSessions.startedAt))
  return found.map((row) => ({
    task: keyOf(row.taskId) ?? null,
    kind: row.kind,
    device: row.deviceId,
    started_at: minutesOf(row.startedAt)!,
    ended_at: minutesOf(row.endedAt),
    end_reason: row.endReason,
    deadline_at: minutesOf(row.deadlineAt),
    planned_seconds: row.plannedSeconds,
    last_seen_at: minutesOf(row.lastSeenAt)!,
  }))
}

async function tasksNow(keys: Map<string, string>) {
  const found = await db.select().from(tasks).orderBy(asc(tasks.position))
  const keyOf = (id: string) => [...keys].find(([, value]) => value === id)?.[0]
  return found
    .sort((a, b) => COLUMN_ORDER.indexOf(a.column) - COLUMN_ORDER.indexOf(b.column) || a.position - b.position)
    .map((row) => ({ key: keyOf(row.id)!, column: row.column, completed_at: minutesOf(row.completedAt) }))
}

const workspace = () => ({ id: seed.workspaceId, timezone: 'America/Sao_Paulo' })

/** Sends the table's action to the service the route of the same name calls. */
function send(action: CaseAction, keys: Map<string, string>, actionId = randomUUID()): Promise<FocusState> {
  const actor = { userId: seed.userId, workspaceId: seed.workspaceId }
  const input = { actionId, occurredAt: time(action.at), deviceId: action.device ?? 'A' }
  const now = time(action.received_at ?? action.at)
  const taskId = action.task === undefined ? '' : keys.get(action.task)!
  switch (action.type) {
    case 'start':
      return focus.startFocus(db, actor, input, { taskId, takeover: action.takeover ?? false }, now)
    case 'pause':
      return focus.pauseFocus(db, actor, input, now)
    default:
      throw new Error(`unknown action ${action.type}`)
  }
}

async function outcome(promise: Promise<FocusState>) {
  try {
    return { status: 200, state: await promise }
  } catch (error) {
    if (!(error instanceof HttpError)) throw error
    return { status: error.statusCode, code: error.extra.code as string | undefined }
  }
}

describe('focus transitions (docs/focus-transitions.json)', () => {
  it('has cases', () => {
    expect(table.cases.length).toBeGreaterThan(0)
  })

  for (const testCase of table.cases) {
    it(`${testCase.requirements.join(' ')} ${testCase.name}`, async () => {
      const keys = await given(testCase)
      const before = await readFocusState(db, seed.userId, workspace(), seed.listId, time(testCase.action.at))
      expect(projectState(before, keys)).toEqual(testCase.given.state)
      const tasksBefore = await tasksNow(keys)

      const result = await outcome(send(testCase.action, keys))

      expect(result.status).toBe(testCase.expect.status)
      if (testCase.expect.code !== undefined) expect(result.code).toBe(testCase.expect.code)
      expect(await sessionsNow(keys)).toEqual(testCase.expect.sessions.map(fullSession))
      expect(await tasksNow(keys)).toEqual(
        testCase.expect.tasks?.map((task) => ({ key: task.key, column: task.column, completed_at: task.completed_at ?? null })) ?? tasksBefore,
      )
      if (testCase.expect.state) {
        expect(result.state && projectState(result.state, keys)).toEqual(testCase.expect.state)
        expect(result.state?.server_now).toBe(time(testCase.action.received_at ?? testCase.action.at).toISOString())
      }
    })
  }
})

describe('the frame of every focus action', () => {
  const actor = () => ({ userId: seed.userId, workspaceId: seed.workspaceId })
  const input = (minutes: number, actionId = randomUUID(), deviceId = 'A') => ({ actionId, occurredAt: time(minutes), deviceId })

  it('AD-002 the same action_id twice answers the same response, with a fresh server_now, and opens one session', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    const actionId = randomUUID()

    const first = await focus.startFocus(db, actor(), input(0, actionId), { taskId, takeover: false }, time(0))
    const again = await focus.startFocus(db, actor(), input(0, actionId), { taskId, takeover: false }, time(3))

    expect({ ...again, server_now: first.server_now }).toEqual(first)
    expect(again.server_now).toBe(time(3).toISOString())
    expect(await db.select().from(focusSessions)).toHaveLength(1)
  })

  it('AD-002 a resent pause after other actions answers what it answered the first time and changes nothing', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    await focus.startFocus(db, actor(), input(0), { taskId, takeover: false }, time(0))
    const pauseId = randomUUID()
    const paused = await focus.pauseFocus(db, actor(), input(10, pauseId), time(10))
    await focus.startFocus(db, actor(), input(20), { taskId, takeover: false }, time(20))

    const resent = await focus.pauseFocus(db, actor(), input(10, pauseId), time(25))

    expect(resent.session).toBeNull()
    expect(resent.task).toEqual(paused.task)
    const open = (await db.select().from(focusSessions)).filter((row) => row.endedAt === null)
    expect(open.map((row) => row.startedAt)).toEqual([time(20)])
  })

  const invalidTime = async (promise: Promise<unknown>) => {
    const error = await promise.then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 422, extra: { code: 'invalid_time' } })
  }

  it('AD-002 occurred_at 6 s in the future answers 422 invalid_time; 5 s is accepted', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    await invalidTime(focus.startFocus(db, actor(), input(6 / 60), { taskId, takeover: false }, time(0)))
    expect(await db.select().from(focusSessions)).toHaveLength(0)

    const state = await focus.startFocus(db, actor(), input(5 / 60), { taskId, takeover: false }, time(0))
    expect(state.session?.started_at).toBe(time(5 / 60).toISOString())
  })

  it('AD-002 occurred_at 25h old answers 422 invalid_time', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    await invalidTime(focus.startFocus(db, actor(), input(0), { taskId, takeover: false }, time(25 * 60)))
    expect(await db.select().from(focusSessions)).toHaveLength(0)
  })

  it('AD-002 occurred_at before the last change of the user answers 422 invalid_time and leaves the session open', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    await focus.startFocus(db, actor(), input(10), { taskId, takeover: false }, time(10))

    await invalidTime(focus.pauseFocus(db, actor(), input(9), time(12)))

    const [session] = await db.select().from(focusSessions)
    expect(session).toMatchObject({ startedAt: time(10), endedAt: null })
  })

  it('SYNC-01 two simultaneous starts leave exactly one open session, from the same device or from two', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    const other = await seed.addTask({ estimate: 30 })
    await Promise.allSettled([
      focus.startFocus(db, actor(), input(0), { taskId, takeover: false }, time(0)),
      focus.startFocus(db, actor(), input(0), { taskId, takeover: false }, time(0)),
    ])
    expect((await db.select().from(focusSessions)).filter((row) => row.endedAt === null)).toHaveLength(1)

    await focus.pauseFocus(db, actor(), input(1), time(1))
    const results = await Promise.allSettled([
      focus.startFocus(db, actor(), input(2, randomUUID(), 'A'), { taskId, takeover: false }, time(2)),
      focus.startFocus(db, actor(), input(2, randomUUID(), 'B'), { taskId: other, takeover: false }, time(2)),
    ])
    expect(results.map((result) => result.status).sort()).toEqual(['fulfilled', 'rejected'])
    expect((await db.select().from(focusSessions)).filter((row) => row.endedAt === null)).toHaveLength(1)
  })

  it('answers 404 for a task of another workspace', async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    const error = await focus
      .startFocus(db, { userId: seed.userId, workspaceId: randomUUID() }, input(0), { taskId, takeover: false }, time(0))
      .then(
        () => null,
        (caught: unknown) => caught,
      )
    expect(error).toMatchObject({ statusCode: 404 })
  })

  it("an action_id already applied for another user answers invalid_transition and does not leak that user's state", async () => {
    const taskId = await seed.addTask({ estimate: 60 })
    const actionId = randomUUID()
    await focus.startFocus(db, actor(), input(0, actionId), { taskId, takeover: false }, time(0))
    const stranger = await seed.addUser()

    const error = await focus.pauseFocus(db, { userId: stranger, workspaceId: seed.workspaceId }, input(1, actionId), time(1)).then(
      () => null,
      (caught: unknown) => caught,
    )
    expect(error).toMatchObject({ statusCode: 409, extra: { code: 'invalid_transition' } })
  })
})
