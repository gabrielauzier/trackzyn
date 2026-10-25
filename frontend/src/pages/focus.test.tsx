import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import FocusPage from '@/pages/focus'
import HomePage from '@/pages/home'
import { focus, lists } from '@/lib/api'
import { deviceId } from '@/lib/focus/device-id'
import { play } from '@/lib/sounds/synth'
import type { QueuedAction } from '@/lib/focus/queue'
import { renderWithProviders } from '@/test/utils'
import type { FocusState, ListCard } from '@/types'

vi.mock('@/lib/api', () => ({
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
  lists: { list: vi.fn(), move: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  tasks: { create: vi.fn() },
  authHeaders: () => ({}),
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: true }),
}))
vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { email: 'ana@example.com', preferences: { display_name: 'Ana' } } }),
}))
vi.mock('@/lib/sounds/synth', () => ({ play: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const LIST = '11111111-1111-4111-8111-111111111111'
const OTHER_DEVICE = 'device-elsewhere'
const taskA = { id: 'task-a', title: 'DEV-1725', estimate_minutes: 60, spent_seconds: 0, awaiting_extend: false }
const taskB = { id: 'task-b', title: 'DEV-1726', estimate_minutes: 30, spent_seconds: 0, awaiting_extend: false }

const now = () => new Date().toISOString()

/** Today of the list with A and B pending, nothing running. */
function paused(overrides: Partial<FocusState> = {}): FocusState {
  return {
    server_now: now(),
    session: null,
    task: taskA,
    today: {
      pending: 2,
      done: 0,
      estimate_minutes: 90,
      tasks: [
        { ...taskA, position: 0 },
        { ...taskB, position: 1 },
      ],
    },
    stale: null,
    ...overrides,
  }
}

/** A counting on `device`, with an hour of estimate left. */
function counting(device: string, base: FocusState = paused()): FocusState {
  return {
    ...base,
    server_now: now(),
    session: {
      id: 'session-1',
      kind: 'task',
      task_id: taskA.id,
      list_id: LIST,
      device_id: device,
      started_at: now(),
      deadline_at: new Date(Date.now() + 3600_000).toISOString(),
      planned_seconds: null,
    },
  }
}

function listCard(id: string, name: string): ListCard {
  return {
    id,
    workspace_id: 'ws',
    name,
    color: 3,
    position: 0,
    is_archived: false,
    created_by_user_id: null,
    created_at: '2026-10-24T10:00:00Z',
    pending_count: 2,
    preview: [],
  }
}

function renderFocus() {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/lists/:listId" element={<p>Board page</p>} />
      <Route path="/focus/:listId" element={<FocusPage />} />
    </Routes>,
    { route: `/focus/${LIST}` },
  )
}

const sent = () => vi.mocked(focus.send).mock.calls.map(([entry]) => (entry as QueuedAction).action)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(lists.list).mockResolvedValue({ timezone: 'America/Sao_Paulo', lists: [listCard(LIST, 'Week')] })
  vi.mocked(focus.get).mockResolvedValue(paused())
  vi.mocked(focus.send).mockImplementation(async () => counting(deviceId()))
  vi.mocked(focus.heartbeat).mockResolvedValue(counting(deviceId()))
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FocusPage', () => {
  it('shows the list selector, Today, the icons, the estimate, the bar, the pending tasks and Add task (FOCUS-01)', async () => {
    renderFocus()

    expect(await screen.findByText('DEV-1725')).toBeInTheDocument()
    const selector = screen.getByRole('button', { name: 'Pick a list' })
    expect(await within(selector).findByText('W')).toHaveAttribute('data-slot', 'list-badge')
    expect(screen.getByRole('heading', { level: 1, name: 'Today' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sound settings' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to the board' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Collapse' })).toBeInTheDocument()
    expect(screen.getByText('Est.: 1hr 30min')).toBeInTheDocument()
    expect(screen.getByText('0/2 Done')).toBeInTheDocument()
    expect(within(screen.getByRole('list', { name: 'Next tasks' })).getByText('DEV-1726')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument()
  })

  it('starts the first pending task of Today on opening (FOCUS-02)', async () => {
    renderFocus()

    await waitFor(() => expect(sent()).toHaveLength(1))
    expect(sent()[0]).toMatchObject({ type: 'start', task_id: taskA.id, takeover: false, list_id: LIST })
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('shows the task in focus with the highlighted contour, the other tasks without it (FOCUS-02)', async () => {
    renderFocus()

    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    const card = screen.getByRole('timer').parentElement!
    expect(card).toHaveTextContent(taskA.title)
    expect(card).toHaveAttribute('data-running', 'true')
    expect(card).toHaveClass('border-2', 'border-primary')
    expect(card).not.toHaveClass('border-primary/50')
    const next = within(screen.getByRole('list', { name: 'Next tasks' })).getByText(taskB.title).closest('li')!
    expect(next).not.toHaveClass('border-primary')
  })

  it('does not start again when this device already focuses on the list', async () => {
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId()))
    renderFocus()

    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(focus.send).not.toHaveBeenCalled()
  })

  it('opens on 00:00:00 with Extend and without a session when the estimate is already used up (Edge Case)', async () => {
    const used = { ...taskA, spent_seconds: 3600, awaiting_extend: true }
    vi.mocked(focus.get).mockResolvedValue(
      paused({ task: used, today: { ...paused().today, tasks: [{ ...used, position: 0 }, { ...taskB, position: 1 }] } }),
    )
    renderFocus()

    expect(await screen.findByRole('button', { name: 'Extend' })).toBeInTheDocument()
    expect(screen.getByText('00:00:00')).toBeInTheDocument()
    expect(focus.send).not.toHaveBeenCalled()
  })

  it('shows All clear and no timer once the last pending task is completed (FOCUS-09)', async () => {
    const onlyA = paused({ today: { pending: 1, done: 0, estimate_minutes: 60, tasks: [{ ...taskA, position: 0 }] } })
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId(), onlyA))
    vi.mocked(focus.send).mockResolvedValue({
      server_now: now(),
      session: null,
      task: null,
      today: { pending: 0, done: 1, estimate_minutes: 0, tasks: [] },
      stale: null,
    })
    const { user } = renderFocus()

    await user.click(await screen.findByRole('button', { name: 'Complete' }))

    expect(await screen.findByText('All clear')).toBeInTheDocument()
    expect(sent()).toEqual([expect.objectContaining({ type: 'complete', task_id: taskA.id })])
    expect(screen.queryByRole('timer')).not.toBeInTheDocument()
    expect(screen.getByText('1/1 Done')).toBeInTheDocument()
  })

  it('plays the completion sound once for Complete, not again when the state shows the task done (SOUND-01)', async () => {
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId()))
    vi.mocked(focus.send).mockResolvedValue(
      counting(deviceId(), paused({ task: taskB, today: { pending: 1, done: 1, estimate_minutes: 30, tasks: [{ ...taskB, position: 0 }] } })),
    )
    const { user } = renderFocus()

    await user.click(await screen.findByRole('button', { name: 'Complete' }))

    expect(await screen.findByText('1/2 Done')).toBeInTheDocument()
    expect(vi.mocked(play).mock.calls).toEqual([['complete']])
  })

  it('goes back to the board when the task in focus leaves Today (FOCUS-15)', async () => {
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId()))
    const { queryClient } = renderFocus()
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()

    // The server ended the session: A was moved out of Today on the board.
    vi.mocked(focus.get).mockResolvedValue(
      paused({ task: taskB, today: { pending: 1, done: 0, estimate_minutes: 30, tasks: [{ ...taskB, position: 0 }] } }),
    )
    await queryClient.invalidateQueries({ queryKey: ['focus', LIST] })

    expect(await screen.findByText('Board page')).toBeInTheDocument()
  })

  it('goes back to the board from the home icon without pausing (FOCUS-16)', async () => {
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId()))
    const { user } = renderFocus()

    await user.click(await screen.findByRole('button', { name: 'Back to the board' }))

    expect(await screen.findByText('Board page')).toBeInTheDocument()
    expect(focus.send).not.toHaveBeenCalled()
  })

  it('asks before taking over a session open on another device, and takes it over (SYNC-02, SYNC-03)', async () => {
    vi.mocked(focus.get).mockResolvedValue(counting(OTHER_DEVICE))
    vi.mocked(focus.send).mockRejectedValueOnce({ response: { status: 409, data: { code: 'focus_elsewhere' } } })
    const { user } = renderFocus()

    const dialog = await screen.findByRole('dialog', { name: 'You are already focusing on another device.' })
    await user.click(within(dialog).getByRole('button', { name: 'Take over' }))

    await waitFor(() => expect(sent()).toHaveLength(2))
    expect(sent()[1]).toMatchObject({ type: 'start', task_id: taskA.id, takeover: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('Reopening the app (SYNC-12)', () => {
  it('opens on the home with a paused task, not on the focus page', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/focus/:listId" element={<FocusPage />} />
      </Routes>,
      { route: '/' },
    )

    expect(await screen.findByRole('heading', { name: 'Your lists' })).toBeInTheDocument()
    expect(await screen.findByText('Week')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1, name: 'Today' })).not.toBeInTheDocument()
    expect(focus.get).not.toHaveBeenCalled()
    expect(focus.send).not.toHaveBeenCalled()
  })
})
