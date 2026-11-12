import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import TodayPage from '@/pages/today'
import { focus, lists, today } from '@/lib/api'
import { deviceId } from '@/lib/focus/device-id'
import { todayKey } from '@/lib/today/use-today'
import { renderWithProviders } from '@/test/utils'
import type { FocusState, TodayDoneTask, TodayRead } from '@/types'

vi.mock('@/lib/api', () => ({
  today: { get: vi.fn() },
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
  lists: { list: vi.fn() },
  tasks: { get: vi.fn(), move: vi.fn() },
  authHeaders: () => ({}),
}))
const role = vi.hoisted(() => ({ canWrite: true }))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({
    current: { id: 'ws', name: 'Synthetic workspace', timezone: 'America/Sao_Paulo' },
    workspaces: [{ id: 'ws', name: 'Synthetic workspace' }],
    canWrite: role.canWrite,
  }),
}))
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { email: 'ana@example.com', preferences: { display_name: 'Ana' } } }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const SP = 'America/Sao_Paulo'
const LIST = '11111111-1111-4111-8111-111111111111'
const work = { id: LIST, name: 'Work', color: 2 }
/** 14:20 in São Paulo on Wednesday, 11 November 2026. */
const AT_1420 = Date.parse('2026-11-11T17:20:00.000Z')

const review = { id: 'task-a', title: 'Review the PR', estimate_minutes: 90, spent_seconds: 32 * 60, awaiting_extend: false }

function day(overrides: Partial<TodayRead> = {}): TodayRead {
  return {
    server_now: new Date(AT_1420).toISOString(),
    day: '2026-11-11',
    tomorrow: '2026-11-12',
    timezone: SP,
    now_minute: 14 * 60 + 20,
    workday: { start: '09:00', end: '19:00' },
    pending: [],
    done: [],
    plan: { saved: false, blocks: [] },
    sessions: [],
    tomorrow_plan_blocks: 0,
    tomorrow_tasks: [],
    week_unscheduled: 0,
    focus_task_series: false,
    ...overrides,
  }
}

const reviewDone: TodayDoneTask = {
  id: 'task-a',
  title: 'Review the PR',
  list: work,
  estimate_minutes: 90,
  completed_at: '2026-11-11T17:21:00Z',
  spent_seconds: 33 * 60,
  verdict: 'early',
  diff_seconds: -57 * 60,
  series: false,
}

function focusing(): FocusState {
  return {
    server_now: new Date(AT_1420).toISOString(),
    session: {
      id: 'session-1',
      kind: 'task',
      task_id: 'task-a',
      list_id: LIST,
      device_id: deviceId(),
      started_at: new Date(AT_1420 - 12 * 60_000).toISOString(),
      deadline_at: new Date(AT_1420 + 58 * 60_000).toISOString(),
      planned_seconds: null,
    },
    task: review,
    today: { pending: 1, done: 0, estimate_minutes: 90, tasks: [{ ...review, position: 0 }] },
    stale: null,
  }
}

/** After `Concluir`: nothing open and nothing left in Today. */
function completed(): FocusState {
  return { ...focusing(), session: null, task: null, today: { pending: 0, done: 1, estimate_minutes: 0, tasks: [] } }
}

function show() {
  return renderWithProviders(<TodayPage />)
}

beforeEach(() => {
  vi.clearAllMocks()
  role.canWrite = true
  localStorage.clear()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AT_1420)
  vi.mocked(lists.list).mockResolvedValue({ timezone: SP, lists: [{ ...work, workspace_id: 'ws', position: 0, is_archived: false, created_by_user_id: null, created_at: '2026-11-01T10:00:00Z', pending_count: 1, preview: [] }] })
  vi.mocked(focus.get).mockResolvedValue(completed())
  vi.mocked(today.get).mockResolvedValue(day())
})

afterEach(() => {
  vi.useRealTimers()
})

describe('TodayPage', () => {
  it('greets the user and says the day, the time and what is left of the workday (HOJE-03)', async () => {
    show()
    expect(await screen.findByText('Wednesday, November 11 · 14:20 · 4hr 40min until the end of the day (19:00)')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1, name: 'Good afternoon, Ana' })).toBeInTheDocument()
  })

  it('says the workday ended once the time is past its end (HOJE-04)', async () => {
    vi.setSystemTime(Date.parse('2026-11-11T22:30:00.000Z'))
    show()
    expect(await screen.findByText('Wednesday, November 11 · 19:30 · Workday ended at 19:00')).toBeInTheDocument()
    expect(screen.queryByText(/until the end of the day/)).toBeNull()
  })

  it('leads Plan tomorrow to the plan of tomorrow (HOJE-05)', async () => {
    show()
    expect(await screen.findByRole('link', { name: 'Plan tomorrow' })).toHaveAttribute('href', '/planejar/2026-11-12')
  })

  it('shows the Now, Pending and Done today cards (HOJE-01)', async () => {
    show()
    expect(await screen.findByText('Now · nothing in focus')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pending' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Done today' })).toBeInTheDocument()
    expect(screen.getByText('Nothing pending for today')).toBeInTheDocument()
    expect(screen.getByText('Nothing done today yet')).toBeInTheDocument()
  })

  it('shows Plan × actual below the Now card, with the plan of today (HOJE-42)', async () => {
    vi.mocked(today.get).mockResolvedValue(
      day({
        plan: {
          saved: true,
          blocks: [{ id: 'b1', kind: 'task', task_id: 'task-a', title: 'Review the PR', list_color: 2, start_minute: 810, minutes: 90, done: false }],
        },
      }),
    )
    show()
    const card = (await screen.findByRole('heading', { name: 'Plan × actual' })).closest('section')!
    expect(within(within(card).getByRole('list', { name: 'Plan' })).getByText('Review the PR')).toBeInTheDocument()
  })

  it('shows the numbers of the day beside the Now card (HOJE-49)', async () => {
    vi.mocked(today.get).mockResolvedValue(
      day({
        sessions: [
          { id: 's1', kind: 'task', task_id: 'task-a', title: 'Review the PR', list_id: LIST, list_color: 2, start_minute: 540, end_minute: 600, started_at: '2026-11-11T12:00:00.000Z', ended_at: '2026-11-11T13:00:00.000Z', open: false },
        ],
      }),
    )
    show()
    const focused = await screen.findByRole('group', { name: 'Focused time' })
    expect(within(focused).getByText('1hr')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Completed' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Plan adherence' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Task switches' })).toBeInTheDocument()
  })

  it('shows Tomorrow under Done today, with the tasks set for tomorrow (HOJE-54)', async () => {
    vi.mocked(today.get).mockResolvedValue(
      day({ tomorrow_tasks: [{ id: 'fiap', title: 'Hand in the work', list: work, estimate_minutes: 60, scheduled_minute: 600, series: false }] }),
    )
    show()
    const tomorrow = (await screen.findByRole('heading', { name: 'Tomorrow' })).closest('section')!
    expect(within(tomorrow).getByText('Work · 10:00 · scheduled')).toBeInTheDocument()
    const done = screen.getByRole('heading', { name: 'Done today' }).closest('section')!
    expect(done.parentElement).toBe(tomorrow.parentElement)
    expect(done.compareDocumentPosition(tomorrow) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('opens Close the day from the header, beside Plan tomorrow, with the task in focus to place (HOJE-41, HOJE-59)', async () => {
    vi.mocked(focus.get).mockResolvedValue(focusing())
    vi.mocked(today.get).mockResolvedValue(day({ pending: [] }))
    const { user } = show()
    const button = await screen.findByRole('button', { name: 'Close the day' })
    expect(button.parentElement).toBe(screen.getByRole('link', { name: 'Plan tomorrow' }).parentElement)
    await user.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Close the day' })
    expect(await within(dialog).findByRole('group', { name: 'Destination of Review the PR' })).toBeInTheDocument()
  })

  it('hides Close the day from a viewer (HOJE-67)', async () => {
    role.canWrite = false
    show()
    expect(await screen.findByRole('link', { name: 'Plan tomorrow' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Close the day' })).toBeNull()
  })

  it('reads the day again when the card completes the task, so it shows in Done today without waiting 60 s (HOJE-71)', async () => {
    vi.mocked(focus.get).mockResolvedValue(focusing())
    vi.mocked(focus.send).mockResolvedValue(completed())
    vi.mocked(today.get).mockResolvedValueOnce(day()).mockResolvedValue(day({ done: [reviewDone] }))
    const { user } = show()

    await user.click(await screen.findByRole('button', { name: 'Complete' }))

    const done = screen.getByRole('region', { name: 'Done today' })
    expect(await within(done).findByText('Review the PR')).toBeInTheDocument()
    expect(today.get).toHaveBeenCalledTimes(2)
  })

  it('keeps the cards and offers Try again when a read fails (HOJE-73)', async () => {
    vi.mocked(today.get)
      .mockResolvedValueOnce(day({ done: [reviewDone] }))
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockResolvedValue(day({ done: [reviewDone] }))
    const { user, queryClient } = show()
    const done = await screen.findByRole('region', { name: 'Done today' })
    expect(await within(done).findByText('Review the PR')).toBeInTheDocument()

    await queryClient.refetchQueries({ queryKey: todayKey('ws') })

    expect(await screen.findByText("Couldn't update")).toBeInTheDocument()
    expect(within(done).getByText('Review the PR')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText("Couldn't update")).toBeNull())
    expect(today.get).toHaveBeenCalledTimes(3)
  })

  it('links Create list in Pendente when the workspace has no active list (HOJE-72)', async () => {
    vi.mocked(lists.list).mockResolvedValue({ timezone: SP, lists: [] })
    show()
    expect(await screen.findByRole('link', { name: 'Create list' })).toHaveAttribute('href', '/lists?new=1')
  })
})
