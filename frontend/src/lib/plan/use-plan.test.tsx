import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AxiosError, type AxiosResponse } from 'axios'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WorkspaceContext } from '@/contexts/workspace-context'
import { plans } from '@/lib/api'
import type { PlanCandidate, PlanRead, Workspace } from '@/types'
import type { DraftBlock } from './draft'
import { planKey, usePlan } from './use-plan'

vi.mock('@/lib/api', () => ({
  plans: { get: vi.fn(), save: vi.fn(), candidates: vi.fn(), planned: vi.fn(), setWorkday: vi.fn() },
}))

const DAY = '2026-11-08'
const list = { id: 'l1', name: 'Work', color: 3 }
const workspace = { id: 'w1' } as Workspace
const plan = (version: number, overrides: Partial<PlanRead> = {}): PlanRead => ({
  day: DAY,
  version,
  editable: true,
  workday: { start: '09:00', end: '18:00' },
  blocks: [],
  ...overrides,
})
const candidate: PlanCandidate = {
  id: 't1',
  title: 'Write the report',
  list,
  column: 'backlog',
  position: 0,
  estimate_minutes: null,
  scheduled_on: null,
  scheduled_time: null,
}
const draft: DraftBlock[] = [
  { key: 'new-1', kind: 'task', start: 9 * 60, minutes: 60, task: { id: 't1', title: 'Write the report', list, done: false, scheduled_on: null, estimate_minutes: null } },
  { key: 'new-2', kind: 'break', start: 12 * 60, minutes: 60, name: 'Almoço', list },
]
const failure = (status: number, data: unknown) =>
  new AxiosError('Request failed', 'ERR_BAD_REQUEST', undefined, undefined, { status, data } as AxiosResponse)

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const value = { current: workspace, workspaces: [workspace], isLoading: false, switchWorkspace: vi.fn(), refresh: vi.fn(), role: 'owner' as const, canManage: true, canWrite: true }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
    </QueryClientProvider>
  )
  const hook = renderHook(() => usePlan(DAY), { wrapper })
  return { client, hook }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(plans.get).mockResolvedValue(plan(3))
  vi.mocked(plans.candidates).mockResolvedValue({ tasks: [candidate] })
})

describe('usePlan reading (PLAN-11, PLAN-02)', () => {
  it('reads the plan of the day and its candidate tasks', async () => {
    const { hook } = setup()

    await waitFor(() => expect(hook.result.current.plan.data).toEqual(plan(3)))
    await waitFor(() => expect(hook.result.current.candidates).toEqual([candidate]))
    expect(plans.get).toHaveBeenCalledWith(DAY)
    expect(plans.candidates).toHaveBeenCalledWith(DAY)
  })
})

describe('usePlan saving (PLAN-08, PLAN-35, PLAN-37)', () => {
  it('sends base_version and the blocks, and keeps the saved plan', async () => {
    const saved = plan(4, { blocks: [{ id: 'b1', kind: 'break', start: '12:00', minutes: 60, name: 'Almoço', list }] })
    vi.mocked(plans.save).mockResolvedValue(saved)
    vi.mocked(plans.get).mockResolvedValueOnce(plan(3)).mockResolvedValue(saved)
    const { client, hook } = setup()
    await waitFor(() => expect(hook.result.current.plan.data).toEqual(plan(3)))

    act(() => hook.result.current.save({ baseVersion: 3, blocks: draft }))

    await waitFor(() => expect(hook.result.current.saveState).toBe('saved'))
    expect(plans.save).toHaveBeenCalledWith(DAY, {
      base_version: 3,
      blocks: [
        { kind: 'task', task_id: 't1', start: '09:00', minutes: 60 },
        { kind: 'break', name: 'Almoço', list_id: 'l1', start: '12:00', minutes: 60 },
      ],
    })
    expect(client.getQueryData(planKey('w1', DAY))).toEqual(saved)
  })

  it('reads again the plans, the scheduled tasks of the Agenda and the board', async () => {
    vi.mocked(plans.save).mockResolvedValue(plan(4))
    const { client, hook } = setup()
    await waitFor(() => expect(hook.result.current.plan.data).toEqual(plan(3)))
    const planned = ['lists', 'plans', 'w1', '2026-11-02', '2026-11-08']
    const scheduled = ['lists', 'scheduled', '2026-11-02', '2026-11-08']
    const board = ['lists', 'board', 'l1']
    const other = ['reports', 'overview']
    for (const key of [planned, scheduled, board, other]) client.setQueryData(key, {})

    act(() => hook.result.current.save({ baseVersion: 3, blocks: draft }))

    await waitFor(() => expect(hook.result.current.saveState).toBe('saved'))
    expect(client.getQueryState(planned)?.isInvalidated).toBe(true)
    expect(client.getQueryState(scheduled)?.isInvalidated).toBe(true)
    expect(client.getQueryState(board)?.isInvalidated).toBe(true)
    // The candidates are on the screen: they read again at once, with the day the save gave the tasks.
    await waitFor(() => expect(plans.candidates).toHaveBeenCalledTimes(2))
    expect(client.getQueryState(other)?.isInvalidated).toBe(false)
  })

  it('turns a 409 plan_changed into conflict, keeping the plan it had', async () => {
    vi.mocked(plans.save).mockRejectedValue(failure(409, { detail: 'The plan changed elsewhere', code: 'plan_changed' }))
    const { client, hook } = setup()
    await waitFor(() => expect(hook.result.current.plan.data).toEqual(plan(3)))

    act(() => hook.result.current.save({ baseVersion: 3, blocks: draft }))

    await waitFor(() => expect(hook.result.current.saveState).toBe('conflict'))
    expect(client.getQueryData(planKey('w1', DAY))).toEqual(plan(3))
  })

  it('turns any other failure into failed, keeping the plan it had', async () => {
    vi.mocked(plans.save).mockRejectedValue(failure(500, { detail: 'Internal Server Error' }))
    const { client, hook } = setup()
    await waitFor(() => expect(hook.result.current.plan.data).toEqual(plan(3)))

    act(() => hook.result.current.save({ baseVersion: 3, blocks: draft }))

    await waitFor(() => expect(hook.result.current.saveState).toBe('failed'))
    expect(client.getQueryData(planKey('w1', DAY))).toEqual(plan(3))
  })

  it('turns a network error into failed', async () => {
    vi.mocked(plans.save).mockRejectedValue(new AxiosError('Network Error', 'ERR_NETWORK'))
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.plan.data).toEqual(plan(3)))

    act(() => hook.result.current.save({ baseVersion: 3, blocks: draft }))

    await waitFor(() => expect(hook.result.current.saveState).toBe('failed'))
  })
})

describe('usePlan workday (PLAN-22)', () => {
  it('saves the workday and gives the plan the new one', async () => {
    vi.mocked(plans.setWorkday).mockResolvedValue({ start: '08:00', end: '16:00' })
    vi.mocked(plans.get).mockResolvedValueOnce(plan(3)).mockResolvedValue(plan(3, { workday: { start: '08:00', end: '16:00' } }))
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.plan.data).toEqual(plan(3)))

    act(() => hook.result.current.saveWorkday({ start: '08:00', end: '16:00' }))

    await waitFor(() => expect(hook.result.current.plan.data?.workday).toEqual({ start: '08:00', end: '16:00' }))
    expect(plans.setWorkday).toHaveBeenCalledWith({ start: '08:00', end: '16:00' })
  })
})
