import { describe, expect, it } from 'vitest'

import type { Display } from '@/lib/focus/display'
import { type SoundFrame, frameOf, soundsFor } from '@/lib/sounds/triggers'
import type { FocusSession, FocusState } from '@/types'

const NOW = Date.parse('2026-10-24T13:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

function frame(display: Display, overrides: Partial<SoundFrame> = {}): SoundFrame {
  return { display, taskId: 'task-a', spent: 0, own: true, breakEndsAt: null, at: NOW, ...overrides }
}

const countdown = (seconds: number) => ({ mode: 'countdown', seconds }) as const
const countup = (seconds: number) => ({ mode: 'countup', seconds }) as const

describe('soundsFor: progress every 10 min of total time on the task (SOUND-02)', () => {
  it('plays progress when the time spent goes from 599 to 600 s', () => {
    const prev = frame(countdown(61), { spent: 599 })
    const next = frame(countdown(60), { spent: 600 })

    expect(soundsFor(prev, next)).toEqual(['progress'])
  })

  it('does not play from 600 to 601 s', () => {
    const prev = frame(countdown(60), { spent: 600 })
    const next = frame(countdown(59), { spent: 601 })

    expect(soundsFor(prev, next)).toEqual([])
  })

  it('plays progress at 20 min while counting up past the estimate', () => {
    const prev = frame(countup(1199), { spent: 1199 })
    const next = frame(countup(1200), { spent: 1200 })

    expect(soundsFor(prev, next)).toEqual(['progress'])
  })

  it('plays progress once when a late frame jumps over the 10 min mark', () => {
    const prev = frame(countdown(70), { spent: 590 })
    const next = frame(countdown(50), { spent: 610 })

    expect(soundsFor(prev, next)).toEqual(['progress'])
  })

  it('does not play while the task is paused, with no session open', () => {
    const prev = frame({ mode: 'paused', seconds: 1 }, { spent: 599 })
    const next = frame({ mode: 'paused', seconds: 0 }, { spent: 600 })

    expect(soundsFor(prev, next)).toEqual([])
  })

  it('does not play when the timer moves to another task with more time spent', () => {
    const prev = frame(countdown(70), { spent: 590 })
    const next = frame(countup(1300), { taskId: 'task-b', spent: 1300 })

    expect(soundsFor(prev, next)).toEqual([])
  })

  it('never plays progress during a break', () => {
    const prev = frame({ mode: 'break', seconds: 120 }, { spent: 599, breakEndsAt: NOW + 120_000 })
    const next = frame({ mode: 'break', seconds: 119 }, { spent: 600, breakEndsAt: NOW + 120_000, at: NOW + 1000 })

    expect(soundsFor(prev, next)).toEqual([])
  })
})

describe('soundsFor: end of the estimate (SOUND-03)', () => {
  it('plays estimate when the timer passes to awaiting_extend', () => {
    const prev = frame(countdown(1), { spent: 3599 })
    const next = frame({ mode: 'awaiting_extend', seconds: 0 }, { spent: 3600 })

    expect(soundsFor(prev, next)).toEqual(['estimate'])
  })

  it('does not play when the next task was already waiting for Estender', () => {
    const prev = frame(countdown(300), { spent: 300 })
    const next = frame({ mode: 'awaiting_extend', seconds: 0 }, { taskId: 'task-b', spent: 600 })

    expect(soundsFor(prev, next)).not.toContain('estimate')
  })
})

describe('soundsFor: end of the break (SOUND-04)', () => {
  it('plays break_end when the break passes to paused on its own, at its end', () => {
    const end = NOW + 300_000
    const prev = frame({ mode: 'break', seconds: 1 }, { breakEndsAt: end, at: end - 1000 })
    const next = frame({ mode: 'paused', seconds: 1800 }, { at: end })

    expect(soundsFor(prev, next)).toEqual(['break_end'])
  })

  it('does not play when the user ends the break before its end (Encerrar intervalo)', () => {
    const end = NOW + 300_000
    const prev = frame({ mode: 'break', seconds: 200 }, { breakEndsAt: end, at: end - 200_000 })
    const next = frame({ mode: 'paused', seconds: 1800 }, { at: end - 199_500 })

    expect(soundsFor(prev, next)).toEqual([])
  })
})

describe('soundsFor: task completed (SOUND-01)', () => {
  it('never plays complete from the state: the next task taking over after a completion plays nothing', () => {
    const prev = frame(countdown(300), { spent: 300 })
    const next = frame(countdown(1200), { taskId: 'task-b', spent: 0 })

    expect(soundsFor(prev, next)).toEqual([])
  })

  it('never plays complete from the state when Today is cleared', () => {
    const prev = frame(countdown(300), { spent: 300 })
    const next = frame({ mode: 'all_clear', seconds: 0 }, { taskId: null })

    expect(soundsFor(prev, next)).toEqual([])
  })
})

describe('soundsFor: only on the device that holds the session', () => {
  it('plays no progress for a session of another device', () => {
    const prev = frame(countdown(61), { spent: 599, own: false })
    const next = frame(countdown(60), { spent: 600, own: false })

    expect(soundsFor(prev, next)).toEqual([])
  })

  it("plays no estimate when the estimate of another device's session runs out", () => {
    const prev = frame(countdown(1), { spent: 3599, own: false })
    const next = frame({ mode: 'awaiting_extend', seconds: 0 }, { spent: 3600, own: false })

    expect(soundsFor(prev, next)).toEqual([])
  })

  it("plays no break_end when the break that ended was another device's", () => {
    const end = NOW + 300_000
    const prev = frame({ mode: 'break', seconds: 1 }, { breakEndsAt: end, at: end - 1000, own: false })
    const next = frame({ mode: 'paused', seconds: 1800 }, { at: end, own: false })

    expect(soundsFor(prev, next)).toEqual([])
  })

  it("plays break_end when this device's break ends, though the frame after it has no session", () => {
    const end = NOW + 300_000
    const prev = frame({ mode: 'break', seconds: 1 }, { breakEndsAt: end, at: end - 1000, own: true })
    const next = frame({ mode: 'paused', seconds: 1800 }, { at: end, own: false })

    expect(soundsFor(prev, next)).toEqual(['break_end'])
  })
})

describe('frameOf', () => {
  const taskA = { id: 'task-a', title: 'Write', estimate_minutes: 11, spent_seconds: 0, awaiting_extend: false }
  const session = (overrides: Partial<FocusSession>): FocusSession => ({
    id: 's',
    kind: 'task',
    task_id: 'task-a',
    list_id: 'list-1',
    device_id: 'd',
    started_at: iso(NOW),
    deadline_at: null,
    planned_seconds: null,
    ...overrides,
  })
  const state = (overrides: Partial<FocusState>): FocusState => ({
    server_now: iso(NOW),
    session: null,
    task: taskA,
    today: { pending: 1, done: 3, estimate_minutes: 11, tasks: [{ ...taskA, position: 0 }] },
    stale: null,
    ...overrides,
  })

  it('takes the total time spent from a countdown: an 11 min task with 60 s left has spent 600 s', () => {
    const s = state({ session: session({ deadline_at: iso(NOW + 660_000) }) })

    expect(frameOf(s, countdown(60), NOW + 600_000, 'd')).toEqual({
      display: countdown(60),
      taskId: 'task-a',
      spent: 600,
      own: true,
      breakEndsAt: null,
      at: NOW + 600_000,
    })
  })

  it('takes the total time spent from a count up', () => {
    const s = state({ session: session({}), task: { ...taskA, estimate_minutes: null, spent_seconds: 1190 } })

    expect(frameOf(s, countup(1200), NOW + 10_000, 'd').spent).toBe(1200)
  })

  it('marks a session of another device as not owned, and no session as not owned', () => {
    const s = state({ session: session({}) })

    expect(frameOf(s, countup(10), NOW, 'other').own).toBe(false)
    expect(frameOf(state({}), { mode: 'paused', seconds: 660 }, NOW, 'd').own).toBe(false)
  })

  it('keeps the end of the break in progress', () => {
    const s = state({ session: session({ kind: 'break', task_id: null, deadline_at: iso(NOW + 300_000), planned_seconds: 300 }) })

    expect(frameOf(s, { mode: 'break', seconds: 300 }, NOW, 'd').breakEndsAt).toBe(NOW + 300_000)
  })
})
