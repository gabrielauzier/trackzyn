import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'

import { serverNow } from '@/lib/focus/clock'
import { deviceId } from '@/lib/focus/device-id'
import { pending } from '@/lib/focus/queue'
import { useFocus } from '@/lib/focus/use-focus'
import { createTestQueryClient } from '@/test/utils'
import type { FocusState } from '@/types'

const focus = vi.hoisted(() => ({ get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() }))
vi.mock('@/lib/api', () => ({ focus }))

const NOW = Date.parse('2026-10-24T13:00:00.000Z')
const LIST = 'list-1'
const iso = (ms: number) => new Date(ms).toISOString()
const taskA = { id: 'task-a', title: 'Write the report', estimate_minutes: 60, spent_seconds: 600, awaiting_extend: false }

function paused(serverMs = NOW): FocusState {
  return {
    server_now: iso(serverMs),
    session: null,
    task: taskA,
    today: { pending: 1, done: 0, estimate_minutes: 60, tasks: [{ ...taskA, position: 0 }] },
    stale: null,
  }
}

function counting(device: string): FocusState {
  return {
    ...paused(),
    session: {
      id: 'session-1',
      kind: 'task',
      task_id: 'task-a',
      list_id: LIST,
      device_id: device,
      started_at: iso(NOW),
      deadline_at: iso(NOW + 50 * 60_000),
      planned_seconds: null,
    },
  }
}

const offline = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })

function sharedWrapper() {
  const client = createTestQueryClient()
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createTestQueryClient()}>{children}</QueryClientProvider>
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  focus.heartbeat.mockImplementation(async () => counting(deviceId()))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useFocus', () => {
  it('SYNC-10 sends a heartbeat at 60 s and 120 s while the open session is this device’s', async () => {
    focus.get.mockImplementation(async () => counting(deviceId()))
    renderHook(() => useFocus(LIST), { wrapper })
    await advance(0)

    await advance(59_999)
    expect(focus.heartbeat).not.toHaveBeenCalled()
    await advance(1)
    expect(focus.heartbeat).toHaveBeenCalledTimes(1)
    expect(focus.heartbeat).toHaveBeenCalledWith(deviceId())
    await advance(60_000)
    expect(focus.heartbeat).toHaveBeenCalledTimes(2)
  })

  it('SYNC-10 sends one heartbeat every 60 s when the page and the app guard read the same list', async () => {
    focus.get.mockImplementation(async () => counting(deviceId()))
    renderHook(() => [useFocus(LIST), useFocus(LIST)], { wrapper: sharedWrapper() })
    await advance(0)

    await advance(60_000)
    expect(focus.heartbeat).toHaveBeenCalledTimes(1)
    await advance(60_000)
    expect(focus.heartbeat).toHaveBeenCalledTimes(2)
  })

  it('SYNC-11 sends no heartbeat while the session is stale, so the user still decides', async () => {
    const stale = { ...counting(deviceId()), stale: { session_id: 'session-1', last_seen_at: iso(NOW - 300_000), seconds: 300 } }
    focus.get.mockImplementation(async () => stale)
    const { result } = renderHook(() => useFocus(LIST), { wrapper })
    await advance(0)

    await advance(120_000)

    expect(focus.heartbeat).not.toHaveBeenCalled()
    expect(result.current.state?.stale).toEqual(stale.stale)
  })

  it('SYNC-10 sends no heartbeat for a session open on another device', async () => {
    focus.get.mockImplementation(async () => counting('other-device'))
    const { result } = renderHook(() => useFocus(LIST), { wrapper })
    await advance(0)
    expect(result.current.state?.session?.device_id).toBe('other-device')

    await advance(120_000)

    expect(focus.heartbeat).not.toHaveBeenCalled()
  })

  it('AD-003 reads the focus state again every 15 s', async () => {
    focus.get.mockImplementation(async () => paused())
    renderHook(() => useFocus(LIST), { wrapper })
    await advance(0)
    expect(focus.get).toHaveBeenCalledTimes(1)
    expect(focus.get).toHaveBeenCalledWith(LIST)

    await advance(15_000)

    expect(focus.get).toHaveBeenCalledTimes(2)
  })

  it('FOCUS-03 corrects the clock with the server_now of each answer', async () => {
    const server = NOW + 5 * 60_000
    focus.get.mockImplementation(async () => paused(server))
    renderHook(() => useFocus(LIST), { wrapper })
    await advance(0)

    expect(Math.abs(serverNow() - server)).toBeLessThan(1000)
  })

  it('SYNC-05 an action without network shows at once and is sent when the network comes back', async () => {
    focus.get.mockImplementation(async () => paused())
    focus.send.mockRejectedValue(offline())
    const { result } = renderHook(() => useFocus(LIST), { wrapper })
    await advance(0)
    expect(result.current.display).toEqual({ mode: 'paused', seconds: 3000 })

    await act(async () => {
      await result.current.actions.start('task-a')
    })

    expect(result.current.state?.session).toMatchObject({ kind: 'task', task_id: 'task-a', started_at: iso(NOW) })
    expect(result.current.display).toEqual({ mode: 'countdown', seconds: 3000 })
    expect(pending()).toHaveLength(1)
    const [queued] = pending()
    expect(queued.action).toMatchObject({ type: 'start', task_id: 'task-a', occurred_at: iso(NOW), device_id: deviceId() })

    const fromServer = { ...counting(deviceId()), server_now: iso(NOW + 1000) }
    focus.send.mockReset()
    focus.send.mockResolvedValue(fromServer)
    focus.get.mockImplementation(async () => fromServer)
    await act(async () => {
      window.dispatchEvent(new Event('online'))
      await vi.advanceTimersByTimeAsync(0)
    })

    expect(focus.send).toHaveBeenCalledWith(queued)
    expect(pending()).toEqual([])
    expect(result.current.state).toEqual(fromServer)
  })
})
