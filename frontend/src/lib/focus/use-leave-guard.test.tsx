import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook } from '@testing-library/react'

import { WORKSPACE_STORAGE_KEY } from '@/lib/api'
import { updateOffset } from '@/lib/focus/clock'
import { deviceId } from '@/lib/focus/device-id'
import { useLeaveGuard } from '@/lib/focus/use-leave-guard'
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

const fetchMock = vi.fn(async () => new Response('{}'))

function leave() {
  const beforeUnload = new Event('beforeunload', { cancelable: true })
  window.dispatchEvent(beforeUnload)
  return beforeUnload
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  updateOffset(iso(NOW))
  fetchMock.mockClear()
  vi.stubGlobal('fetch', fetchMock)
  localStorage.setItem('token', 'token-123')
  localStorage.setItem(WORKSPACE_STORAGE_KEY, 'workspace-1')
})

afterEach(() => {
  Reflect.deleteProperty(window, 'trackzyn')
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('useLeaveGuard (SYNC-09)', () => {
  it('with the task counting, cancels beforeunload so the browser asks before leaving', () => {
    renderHook(() => useLeaveGuard(state('counting')))

    expect(leave().defaultPrevented).toBe(true)
  })

  it('with the task counting, pagehide asks the pause with keepalive, the token and the time of closing', () => {
    renderHook(() => useLeaveGuard(state('counting')))
    vi.setSystemTime(NOW + 7000)

    window.dispatchEvent(new Event('pagehide'))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/focus/pause')
    expect(init).toMatchObject({ method: 'POST', keepalive: true })
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer token-123',
      'X-Workspace-Id': 'workspace-1',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ occurred_at: iso(NOW + 7000), device_id: deviceId() })
    expect(body.action_id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('with the task paused, does nothing', () => {
    renderHook(() => useLeaveGuard(state('paused')))

    expect(leave().defaultPrevented).toBe(false)
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('on desktop, leaves closing to the app’s own dialog (SYNC-08)', () => {
    Object.defineProperty(window, 'trackzyn', { value: { isDesktop: true }, configurable: true })
    renderHook(() => useLeaveGuard(state('counting')))

    expect(leave().defaultPrevented).toBe(false)
    window.dispatchEvent(new Event('pagehide'))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
