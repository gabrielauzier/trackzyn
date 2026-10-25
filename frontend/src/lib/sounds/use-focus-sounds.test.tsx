import { useEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { serverNow } from '@/lib/focus/clock'
import { deviceId } from '@/lib/focus/device-id'
import { deriveDisplay } from '@/lib/focus/display'
import { setEnabled } from '@/lib/sounds/prefs'
import { useFocusSounds } from '@/lib/sounds/use-focus-sounds'
import type { FocusState } from '@/types'

const synth = vi.hoisted(() => ({ play: vi.fn() }))
vi.mock('@/lib/sounds/synth', () => synth)
const gate = vi.hoisted(() => ({ shouldPlayHere: vi.fn(() => true) }))
vi.mock('@/lib/sounds/gate', () => gate)

const NOW = Date.parse('2026-10-24T13:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()
const task = { id: 'task-a', title: 'Write the report', estimate_minutes: 11, spent_seconds: 0, awaiting_extend: false }
const taskB = { ...task, id: 'task-b', title: 'Review', estimate_minutes: 30 }

/** An 11 min task whose session opened at NOW. */
function counting(overrides: Partial<FocusState> = {}): FocusState {
  return {
    server_now: iso(NOW),
    session: {
      id: 'session-1',
      kind: 'task',
      task_id: 'task-a',
      list_id: 'list-1',
      device_id: deviceId(),
      started_at: iso(NOW),
      deadline_at: iso(NOW + 11 * 60_000),
      planned_seconds: null,
    },
    task,
    today: { pending: 2, done: 0, estimate_minutes: 41, tasks: [{ ...task, position: 0 }, { ...taskB, position: 1 }] },
    stale: null,
    ...overrides,
  }
}

/** The timer as the focus screen renders it: the display read again every second. */
function useTimerSounds(state: FocusState) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000)
    return () => clearInterval(timer)
  }, [])
  return useFocusSounds(state, deriveDisplay(state, serverNow()))
}

function render(state: FocusState) {
  return renderHook(({ s }) => useTimerSounds(s), { initialProps: { s: state } })
}

const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms))
const played = () => synth.play.mock.calls.map(([kind]) => kind)

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  synth.play.mockClear()
  gate.shouldPlayHere.mockReturnValue(true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useFocusSounds', () => {
  it('plays progress at 10 min and estimate at 11 min of an 11 min task, once each (SOUND-02, SOUND-03)', () => {
    render(counting())

    advance(599_000)
    expect(played()).toEqual([])

    advance(1000)
    expect(played()).toEqual(['progress'])

    advance(59_000)
    expect(played()).toEqual(['progress'])

    advance(1000)
    expect(played()).toEqual(['progress', 'estimate'])

    advance(10 * 60_000)
    expect(played()).toEqual(['progress', 'estimate'])
  })

  it('does not play a sound turned off on this device, and still plays the others (SOUND-06)', () => {
    setEnabled('progress', false)
    render(counting())

    advance(11 * 60_000 + 5000)

    expect(played()).toEqual(['estimate'])
  })

  it('does not play in a window that is not the one playing the sounds (SOUND-07)', () => {
    gate.shouldPlayHere.mockReturnValue(false)
    render(counting())

    advance(11 * 60_000 + 5000)

    expect(played()).toEqual([])
  })

  it('plays nothing when it opens on an estimate already used up while the app was closed', () => {
    render(counting({ session: null, task: { ...task, spent_seconds: 660, awaiting_extend: true } }))

    advance(5000)

    expect(played()).toEqual([])
  })

  it('does not play complete when the focus state shows a task done by polling (SOUND-01)', () => {
    const { rerender } = render(counting())
    advance(1000)

    rerender({ s: counting({ task: taskB, today: { ...counting().today, pending: 1, done: 1 } }) })
    advance(3000)

    expect(played()).toEqual([])
  })

  it('plays complete once for a local completion, not again when the next poll shows it (SOUND-01)', () => {
    const { result, rerender } = render(counting())
    advance(1000)

    act(() => result.current.playComplete())
    expect(played()).toEqual(['complete'])

    rerender({ s: counting({ task: taskB, today: { ...counting().today, pending: 1, done: 1 } }) })
    advance(3000)

    expect(played()).toEqual(['complete'])
  })

  it('plays complete for every local completion, including tasks the focus state never shows', () => {
    const { result } = render(counting())

    act(() => result.current.playComplete())
    act(() => result.current.playComplete())

    expect(played()).toEqual(['complete', 'complete'])
  })

  it('plays nothing on a device that only follows a session held by another device', () => {
    const elsewhere = counting()
    render({ ...elsewhere, session: { ...elsewhere.session!, device_id: 'device-elsewhere' } })

    advance(11 * 60_000 + 5000)

    expect(played()).toEqual([])
  })

  it('plays no break_end on a device that only follows the break of another device', () => {
    const base = counting()
    render({
      ...base,
      session: {
        ...base.session!,
        kind: 'break',
        task_id: null,
        device_id: 'device-elsewhere',
        deadline_at: iso(NOW + 5 * 60_000),
        planned_seconds: 300,
      },
    })

    advance(6 * 60_000)

    expect(played()).toEqual([])
  })

  it('plays break_end once when the break reaches its end (SOUND-04)', () => {
    const breakState = counting({
      session: {
        id: 'session-2',
        kind: 'break',
        task_id: null,
        list_id: 'list-1',
        device_id: deviceId(),
        started_at: iso(NOW),
        deadline_at: iso(NOW + 5 * 60_000),
        planned_seconds: 300,
      },
    })
    render(breakState)

    advance(5 * 60_000 - 1000)
    expect(played()).toEqual([])

    advance(1000)
    advance(60_000)
    expect(played()).toEqual(['break_end'])
  })
})
