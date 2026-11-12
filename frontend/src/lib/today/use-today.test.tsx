import type { ReactNode } from 'react'
import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceContext } from '@/contexts/workspace-context'
import { today } from '@/lib/api'
import type { TodayRead, Workspace } from '@/types'
import { todayKey, useToday } from './use-today'

vi.mock('@/lib/api', () => ({ today: { get: vi.fn() } }))

const day = (nowMinute: number): TodayRead => ({
  server_now: '2026-11-11T17:20:00.000Z',
  day: '2026-11-11',
  tomorrow: '2026-11-12',
  timezone: 'America/Sao_Paulo',
  now_minute: nowMinute,
  workday: { start: '09:00', end: '18:00' },
  pending: [],
  done: [],
  plan: { saved: false, blocks: [] },
  sessions: [],
})

function setup(workspace: Workspace) {
  // The app keeps answers fresh for 5 minutes (App.tsx): the day must read again anyway.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 5 * 60_000 } } })
  let current = workspace
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <WorkspaceContext.Provider
        value={{
          current,
          workspaces: [current],
          isLoading: false,
          switchWorkspace: vi.fn(),
          refresh: vi.fn(),
          role: 'owner',
          canManage: true,
          canWrite: true,
        }}
      >
        {children}
      </WorkspaceContext.Provider>
    </QueryClientProvider>
  )
  // Reads the fields during the render, as a page does, so the query re-renders when they change.
  const hook = renderHook(
    () => {
      const { data, isError } = useToday()
      return { data, isError }
    },
    { wrapper },
  )
  const switchTo = (next: Workspace) => {
    current = next
    hook.rerender()
  }
  return { client, hook, switchTo }
}

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
  // The answer reaches the hook on a later timer of the query's notifier.
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
})
afterEach(() => {
  focusManager.setFocused(undefined)
  vi.useRealTimers()
})

describe('useToday (HOJE-71, HOJE-73)', () => {
  it('reads the day of the current workspace', async () => {
    vi.mocked(today.get).mockResolvedValue(day(860))
    const { hook } = setup({ id: 'w1' } as Workspace)
    await advance(0)
    expect(hook.result.current.data).toEqual(day(860))
    expect(today.get).toHaveBeenCalledTimes(1)
  })

  it('HOJE-71 reads again every 60 s', async () => {
    vi.mocked(today.get).mockResolvedValueOnce(day(860)).mockResolvedValue(day(861))
    const { hook } = setup({ id: 'w1' } as Workspace)
    await advance(0)
    await advance(59_000)

    expect(today.get).toHaveBeenCalledTimes(1)
    await advance(1_000)
    expect(today.get).toHaveBeenCalledTimes(2)
    await advance(0)
    expect(hook.result.current.data?.now_minute).toBe(861)
    await advance(60_000)
    expect(today.get).toHaveBeenCalledTimes(3)
  })

  it('HOJE-71 reads again when the window gets the focus back, within the 5 minutes the app keeps answers fresh', async () => {
    vi.mocked(today.get).mockResolvedValueOnce(day(860)).mockResolvedValue(day(862))
    const { hook } = setup({ id: 'w1' } as Workspace)
    await advance(0)
    await advance(10_000)
    expect(today.get).toHaveBeenCalledTimes(1)

    act(() => {
      focusManager.setFocused(false)
      focusManager.setFocused(true)
    })
    await advance(0)
    expect(today.get).toHaveBeenCalledTimes(2)
    expect(hook.result.current.data?.now_minute).toBe(862)
  })

  it('HOJE-73 keeps the last day it read when a later read fails, and exposes isError', async () => {
    vi.mocked(today.get).mockResolvedValueOnce(day(860)).mockRejectedValue(new Error('Network Error'))
    const { hook } = setup({ id: 'w1' } as Workspace)
    await advance(0)
    await advance(60_000)
    expect(today.get).toHaveBeenCalledTimes(2)
    await advance(0)
    expect(hook.result.current.isError).toBe(true)
    expect(hook.result.current.data).toEqual(day(860))
  })

  it('keys the day by the current workspace, and reads again when the workspace changes', async () => {
    vi.mocked(today.get).mockResolvedValueOnce(day(860)).mockResolvedValue(day(900))
    const { client, hook, switchTo } = setup({ id: 'w1' } as Workspace)
    await advance(0)
    expect(client.getQueryData(todayKey('w1'))).toEqual(day(860))

    switchTo({ id: 'w2' } as Workspace)
    await advance(0)
    expect(today.get).toHaveBeenCalledTimes(2)
    expect(client.getQueryData(todayKey('w2'))).toEqual(day(900))
    expect(hook.result.current.data).toEqual(day(900))
  })

  it("todayKey is ['today', <workspace id>]", () => {
    expect(todayKey('w1')).toEqual(['today', 'w1'])
  })
})
