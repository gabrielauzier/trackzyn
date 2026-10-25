import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { type FocusAction, FocusRefusal, applyOptimistic } from '@/lib/focus/optimistic'
import type { FocusState } from '@/types'

// The table of transition cases the backend runs against the server (docs/focus-transitions.json),
// read as it is: every case must give here what the server gives (SYNC-05).

interface CaseTask {
  key: string
  estimate_minutes?: number | null
  column?: string
}
interface CaseState {
  session: { kind: 'task' | 'break'; task: string | null; device: string; started_at: number; deadline_at: number | null; planned_seconds: number | null } | null
  task: { key: string; spent_seconds: number; awaiting_extend: boolean } | null
  today: {
    pending: number
    done: number
    estimate_minutes: number
    tasks: Array<{ key: string; spent_seconds: number; awaiting_extend: boolean }>
  }
  stale: { last_seen_at: number; seconds: number } | null
}
interface CaseAction {
  type: FocusAction['type']
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
  given: { tasks: CaseTask[]; state: CaseState }
  action: CaseAction
  expect: { status: number; code?: string; state?: CaseState }
}

const table = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../docs/focus-transitions.json'), 'utf8')) as {
  t0: string
  cases: TransitionCase[]
}
const T0 = Date.parse(table.t0)
const LIST = 'list-1'
const GIVEN_SESSION = 'session-given'
const ms = (minutes: number) => T0 + minutes * 60_000
const iso = (minutes: number) => new Date(ms(minutes)).toISOString()
const minutesOf = (value: string | null) => (value === null ? null : (Date.parse(value) - T0) / 60_000)
const idOf = (key: string) => `task-${key}`
const keyOf = (id: string | null) => (id === null ? null : id.replace(/^task-/, ''))

/** The state the client holds: what GET /api/focus answered at `action.at`. */
function toFocusState(testCase: TransitionCase): FocusState {
  const given = testCase.given.state
  const estimates = new Map(testCase.given.tasks.map((task) => [task.key, task.estimate_minutes ?? null]))
  const view = (task: { key: string; spent_seconds: number; awaiting_extend: boolean }) => ({
    id: idOf(task.key),
    title: task.key,
    estimate_minutes: estimates.get(task.key) ?? null,
    spent_seconds: task.spent_seconds,
    awaiting_extend: task.awaiting_extend,
  })
  return {
    server_now: iso(testCase.action.at),
    session: given.session && {
      id: GIVEN_SESSION,
      kind: given.session.kind,
      task_id: given.session.task && idOf(given.session.task),
      list_id: LIST,
      device_id: given.session.device,
      started_at: iso(given.session.started_at),
      deadline_at: given.session.deadline_at === null ? null : iso(given.session.deadline_at),
      planned_seconds: given.session.planned_seconds,
    },
    task: given.task && view(given.task),
    today: {
      pending: given.today.pending,
      done: given.today.done,
      estimate_minutes: given.today.estimate_minutes,
      tasks: given.today.tasks.map((task, position) => ({ ...view(task), position })),
    },
    stale: given.stale && { session_id: GIVEN_SESSION, last_seen_at: iso(given.stale.last_seen_at), seconds: given.stale.seconds },
  }
}

function toAction(action: CaseAction): FocusAction {
  const common = { occurred_at: iso(action.at), device_id: action.device ?? 'A', list_id: LIST }
  const taskId = idOf(action.task ?? '')
  switch (action.type) {
    case 'start':
      return { ...common, type: 'start', task_id: taskId, takeover: action.takeover }
    case 'skip':
    case 'complete':
    case 'extend':
      return { ...common, type: action.type, task_id: taskId }
    case 'break':
      return { ...common, type: 'break', minutes: action.minutes! }
    case 'recover':
      return { ...common, type: 'recover', decision: action.decision! }
    default:
      return { ...common, type: action.type }
  }
}

function project(state: FocusState): CaseState {
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
    today: {
      pending: state.today.pending,
      done: state.today.done,
      estimate_minutes: state.today.estimate_minutes,
      tasks: state.today.tasks.map((task) => ({ key: keyOf(task.id)!, spent_seconds: task.spent_seconds, awaiting_extend: task.awaiting_extend })),
    },
    stale: state.stale && { last_seen_at: minutesOf(state.stale.last_seen_at)!, seconds: state.stale.seconds },
  }
}

function outcome(run: () => FocusState) {
  try {
    return { status: 200, state: run() }
  } catch (error) {
    if (!(error instanceof FocusRefusal)) throw error
    return { status: error.status, code: error.code }
  }
}

describe('applyOptimistic reproduces the server on docs/focus-transitions.json (SYNC-05)', () => {
  it('reads all 46 cases', () => {
    expect(table.cases).toHaveLength(46)
  })

  for (const testCase of table.cases) {
    it(`${testCase.requirements.join(' ')} ${testCase.name}`, () => {
      const nowMs = ms(testCase.action.received_at ?? testCase.action.at)

      const result = outcome(() => applyOptimistic(toFocusState(testCase), toAction(testCase.action), nowMs))

      expect(result.status).toBe(testCase.expect.status)
      if (testCase.expect.code !== undefined) expect(result.code).toBe(testCase.expect.code)
      if (testCase.expect.state) {
        expect(result.state && project(result.state)).toEqual(testCase.expect.state)
        expect(result.state?.server_now).toBe(new Date(nowMs).toISOString())
      }
    })
  }
})

describe('applyOptimistic on a state older than the action, as offline', () => {
  const counting: FocusState = {
    server_now: iso(0),
    session: { id: 's', kind: 'task', task_id: 'task-a', list_id: LIST, device_id: 'A', started_at: iso(0), deadline_at: iso(30), planned_seconds: null },
    task: { id: 'task-a', title: 'a', estimate_minutes: 30, spent_seconds: 0, awaiting_extend: false },
    today: {
      pending: 1,
      done: 0,
      estimate_minutes: 30,
      tasks: [{ id: 'task-a', title: 'a', estimate_minutes: 30, spent_seconds: 0, awaiting_extend: false, position: 0 }],
    },
    stale: null,
  }
  const pause = (minutes: number): FocusAction => ({ type: 'pause', occurred_at: iso(minutes), device_id: 'A', list_id: LIST })

  it('SYNC-05 counts the time from the last answer up to the click', () => {
    const state = applyOptimistic(counting, pause(12), ms(12))

    expect(state.session).toBeNull()
    expect(state.task).toMatchObject({ spent_seconds: 720, awaiting_extend: false })
  })

  it('FOCUS-11 a deadline reached before the click already ended the session, so pause is refused', () => {
    expect(() => applyOptimistic(counting, pause(35), ms(35))).toThrow(
      expect.objectContaining({ status: 409, code: 'invalid_transition' }),
    )
  })

  it('FOCUS-10 FOCUS-12 once the deadline passed, the task awaits Estender and extend counts up from the estimate', () => {
    const extend: FocusAction = { type: 'extend', task_id: 'task-a', occurred_at: iso(35), device_id: 'A', list_id: LIST }

    const state = applyOptimistic(counting, extend, ms(36))

    expect(state.session).toMatchObject({ kind: 'task', task_id: 'task-a', started_at: iso(35), deadline_at: null })
    expect(state.task).toMatchObject({ spent_seconds: 1860, awaiting_extend: false })
  })

  it('BREAK-02 a break of 0 or 121 minutes is refused with 422; 120 opens', () => {
    const breakOf = (minutes: number): FocusAction => ({ type: 'break', minutes, occurred_at: iso(1), device_id: 'A', list_id: LIST })

    for (const minutes of [0, 121]) {
      expect(() => applyOptimistic(counting, breakOf(minutes), ms(1))).toThrow(expect.objectContaining({ status: 422 }))
    }
    expect(applyOptimistic(counting, breakOf(120), ms(1)).session).toMatchObject({ kind: 'break', planned_seconds: 7200, deadline_at: iso(121) })
  })
})
