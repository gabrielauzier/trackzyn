import { describe, expect, it } from 'vitest'

import { deriveDisplay } from '@/lib/focus/display'
import type { FocusSession, FocusState } from '@/types'

const NOW = Date.parse('2026-10-24T13:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const MIN = 60_000

type TaskView = NonNullable<FocusState['task']>

function task(overrides: Partial<TaskView> = {}): TaskView {
  return { id: 'task-a', title: 'Write the report', estimate_minutes: 60, spent_seconds: 0, awaiting_extend: false, ...overrides }
}

function taskSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    id: 'session-1',
    kind: 'task',
    task_id: 'task-a',
    list_id: 'list-1',
    device_id: 'device-a',
    started_at: iso(NOW),
    deadline_at: null,
    planned_seconds: null,
    ...overrides,
  }
}

function state(overrides: Partial<FocusState> = {}): FocusState {
  return {
    server_now: iso(NOW),
    session: null,
    task: task(),
    today: { pending: 1, done: 0, estimate_minutes: 60 },
    stale: null,
    ...overrides,
  }
}

describe('deriveDisplay', () => {
  it('counts down the estimate minus the time spent: 1h with 10 min spent shows 3000 (FOCUS-02)', () => {
    const s = state({
      session: taskSession({ deadline_at: iso(NOW + 50 * MIN) }),
      task: task({ estimate_minutes: 60, spent_seconds: 600 }),
    })

    expect(deriveDisplay(s, NOW)).toEqual({ mode: 'countdown', seconds: 3000 })
  })

  it('takes one second off for every second that passes (FOCUS-03)', () => {
    const s = state({
      session: taskSession({ deadline_at: iso(NOW + 50 * MIN) }),
      task: task({ estimate_minutes: 60, spent_seconds: 600 }),
    })

    expect(deriveDisplay(s, NOW + 1000)).toEqual({ mode: 'countdown', seconds: 2999 })
    expect(deriveDisplay(s, NOW + 65_000)).toEqual({ mode: 'countdown', seconds: 2935 })
  })

  it('shows 00:00:00 waiting for Estender once the deadline is reached, before the server says so (FOCUS-10)', () => {
    const s = state({
      session: taskSession({ deadline_at: iso(NOW + 50 * MIN) }),
      task: task({ estimate_minutes: 60, spent_seconds: 600 }),
    })

    expect(deriveDisplay(s, NOW + 50 * MIN)).toEqual({ mode: 'awaiting_extend', seconds: 0 })
    expect(deriveDisplay(s, NOW + 2 * 60 * MIN)).toEqual({ mode: 'awaiting_extend', seconds: 0 })
  })

  it('shows 00:00:00 waiting for Estender when the server reports the estimate used up (FOCUS-10, Edge Cases)', () => {
    const s = state({ task: task({ estimate_minutes: 60, spent_seconds: 3600, awaiting_extend: true }) })

    expect(deriveDisplay(s, NOW + 5000)).toEqual({ mode: 'awaiting_extend', seconds: 0 })
  })

  it('counts up from the estimate after Estender: 3600, then 3601 (FOCUS-12)', () => {
    const s = state({
      session: taskSession({ deadline_at: null }),
      task: task({ estimate_minutes: 60, spent_seconds: 3600 }),
    })

    expect(deriveDisplay(s, NOW)).toEqual({ mode: 'countup', seconds: 3600 })
    expect(deriveDisplay(s, NOW + 1000)).toEqual({ mode: 'countup', seconds: 3601 })
  })

  it('keeps counting up past the estimate after Pausar and Retomar (FOCUS-13)', () => {
    const paused = state({ task: task({ estimate_minutes: 60, spent_seconds: 4000 }) })
    const resumed = state({
      session: taskSession({ deadline_at: null }),
      task: task({ estimate_minutes: 60, spent_seconds: 4000 }),
    })

    expect(deriveDisplay(paused, NOW + 30_000)).toEqual({ mode: 'paused', seconds: 4000 })
    expect(deriveDisplay(resumed, NOW + 30_000)).toEqual({ mode: 'countup', seconds: 4030 })
  })

  it('counts up from the time spent on a task without estimate (FOCUS-14)', () => {
    const s = state({
      session: taskSession({ deadline_at: null }),
      task: task({ estimate_minutes: null, spent_seconds: 600 }),
    })

    expect(deriveDisplay(s, NOW)).toEqual({ mode: 'countup', seconds: 600 })
    expect(deriveDisplay(s, NOW + 2000)).toEqual({ mode: 'countup', seconds: 602 })
  })

  it('never waits for Estender on a task without estimate (FOCUS-14)', () => {
    const s = state({ task: task({ estimate_minutes: null, spent_seconds: 7200 }) })

    expect(deriveDisplay(s, NOW)).toEqual({ mode: 'paused', seconds: 7200 })
  })

  it('freezes the timer at the value it had when paused (FOCUS-04)', () => {
    const s = state({ task: task({ estimate_minutes: 60, spent_seconds: 720 }) })

    expect(deriveDisplay(s, NOW)).toEqual({ mode: 'paused', seconds: 2880 })
    expect(deriveDisplay(s, NOW + 10 * MIN)).toEqual({ mode: 'paused', seconds: 2880 })
  })

  it('counts a 5 minute break down from 300 (BREAK-01)', () => {
    const s = state({
      session: taskSession({ kind: 'break', task_id: null, deadline_at: iso(NOW + 5 * MIN), planned_seconds: 300 }),
    })

    expect(deriveDisplay(s, NOW)).toEqual({ mode: 'break', seconds: 300 })
    expect(deriveDisplay(s, NOW + 1000)).toEqual({ mode: 'break', seconds: 299 })
  })

  it('leaves the task paused once the break reaches zero (BREAK-03)', () => {
    const s = state({
      session: taskSession({ kind: 'break', task_id: null, deadline_at: iso(NOW + 5 * MIN), planned_seconds: 300 }),
      task: task({ estimate_minutes: 60, spent_seconds: 1200 }),
    })

    expect(deriveDisplay(s, NOW + 5 * MIN)).toEqual({ mode: 'paused', seconds: 2400 })
  })

  it('shows Tudo limpo once the last pending task of Today is done (FOCUS-09)', () => {
    const s = state({ task: null, today: { pending: 0, done: 3, estimate_minutes: 0 } })

    expect(deriveDisplay(s, NOW)).toEqual({ mode: 'all_clear', seconds: 0 })
  })

  it('is idle when Today has no task at all', () => {
    const s = state({ task: null, today: { pending: 0, done: 0, estimate_minutes: 0 } })

    expect(deriveDisplay(s, NOW)).toEqual({ mode: 'idle', seconds: 0 })
  })
})
