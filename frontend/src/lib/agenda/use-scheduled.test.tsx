import type { ReactNode } from 'react'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { agenda } from '@/lib/api'
import type { ProjectedOccurrence, ScheduledResponse, ScheduledTask } from '@/types'
import { useScheduled } from './use-scheduled'

vi.mock('@/lib/api', () => ({ agenda: { scheduled: vi.fn() } }))

const list = { id: 'l1', name: 'Work', color: 3 }
const task = (id: string, time: string | null): ScheduledTask => ({
  id,
  title: `Task ${id}`,
  list,
  column: 'this_week',
  position: 0,
  estimate_minutes: 60,
  scheduled_on: '2026-11-05',
  scheduled_time: time,
  series: null,
})
const projection: ProjectedOccurrence = {
  series_id: 'series-1',
  task_id: 'a',
  title: 'Task a',
  list,
  on: '2026-11-06',
  time: '10:00',
  estimate_minutes: 60,
  rule: { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: null },
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
  const hook = renderHook(() => useScheduled('2026-11-02', '2026-11-08'), { wrapper })
  return { client, hook }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useScheduled (US-5, US-14)', () => {
  it('reads the period and gives the timed tasks, the untimed tasks and the projections apart', async () => {
    const response: ScheduledResponse = { timed: [task('a', '10:00')], untimed: [task('b', null)], projected: [projection] }
    vi.mocked(agenda.scheduled).mockResolvedValue(response)
    const { hook } = setup()

    await waitFor(() => expect(hook.result.current.timed).toEqual([task('a', '10:00')]))
    expect(hook.result.current.untimed).toEqual([task('b', null)])
    expect(hook.result.current.projected).toEqual([projection])
    expect(agenda.scheduled).toHaveBeenCalledWith('2026-11-02', '2026-11-08')
  })

  it('gives empty lists before the answer', () => {
    vi.mocked(agenda.scheduled).mockReturnValue(new Promise(() => {}))
    const { hook } = setup()
    expect(hook.result.current).toMatchObject({ timed: [], untimed: [], projected: [] })
  })

  it('reads again when the board saves a schedule, which invalidates the lists', async () => {
    vi.mocked(agenda.scheduled).mockResolvedValue({ timed: [], untimed: [], projected: [] })
    const { client, hook } = setup()
    await waitFor(() => expect(agenda.scheduled).toHaveBeenCalledOnce())

    vi.mocked(agenda.scheduled).mockResolvedValue({ timed: [task('a', '10:00')], untimed: [], projected: [] })
    // What every write of the board does once it is answered (list-board.tsx).
    await client.invalidateQueries({ queryKey: ['lists'] })

    await waitFor(() => expect(hook.result.current.timed).toEqual([task('a', '10:00')]))
  })
})
