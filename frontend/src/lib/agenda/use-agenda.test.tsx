import type { ReactNode } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

import { sessions } from '@/lib/api'
import i18n from '@/lib/i18n'
import type { AgendaSession } from '@/types'
import { agendaKey, useAgenda, type AgendaPeriod } from './use-agenda'

vi.mock('@/lib/api', () => ({
  sessions: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const period: AgendaPeriod = { from: '2026-11-02', to: '2026-11-08', listId: null }

const ended: AgendaSession = {
  id: 's1',
  kind: 'task',
  origin: 'focus',
  task_id: 't1',
  task_title: 'Write the report',
  list_id: 'l1',
  list_name: 'Work',
  list_color: 3,
  started_at: '2026-11-02T17:00:00.000Z',
  ended_at: '2026-11-02T18:00:00.000Z',
}

const apiError = (status: number, detail: string, code?: string) =>
  Object.assign(new Error(detail), { response: { status, data: code ? { detail, code } : { detail } } })

function setup() {
  // Kept data must outlive the test: seeded queries have no observer.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </I18nextProvider>
  )
  const hook = renderHook(() => useAgenda(period), { wrapper })
  return { client, hook }
}

const cached = (client: QueryClient) => client.getQueryData<{ sessions: AgendaSession[] }>(agendaKey(period))?.sessions

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sessions.list).mockResolvedValue({ sessions: [ended] })
})

describe('useAgenda', () => {
  it('reads the sessions of the period', async () => {
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.query.data?.sessions).toEqual([ended]))
    expect(sessions.list).toHaveBeenCalledWith({ from: '2026-11-02', to: '2026-11-08' })
  })

  it('puts a refused edit back at its previous time and shows the API message (AGENDA-35)', async () => {
    let refuse!: (error: unknown) => void
    vi.mocked(sessions.update).mockImplementation(() => new Promise((_resolve, reject) => (refuse = reject)))
    const { client, hook } = setup()
    await waitFor(() => expect(hook.result.current.query.data).toBeDefined())

    act(() => hook.result.current.update.mutate({ id: 's1', changes: { ended_at: '2026-11-02T18:30:00.000Z' } }))
    await waitFor(() => expect(cached(client)?.[0]?.ended_at).toBe('2026-11-02T18:30:00.000Z'))

    await act(async () => refuse(apiError(404, 'Session not found')))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Session not found'))
    expect(cached(client)?.[0]).toEqual(expect.objectContaining({ started_at: ended.started_at, ended_at: ended.ended_at }))
  })

  it('puts a refused edit back from what it held, even when reading the agenda again fails (AGENDA-35)', async () => {
    // Offline after the first read: only the kept copy can bring the block back.
    vi.mocked(sessions.list).mockReset().mockResolvedValueOnce({ sessions: [ended] }).mockRejectedValue(new Error('offline'))
    vi.mocked(sessions.update).mockRejectedValue(apiError(404, 'Session not found'))
    const { client, hook } = setup()
    await waitFor(() => expect(hook.result.current.query.data).toBeDefined())

    await act(async () => {
      await hook.result.current.update
        .mutateAsync({ id: 's1', changes: { ended_at: '2026-11-02T18:30:00.000Z' } })
        .catch(() => undefined)
    })
    await waitFor(() => expect(sessions.list).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(hook.result.current.query.isFetching).toBe(false))
    expect(toast.error).toHaveBeenCalledWith('Session not found')
    expect(cached(client)?.[0]).toEqual(expect.objectContaining({ started_at: ended.started_at, ended_at: ended.ended_at }))
  })

  it('leaves a refused edit to the caller that shows it, without a toast, and still puts it back', async () => {
    vi.mocked(sessions.update).mockRejectedValue(apiError(404, 'Task not found'))
    const { client, hook } = setup()
    await waitFor(() => expect(hook.result.current.query.data).toBeDefined())

    let refusal: unknown
    await act(async () => {
      await hook.result.current.update
        .mutateAsync({ id: 's1', changes: { ended_at: '2026-11-02T18:30:00.000Z' }, quiet: true })
        .catch((error: unknown) => (refusal = error))
    })
    expect(refusal).toMatchObject({ response: { status: 404, data: { detail: 'Task not found' } } })
    expect(toast.error).not.toHaveBeenCalled()
    expect(cached(client)?.[0]).toEqual(expect.objectContaining({ ended_at: ended.ended_at }))
  })

  it('reads a refused duration in the app words, not the API detail (AGENDA-24)', async () => {
    vi.mocked(sessions.update).mockRejectedValue(apiError(422, 'A session lasts from 1 minute to 24 hours', 'invalid_duration'))
    const { hook } = setup()
    await waitFor(() => expect(hook.result.current.query.data).toBeDefined())
    act(() => hook.result.current.update.mutate({ id: 's1', changes: { ended_at: ended.started_at } }))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Use 1 minute to 24 hours.'))
  })

  it('brings back a session whose deletion was refused', async () => {
    vi.mocked(sessions.remove).mockRejectedValue(apiError(409, 'The session is still running', 'session_running'))
    const { client, hook } = setup()
    await waitFor(() => expect(hook.result.current.query.data).toBeDefined())
    act(() => hook.result.current.remove.mutate('s1'))
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('The session is still running'))
    expect(cached(client)).toEqual([ended])
  })

  it('reads the boards and the focus again after creating a session (AGENDA-46)', async () => {
    const created: AgendaSession = { ...ended, id: 's2', origin: 'manual' }
    vi.mocked(sessions.create).mockResolvedValue(created)
    const { client, hook } = setup()
    client.setQueryData(['lists', { archived: false }], { timezone: 'UTC', lists: [] })
    client.setQueryData(['focus', 'l1'], { session: null })
    await waitFor(() => expect(hook.result.current.query.data).toBeDefined())

    await act(() =>
      hook.result.current.create.mutateAsync({
        input: { kind: 'task', task_id: 't1', started_at: ended.started_at, ended_at: ended.ended_at! },
        preview: { task_title: 'Write the report', list_id: 'l1', list_name: 'Work', list_color: 3 },
      }),
    )
    expect(client.getQueryState(['lists', { archived: false }])?.isInvalidated).toBe(true)
    expect(client.getQueryState(['focus', 'l1'])?.isInvalidated).toBe(true)
    expect(sessions.create).toHaveBeenCalledWith({
      kind: 'task',
      task_id: 't1',
      started_at: ended.started_at,
      ended_at: ended.ended_at,
    })
  })
})
