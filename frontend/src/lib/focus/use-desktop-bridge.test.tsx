import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { deviceId } from '@/lib/focus/device-id'
import { useDesktopFocusBridge } from '@/lib/focus/use-desktop-bridge'
import type { TrackzynApi } from '@/lib/platform'
import type { FocusState } from '@/types'

const NOW = Date.parse('2026-10-24T13:00:00.000Z')
const iso = (ms: number) => new Date(ms).toISOString()

function state(session: 'counting' | 'paused'): FocusState {
  const task = { id: 'task-a', title: 'a', estimate_minutes: 60, spent_seconds: 600, awaiting_extend: false }
  return {
    server_now: iso(NOW),
    session:
      session === 'paused'
        ? null
        : {
            id: 'session-1',
            kind: 'task',
            task_id: 'task-a',
            list_id: 'list-1',
            device_id: deviceId(),
            started_at: iso(NOW - 10 * 60_000),
            deadline_at: iso(NOW + 50 * 60_000),
            planned_seconds: null,
          },
    task,
    today: { pending: 1, done: 0, estimate_minutes: 60, tasks: [{ ...task, position: 0 }] },
    stale: null,
  }
}

function installDesktopApi() {
  let pauseRequest: (() => Promise<void>) | null = null
  const unsubscribe = vi.fn()
  const api = {
    isDesktop: true,
    reportFocusState: vi.fn(),
    onPauseRequest: vi.fn((callback: () => Promise<void>) => {
      pauseRequest = callback
      return unsubscribe
    }),
  }
  Object.defineProperty(window, 'trackzyn', { value: api as unknown as TrackzynApi, configurable: true })
  return { api, unsubscribe, requestPause: () => pauseRequest!() }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'trackzyn')
})

describe('useDesktopFocusBridge (SYNC-08)', () => {
  it('reports the state to the desktop when the task is paused and resumed', () => {
    const { api } = installDesktopApi()
    const pause = vi.fn(async () => undefined)
    const { rerender } = renderHook(({ focus }) => useDesktopFocusBridge(focus, pause), { initialProps: { focus: state('counting') } })
    expect(api.reportFocusState.mock.calls).toEqual([[{ active: true, running: true }]])

    rerender({ focus: state('paused') })
    rerender({ focus: state('counting') })
    expect(api.reportFocusState.mock.calls).toEqual([
      [{ active: true, running: true }],
      [{ active: true, running: false }],
      [{ active: true, running: true }],
    ])
  })

  it('does not count a task running on another device', () => {
    const { api } = installDesktopApi()
    const elsewhere = state('counting')
    elsewhere.session!.device_id = 'other-device'
    renderHook(() => useDesktopFocusBridge(elsewhere, vi.fn(async () => undefined)))
    expect(api.reportFocusState.mock.calls).toEqual([[{ active: true, running: false }]])
  })

  it('answers the pause request with the pause action and resolves after it', async () => {
    const { api, requestPause } = installDesktopApi()
    let finishPause!: () => void
    const pause = vi.fn(() => new Promise<void>((resolve) => (finishPause = resolve)))
    renderHook(() => useDesktopFocusBridge(state('counting'), pause))
    expect(api.onPauseRequest).toHaveBeenCalledTimes(1)

    let settled = false
    const answer = requestPause().then(() => {
      settled = true
    })
    expect(pause).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(settled).toBe(false)

    finishPause()
    await answer
    expect(settled).toBe(true)
  })

  it('on leaving the focus page, stops answering and reports no focus', () => {
    const { api, unsubscribe } = installDesktopApi()
    const { unmount } = renderHook(() => useDesktopFocusBridge(state('counting'), vi.fn(async () => undefined)))
    unmount()
    expect(unsubscribe).toHaveBeenCalledTimes(1)
    expect(api.reportFocusState.mock.calls.at(-1)).toEqual([{ active: false, running: false }])
  })

  it('without window.trackzyn, does nothing', () => {
    const pause = vi.fn(async () => undefined)
    const { rerender, unmount } = renderHook(({ focus }) => useDesktopFocusBridge(focus, pause), { initialProps: { focus: state('counting') } })
    rerender({ focus: state('paused') })
    unmount()
    expect(window.trackzyn).toBeUndefined()
    expect(pause).not.toHaveBeenCalled()
  })
})
