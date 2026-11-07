import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { Route, Routes } from 'react-router-dom'

import FocusPage from '@/pages/focus'
import HomePage from '@/pages/home'
import { focus, lists, subtasks, tasks } from '@/lib/api'
import { deviceId } from '@/lib/focus/device-id'
import { play } from '@/lib/sounds/synth'
import * as queue from '@/lib/focus/queue'
import type { QueuedAction } from '@/lib/focus/queue'
import type { TrackzynApi } from '@/lib/platform'
import { placeCaretAtEnd, renderWithProviders } from '@/test/utils'
import type { FocusState, ListCard, Subtask, Task } from '@/types'

const role = vi.hoisted(() => ({ canWrite: true }))

vi.mock('@/lib/api', () => ({
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
  lists: { list: vi.fn(), move: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  tasks: { create: vi.fn(), move: vi.fn(), get: vi.fn(), update: vi.fn() },
  subtasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn() },
  authHeaders: () => ({}),
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: role.canWrite }),
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

/** The task `id` as `GET /api/tasks/:id` answers it, with `items` as its subtasks. */
function taskWith(id: string, items: Subtask[]): Task {
  return {
    id,
    list_id: LIST,
    title: id,
    notes: '',
    estimate_minutes: 60,
    column: 'today',
    position: 0,
    completed_at: null,
    created_at: '2026-10-24T10:00:00Z',
    subtasks: items,
    created_via: null,
  }
}

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

function renderFocus(route: string | { pathname: string; state: unknown } = `/focus/${LIST}`) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/lists/:listId" element={<p>Board page</p>} />
      <Route path="/focus/:listId" element={<FocusPage />} />
    </Routes>,
    { route: route as string },
  )
}

const sent = () => vi.mocked(focus.send).mock.calls.map(([entry]) => (entry as QueuedAction).action)

beforeEach(() => {
  vi.clearAllMocks()
  role.canWrite = true
  vi.mocked(lists.list).mockResolvedValue({ timezone: 'America/Sao_Paulo', lists: [listCard(LIST, 'Week')] })
  vi.mocked(focus.get).mockResolvedValue(paused())
  vi.mocked(focus.send).mockImplementation(async () => counting(deviceId()))
  vi.mocked(focus.heartbeat).mockResolvedValue(counting(deviceId()))
  vi.mocked(tasks.get).mockImplementation(async (id: string) => taskWith(id, []))
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
    // The collapse icon opens the desktop widget; the browser has none (WIDGET-24).
    expect(screen.queryByRole('button', { name: 'Collapse' })).not.toBeInTheDocument()
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
    const card = screen.getByRole('timer').closest('[data-running]')!
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

  it('starts nothing while a session left open by a crash waits for Keep or Cut at the last signal (SYNC-11)', async () => {
    const OTHER_LIST = '22222222-2222-4222-8222-222222222222'
    const taskX = { id: 'task-x', title: 'DEV-1800', estimate_minutes: null, spent_seconds: 900, awaiting_extend: false }
    for (const device of [deviceId(), OTHER_DEVICE]) {
      vi.mocked(focus.send).mockClear()
      const base = counting(device)
      vi.mocked(focus.get).mockResolvedValue({
        ...base,
        session: { ...base.session!, task_id: taskX.id, list_id: OTHER_LIST, deadline_at: null },
        task: taskX,
        stale: { session_id: base.session!.id, last_seen_at: new Date(Date.now() - 300_000).toISOString(), seconds: 300 },
      })
      const { unmount } = renderFocus()

      expect(await screen.findByRole('heading', { name: 'Today' })).toBeInTheDocument()
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(focus.send, device).not.toHaveBeenCalled()
      expect(screen.queryByRole('dialog', { name: 'You are already focusing on another device.' })).not.toBeInTheDocument()
      unmount()
    }
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

describe('FocusPage on the desktop (WIDGET-01, WIDGET-02, WIDGET-22, WIDGET-24)', () => {
  let bridge: { collapseFocus: ReturnType<typeof vi.fn>; notifyFocusChanged: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    localStorage.clear()
    bridge = { collapseFocus: vi.fn(async () => undefined), notifyFocusChanged: vi.fn() }
    Object.defineProperty(window, 'trackzyn', {
      value: { isDesktop: true, windowRole: 'main', onWidgetState: vi.fn(() => () => undefined), ...bridge } as unknown as TrackzynApi,
      configurable: true,
    })
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'trackzyn')
    localStorage.clear()
  })

  const fromFocusNow = { pathname: `/focus/${LIST}`, state: { collapse: true } }

  it('shows the collapse icon, which opens the widget (WIDGET-02)', async () => {
    const { user } = renderFocus()
    await screen.findByText('DEV-1725')

    await user.click(screen.getByRole('button', { name: 'Collapse' }))
    expect(bridge.collapseFocus).toHaveBeenCalledTimes(1)
  })

  it('opened by Focus now, starts the task and only then opens the widget (WIDGET-01)', async () => {
    let answer!: (state: FocusState) => void
    vi.mocked(focus.send).mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    renderFocus(fromFocusNow)

    await waitFor(() => expect(sent()).toEqual([expect.objectContaining({ type: 'start', task_id: taskA.id })]))
    expect(bridge.collapseFocus).not.toHaveBeenCalled()

    answer(counting(deviceId()))
    await waitFor(() => expect(bridge.collapseFocus).toHaveBeenCalledTimes(1))
  })

  it('opened by Focus now with the task already counting here, opens the widget without a new start', async () => {
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId()))
    renderFocus(fromFocusNow)

    await waitFor(() => expect(bridge.collapseFocus).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual([])
  })

  it('opened by Focus now without a connection, starts here and keeps the widget closed', async () => {
    vi.mocked(focus.send).mockRejectedValue(new Error('Network Error'))
    renderFocus(fromFocusNow)

    await waitFor(() => expect(sent()).toHaveLength(1))
    await expect(vi.mocked(focus.send).mock.results[0]!.value).rejects.toThrow('Network Error')
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(bridge.collapseFocus).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument()
  })

  it('opened by Focus now with a stopped session of this device, stays here for the decision', async () => {
    vi.mocked(focus.get).mockResolvedValue({
      ...counting(deviceId()),
      stale: { session_id: 'session-1', last_seen_at: now(), seconds: 300 },
    })
    renderFocus(fromFocusNow)

    expect(await screen.findByText('DEV-1725')).toBeInTheDocument()
    expect(bridge.collapseFocus).not.toHaveBeenCalled()
  })

  it('opened by Focus now with nothing to start, stays here', async () => {
    vi.mocked(focus.get).mockResolvedValue(paused({ task: null, today: { pending: 0, done: 1, estimate_minutes: 0, tasks: [] } }))
    renderFocus(fromFocusNow)

    expect(await screen.findByText('All clear')).toBeInTheDocument()
    expect(bridge.collapseFocus).not.toHaveBeenCalled()
  })

  it('opened from the board link without Focus now, starts and stays here', async () => {
    renderFocus()

    await waitFor(() => expect(sent()).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(bridge.collapseFocus).not.toHaveBeenCalled()
  })

  it('tells the widget after an action here was answered (WIDGET-22)', async () => {
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId()))
    vi.mocked(focus.send).mockResolvedValue(paused())
    const { user } = renderFocus()
    await user.click(await screen.findByRole('button', { name: 'Pause' }))

    await waitFor(() => expect(bridge.notifyFocusChanged).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual([expect.objectContaining({ type: 'pause' })])
  })

  const openWithoutStarting = { pathname: `/focus/${LIST}`, state: { start: false } }

  it('opened without starting, sends no start and keeps the widget closed', async () => {
    const ofA = { ...taskA, estimate_minutes: 45 }
    vi.mocked(focus.get).mockResolvedValue(paused({ task: ofA, today: { ...paused().today, tasks: [{ ...ofA, position: 0 }, { ...taskB, position: 1 }] } }))
    renderFocus(openWithoutStarting)

    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(focus.send).not.toHaveBeenCalled()
    expect(queue.pending()).toEqual([])
    expect(bridge.collapseFocus).not.toHaveBeenCalled()
    // The task waits, dashed, on its estimate in grey with the stopped badge: Start, Skip, Complete.
    const card = screen.getByRole('timer').closest('[data-running]')!
    expect(card).toHaveClass('border-dashed')
    expect(card).toHaveTextContent(taskA.title)
    expect(within(card as HTMLElement).getByText('Timer stopped')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('00:45:00')
    expect(screen.getByRole('timer')).toHaveClass('text-muted-foreground')
    expect(screen.getByRole('button', { name: 'Skip' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Complete' })).toBeInTheDocument()
  })

  it('a paused task with time spent keeps Resume and a solid card without the stopped badge', async () => {
    const spent = { ...taskA, estimate_minutes: 45, spent_seconds: 600 }
    vi.mocked(focus.get).mockResolvedValue(paused({ task: spent, today: { ...paused().today, tasks: [{ ...spent, position: 0 }, { ...taskB, position: 1 }] } }))
    renderFocus(openWithoutStarting)

    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument()
    const card = screen.getByRole('timer').closest('[data-running]')!
    expect(card).not.toHaveClass('border-dashed')
    expect(within(card as HTMLElement).queryByText('Timer stopped')).not.toBeInTheDocument()
    expect(screen.getByRole('timer')).not.toHaveClass('text-muted-foreground')
  })

  it('Start on a screen opened without starting begins the task and keeps the widget closed', async () => {
    const { user } = renderFocus(openWithoutStarting)

    await user.click(await screen.findByRole('button', { name: 'Start' }))

    await waitFor(() => expect(sent()).toEqual([expect.objectContaining({ type: 'start', task_id: taskA.id })]))
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    const card = screen.getByRole('timer').closest('[data-running]')!
    expect(card).toHaveAttribute('data-running', 'true')
    expect(card).not.toHaveClass('border-dashed')
    expect(screen.queryByText('Timer stopped')).not.toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(bridge.collapseFocus).not.toHaveBeenCalled()
  })

  it('keeps the list for the widget, which opens on it with a paused task', async () => {
    renderFocus()
    await screen.findByText('DEV-1725')

    expect(localStorage.getItem('trackzyn.focus.list')).toBe(LIST)
  })
})

describe('FocusPage in the browser with Focus now (WIDGET-24)', () => {
  it('starts the task and has no widget to open', async () => {
    renderFocus({ pathname: `/focus/${LIST}`, state: { collapse: true } })

    await waitFor(() => expect(sent()).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument()
    expect(window.trackzyn).toBeUndefined()
  })
})

const taskC = { id: 'task-c', title: 'DEV-1727', estimate_minutes: 20, spent_seconds: 0, awaiting_extend: false }

/** Today of the list in `order` (ids of A, B and C), the task in focus from `base`. */
function inOrder(order: string[], base: FocusState): FocusState {
  const all = [base.task!, taskB, taskC, taskA].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index)
  const byId = new Map(all.map((item) => [item.id, item]))
  return {
    ...base,
    today: {
      pending: order.length,
      done: 0,
      estimate_minutes: order.reduce((sum, id) => sum + (byId.get(id)!.estimate_minutes ?? 0), 0),
      tasks: order.map((id, position) => ({ ...byId.get(id)!, position })),
    },
  }
}

/** A counting here (with 10 min already tracked), then B and C in the queue. */
const queued = () => inOrder([taskA.id, taskB.id, taskC.id], counting(deviceId(), paused({ task: { ...taskA, spent_seconds: 600 } })))

/**
 * jsdom has no layout: the card in focus on top, the next tasks below it one under the other, in the
 * order they are in the page, so the sensors find what is above or below.
 */
function layOutFocus() {
  const original = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.dataset.focusDrop !== undefined) return DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 100 })
    // The lifted task starts where its item is.
    if (this.dataset.overlay) {
      const item = document.querySelector<HTMLElement>(`li[data-task-id="${this.dataset.overlay}"]`)
      if (item) return item.getBoundingClientRect()
    }
    if (this.dataset.taskId) {
      const index = Array.from(this.parentElement?.children ?? []).indexOf(this)
      return DOMRect.fromRect({ x: 0, y: 200 + index * 60, width: 400, height: 50 })
    }
    return original.call(this)
  })
}

const queueTitles = () =>
  within(screen.getByRole('list', { name: 'Next tasks' }))
    .getAllByRole('listitem')
    .map((item) => within(item).getByText(/^DEV-\d{4}$/).textContent)

const handle = (title: string) => screen.getByRole('button', { name: `Move ${title}` })

/** Lifts the next task `title` from the keyboard, presses `keys`, and drops it with Space. */
async function keyboardDrag(user: ReturnType<typeof renderFocus>['user'], title: string, keys: string, drop = true) {
  handle(title).focus()
  await user.keyboard(' ')
  if (keys) await user.keyboard(keys)
  if (drop) await user.keyboard(' ')
}

describe('FocusPage reordering the next tasks (#15)', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.mocked(focus.get).mockResolvedValue(queued())
    layOutFocus()
  })

  it('each next task has a move handle', async () => {
    renderFocus()
    await screen.findByText('DEV-1727')

    for (const title of [taskB.title, taskC.title]) {
      const item = within(screen.getByRole('list', { name: 'Next tasks' })).getByText(title).closest('li')!
      const grip = handle(title)
      expect(grip.tagName).toBe('BUTTON')
      // On the left of the item, with the six dots.
      expect(item.firstElementChild).toBe(grip)
      expect(grip.querySelector('svg')).toHaveClass('lucide-grip-vertical')
    }
    // The task in focus is not in the queue, so it has no handle.
    expect(screen.queryByRole('button', { name: `Move ${taskA.title}` })).not.toBeInTheDocument()
  })

  it('a viewer has no move handles', async () => {
    role.canWrite = false
    renderFocus()
    await screen.findByText('DEV-1727')

    expect(screen.queryByRole('button', { name: /^Move / })).not.toBeInTheDocument()
    const list = screen.getByRole('list', { name: 'Next tasks' })
    expect(list.querySelector('[aria-roledescription]')).toBeNull()
    expect(list.querySelector('[tabindex]')).toBeNull()
  })

  it('dropping a next task shows the new order at once', async () => {
    vi.mocked(tasks.move).mockImplementation(() => new Promise(() => undefined))
    renderFocus()
    await screen.findByText('DEV-1727')
    expect(queueTitles()).toEqual(['DEV-1726', 'DEV-1727'])

    // By the mouse: C, by its handle, up over B.
    const grip = handle(taskC.title)
    fireEvent.pointerDown(grip, { isPrimary: true, button: 0, clientX: 20, clientY: 285 })
    fireEvent.pointerMove(document, { isPrimary: true, clientX: 20, clientY: 270 })
    fireEvent.pointerMove(document, { isPrimary: true, clientX: 20, clientY: 215 })

    // Lifted with a shadow, and a dashed space where it will fall.
    const overlay = await waitFor(() => {
      const found = document.querySelector('[data-overlay]')
      expect(found).not.toBeNull()
      return found as HTMLElement
    })
    expect(overlay).toHaveClass('shadow-lg')
    expect(overlay).toHaveTextContent('DEV-1727')
    const placeholder = document.querySelector<HTMLElement>(`[data-task-id="${taskC.id}"]`)!
    expect(placeholder).toHaveAttribute('data-placeholder', 'true')
    expect(placeholder).toHaveClass('border-dashed')

    fireEvent.pointerUp(document, { isPrimary: true, clientX: 20, clientY: 215 })

    // The move has not answered, and the queue already reads C, B.
    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1727', 'DEV-1726']))
    expect(tasks.move).toHaveBeenCalledWith(taskC.id, { column: 'today', before_task_id: taskB.id })
    expect(document.querySelector('[data-overlay]')).toBeNull()
  })

  it('keyboard reorder announces the new position', async () => {
    vi.mocked(tasks.move).mockImplementation(() => new Promise(() => undefined))
    const { user } = renderFocus()
    await screen.findByText('DEV-1727')

    await keyboardDrag(user, taskC.title, '', false)
    expect(await screen.findByText('DEV-1727: position 2 of 2')).toBeInTheDocument()
    await user.keyboard('{ArrowUp}')
    expect(await screen.findByText('DEV-1727: position 1 of 2')).toBeInTheDocument()
    await user.keyboard(' ')

    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1727', 'DEV-1726']))
    expect(tasks.move).toHaveBeenCalledWith(taskC.id, { column: 'today', before_task_id: taskB.id })
    // The announcements are read from a live region.
    expect(screen.getByText('DEV-1727: position 1 of 2').closest('[aria-live]')).not.toBeNull()
  })

  it('reorder sends move with the task below or null at the end', async () => {
    // The server keeps the order the last move asked for, as the board reads it.
    let order = [taskA.id, taskB.id, taskC.id]
    vi.mocked(focus.get).mockImplementation(async () => inOrder(order, queued()))
    vi.mocked(tasks.move).mockImplementation(async (id, { before_task_id }) => {
      order = order.filter((other) => other !== id)
      order.splice(before_task_id ? order.indexOf(before_task_id) : order.length, 0, id)
      return { id } as Task
    })
    const { user } = renderFocus()
    await screen.findByText('DEV-1727')

    // B down below C: last in the queue, so before nothing.
    await keyboardDrag(user, taskB.title, '{ArrowDown}')
    await waitFor(() => expect(tasks.move).toHaveBeenCalledTimes(1))
    expect(tasks.move).toHaveBeenLastCalledWith(taskB.id, { column: 'today', before_task_id: null })
    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1727', 'DEV-1726']))

    // B back up above C: before C, never before A, the task in focus.
    await keyboardDrag(user, taskB.title, '{ArrowUp}')
    await waitFor(() => expect(tasks.move).toHaveBeenCalledTimes(2))
    expect(tasks.move).toHaveBeenLastCalledWith(taskB.id, { column: 'today', before_task_id: taskC.id })
    for (const [, body] of vi.mocked(tasks.move).mock.calls) expect(body.before_task_id).not.toBe(taskA.id)

    // Read again, the focus screen shows the order the board keeps.
    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1726', 'DEV-1727']))
    expect(order).toEqual([taskA.id, taskB.id, taskC.id])
    expect(focus.send).not.toHaveBeenCalled()
  })

  it('a failed move restores the order and shows the error', async () => {
    let fail!: (error: unknown) => void
    vi.mocked(tasks.move).mockImplementation(() => new Promise((_, reject) => (fail = reject)))
    const { user } = renderFocus()
    await screen.findByText('DEV-1727')

    await keyboardDrag(user, taskC.title, '{ArrowUp}')
    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1727', 'DEV-1726']))

    fail({ response: { status: 422, data: { detail: 'Task not found in Today' } } })

    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1726', 'DEV-1727']))
    expect(toast.error).toHaveBeenCalledWith('Task not found in Today')
  })

  it('a poll answering before the move keeps the new order', async () => {
    let answer!: (task: Task) => void
    vi.mocked(tasks.move).mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { user, queryClient } = renderFocus()
    await screen.findByText('DEV-1727')

    await keyboardDrag(user, taskC.title, '{ArrowUp}')
    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1727', 'DEV-1726']))

    // A poll reads the server before the move reached it: the old order.
    const polls = vi.mocked(focus.get).mock.calls.length
    await queryClient.invalidateQueries({ queryKey: ['focus', LIST] })
    expect(vi.mocked(focus.get).mock.calls.length).toBeGreaterThan(polls)
    expect(queueTitles()).toEqual(['DEV-1727', 'DEV-1726'])

    // The move answers, and the state read then has the new order.
    vi.mocked(focus.get).mockResolvedValue(inOrder([taskA.id, taskC.id, taskB.id], queued()))
    answer({ id: taskC.id } as Task)
    await waitFor(() => expect(focus.get).toHaveBeenCalledTimes(polls + 2))
    expect(queueTitles()).toEqual(['DEV-1727', 'DEV-1726'])
  })

  it('dragging over the focused card shows the drop zone', async () => {
    const { user } = renderFocus()
    await screen.findByText('DEV-1727')

    await keyboardDrag(user, taskB.title, '{ArrowUp}', false)

    const zone = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-drop-zone]')
      expect(found).not.toBeNull()
      return found!
    })
    expect(zone).toHaveClass('border-dashed')
    expect(within(zone).getByText('Drop to focus on this now')).toBeInTheDocument()
    expect(screen.getByText('DEV-1725 goes back to the top of the queue, with 10min already tracked.')).toBeInTheDocument()
    // The controls are dimmed while the card is the drop area.
    expect(screen.getByRole('button', { name: 'Pause' }).closest('[data-dimmed]')).toHaveClass('opacity-40')

    await user.keyboard('{Escape}')
    expect(await screen.findByRole('timer')).toBeInTheDocument()
    expect(document.querySelector('[data-drop-zone]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Pause' }).closest('[data-dimmed]')).toBeNull()
    expect(focus.send).not.toHaveBeenCalled()
  })

  it('dropping on the focused card focuses the dragged task', async () => {
    let answer!: (state: FocusState) => void
    vi.mocked(focus.send).mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { user, queryClient } = renderFocus()
    await screen.findByText('DEV-1727')

    await keyboardDrag(user, taskC.title, '{ArrowUp}{ArrowUp}')

    await waitFor(() => expect(sent()).toEqual([expect.objectContaining({ type: 'start', task_id: taskC.id, takeover: false })]))
    // C is in focus; A, which was, is at the top of the queue with its 10 minutes kept.
    const card = screen.getByRole('timer').closest('[data-running]')!
    expect(card).toHaveTextContent('DEV-1727')
    expect(queueTitles()).toEqual(['DEV-1725', 'DEV-1726'])
    const state = queryClient.getQueryData<FocusState>(['focus', LIST])!
    expect(state.task?.id).toBe(taskC.id)
    expect(state.today.tasks.find((item) => item.id === taskA.id)!.spent_seconds).toBeGreaterThanOrEqual(600)
    // C becomes the first task of Today, ahead of A, so it stays in focus once no session is open.
    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(taskC.id, { column: 'today', before_task_id: taskA.id }))
    expect(tasks.move).toHaveBeenCalledTimes(1)

    // The server answers the same: C counting, A first of the queue with its time.
    answer(inOrder([taskA.id, taskB.id, taskC.id], counting(deviceId(), paused({ task: taskC }))))
    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1725', 'DEV-1726']))
  })

  it('dropping on the focused card puts the task that was in focus back on top of the queue', async () => {
    // A was focused out of order: Today reads B, A, C.
    const swapped = inOrder([taskC.id, taskA.id, taskB.id], counting(deviceId(), paused({ task: taskC })))
    // Read again after the start and the moves, the server has C counting and Today as C, A, B.
    vi.mocked(focus.get).mockImplementation(async () => (sent().length > 0 ? swapped : inOrder([taskB.id, taskA.id, taskC.id], queued())))
    vi.mocked(focus.send).mockResolvedValue(inOrder([taskB.id, taskA.id, taskC.id], counting(deviceId(), paused({ task: taskC }))))
    // The two moves go one after the other: in parallel, the server could apply them in either order.
    vi.mocked(tasks.move).mockResolvedValue({ id: taskC.id } as Task)
    const { user } = renderFocus()
    await screen.findByText('DEV-1727')
    expect(queueTitles()).toEqual(['DEV-1726', 'DEV-1727'])

    await keyboardDrag(user, taskC.title, '{ArrowUp}{ArrowUp}')

    await waitFor(() => expect(sent()).toEqual([expect.objectContaining({ type: 'start', task_id: taskC.id })]))
    expect(queueTitles()).toEqual(['DEV-1725', 'DEV-1726'])
    // Today becomes C, A, B: C first (before B), then A on top of the queue (before B).
    await waitFor(() => expect(tasks.move).toHaveBeenCalledTimes(2))
    expect(vi.mocked(tasks.move).mock.calls).toEqual([
      [taskC.id, { column: 'today', before_task_id: taskB.id }],
      [taskA.id, { column: 'today', before_task_id: taskB.id }],
    ])
  })

  it('after a swap, pausing keeps the new task in focus', async () => {
    // C counted for two minutes before the pause, so the paused card reads Resume.
    const countedC = { ...taskC, spent_seconds: 120 }
    vi.mocked(focus.send).mockImplementation(async (entry) => {
      const action = (entry as QueuedAction).action
      // The server reads the first task of Today as the one in focus once no session is open.
      if (action.type === 'pause') return inOrder([taskC.id, taskA.id, taskB.id], paused({ task: countedC }))
      return inOrder([taskC.id, taskA.id, taskB.id], counting(deviceId(), paused({ task: taskC })))
    })
    vi.mocked(tasks.move).mockResolvedValue({ id: taskC.id } as Task)
    // Read again after the swap, the server has C counting and first in Today; after the pause, C paused.
    vi.mocked(focus.get).mockImplementation(async () => {
      const types = sent().map((action) => action.type)
      if (types.includes('pause')) return inOrder([taskC.id, taskA.id, taskB.id], paused({ task: countedC }))
      if (types.includes('start')) return inOrder([taskC.id, taskA.id, taskB.id], counting(deviceId(), paused({ task: taskC })))
      return queued()
    })
    const { user } = renderFocus()
    await screen.findByText('DEV-1727')

    await keyboardDrag(user, taskC.title, '{ArrowUp}{ArrowUp}')
    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(taskC.id, { column: 'today', before_task_id: taskA.id }))
    await user.click(await screen.findByRole('button', { name: 'Pause' }))

    await waitFor(() => expect(sent().map((action) => action.type)).toEqual(['start', 'pause']))
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
    expect(screen.getByRole('timer').closest('[data-running]')).toHaveTextContent('DEV-1727')
    expect(queueTitles()).toEqual(['DEV-1725', 'DEV-1726'])
  })

  it('the focused card refuses drops during a break, extend, stale or elsewhere', async () => {
    const base = queued()
    const breakSession: FocusState = {
      ...base,
      session: { ...base.session!, kind: 'break', task_id: null, deadline_at: new Date(Date.now() + 300_000).toISOString(), planned_seconds: 300 },
    }
    const usedA = { ...taskA, spent_seconds: 3600, awaiting_extend: true }
    const extend = inOrder([taskA.id, taskB.id, taskC.id], paused({ task: usedA }))
    extend.today.tasks[0] = { ...usedA, position: 0 }
    const stale: FocusState = { ...base, stale: { session_id: base.session!.id, last_seen_at: new Date(Date.now() - 300_000).toISOString(), seconds: 300 } }
    const elsewhere = inOrder([taskA.id, taskB.id, taskC.id], counting(OTHER_DEVICE, paused({ task: { ...taskA, spent_seconds: 600 } })))

    for (const [name, state] of [
      ['break', breakSession],
      ['extend', extend],
      ['stale', stale],
      ['elsewhere', elsewhere],
    ] as const) {
      vi.mocked(focus.send).mockClear()
      vi.mocked(tasks.move).mockClear()
      vi.mocked(focus.get).mockResolvedValue(state)
      const { user, unmount } = renderFocus({ pathname: `/focus/${LIST}`, state: { start: false } })
      await screen.findByText('DEV-1727')

      await keyboardDrag(user, taskB.title, '{ArrowUp}', false)
      expect(document.querySelector('[data-drop-zone]'), name).toBeNull()
      await user.keyboard(' ')
      await new Promise((resolve) => setTimeout(resolve, 20))

      expect(focus.send, name).not.toHaveBeenCalled()
      expect(tasks.move, name).not.toHaveBeenCalled()
      expect(queueTitles(), name).toEqual(['DEV-1726', 'DEV-1727'])
      unmount()
    }
  })
})

describe('FocusPage reordering on the desktop (#15)', () => {
  let bridge: { collapseFocus: ReturnType<typeof vi.fn>; notifyFocusChanged: ReturnType<typeof vi.fn> }

  beforeEach(() => {
    bridge = { collapseFocus: vi.fn(async () => undefined), notifyFocusChanged: vi.fn() }
    Object.defineProperty(window, 'trackzyn', {
      value: { isDesktop: true, windowRole: 'main', onWidgetState: vi.fn(() => () => undefined), ...bridge } as unknown as TrackzynApi,
      configurable: true,
    })
    vi.mocked(focus.get).mockResolvedValue(queued())
    layOutFocus()
  })

  afterEach(() => {
    Reflect.deleteProperty(window, 'trackzyn')
    localStorage.clear()
  })

  it('reorder and swap tell the widget', async () => {
    let answer!: (task: Task) => void
    vi.mocked(tasks.move).mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { user } = renderFocus()
    await screen.findByText('DEV-1727')

    // A reorder tells the widget once the server answered the move.
    await keyboardDrag(user, taskC.title, '{ArrowUp}')
    await waitFor(() => expect(tasks.move).toHaveBeenCalledTimes(1))
    expect(bridge.notifyFocusChanged).not.toHaveBeenCalled()
    vi.mocked(focus.get).mockResolvedValue(inOrder([taskA.id, taskC.id, taskB.id], queued()))
    answer({ id: taskC.id } as Task)
    await waitFor(() => expect(bridge.notifyFocusChanged).toHaveBeenCalledTimes(1))

    // A swap tells it once the start was answered, and the widget then shows the new task in focus.
    vi.mocked(focus.send).mockResolvedValue(inOrder([taskA.id, taskC.id, taskB.id], counting(deviceId(), paused({ task: taskC }))))
    await waitFor(() => expect(queueTitles()).toEqual(['DEV-1727', 'DEV-1726']))
    await keyboardDrag(user, taskB.title, '{ArrowUp}{ArrowUp}')
    await waitFor(() => expect(sent()).toEqual([expect.objectContaining({ type: 'start', task_id: taskB.id })]))
    await waitFor(() => expect(bridge.notifyFocusChanged).toHaveBeenCalledTimes(2))
  })
})

const sub = (id: string, title: string, done = false, position = 0): Subtask => ({ id, task_id: taskA.id, title, done, position })
const four = () => [sub('s1', 'Write the cases', true, 0), sub('s2', 'Drop at the end', false, 1), sub('s3', 'Move by keyboard', false, 2), sub('s4', 'Announce the position', false, 3)]

describe('FocusPage subtasks of the task in focus (#16)', () => {
  /** A counting here with `items` as its subtasks, B with two of its own, C with none. */
  function withSubtasks(items: Subtask[]) {
    const done = items.filter((item) => item.done).length
    const state = inOrder([taskA.id, taskB.id, taskC.id], counting(deviceId(), paused({ task: { ...taskA, subtasks: { done, total: items.length } } })))
    state.today.tasks = state.today.tasks.map((item) =>
      item.id === taskA.id
        ? { ...item, subtasks: { done, total: items.length } }
        : item.id === taskB.id
          ? { ...item, subtasks: { done: 1, total: 2 } }
          : { ...item, subtasks: { done: 0, total: 0 } },
    )
    vi.mocked(focus.get).mockResolvedValue(state)
    vi.mocked(tasks.get).mockImplementation(async (id: string) => taskWith(id, id === taskA.id ? items : []))
  }

  const card = () => screen.getByRole('timer').closest<HTMLElement>('[data-running]')!

  beforeEach(() => {
    localStorage.clear()
  })

  it('the focused card lists its subtasks with the counter', async () => {
    withSubtasks(four())
    renderFocus()

    expect(await within(await screen.findByRole('timer').then(() => card())).findByText('Subtasks')).toBeInTheDocument()
    const inCard = within(card())
    expect(inCard.getByText('1/4')).toBeInTheDocument()
    expect(inCard.getByRole('progressbar', { name: 'Subtasks' })).toHaveAttribute('aria-valuenow', '25')
    expect(inCard.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual([
      'Write the cases',
      'Drop at the end',
      'Move by keyboard',
      'Announce the position',
    ])
    expect(inCard.getByRole('checkbox', { name: 'Write the cases' })).toHaveAttribute('aria-checked', 'true')
    expect(inCard.getByRole('textbox', { name: 'New subtask' })).toBeInTheDocument()
    // Under the title and the timer, past a line.
    const section = inCard.getByText('Subtasks').closest('.border-t')!
    expect(screen.getByRole('timer').compareDocumentPosition(section) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('ticking a subtask in focus updates the counter', async () => {
    withSubtasks(four())
    let answer!: (subtask: Subtask) => void
    vi.mocked(subtasks.update).mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { user, queryClient } = renderFocus()
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
    await screen.findByText('Drop at the end')

    await user.click(within(card()).getByRole('checkbox', { name: 'Drop at the end' }))

    // At once, before the server answers: struck through, the bar and the counter moved.
    expect(subtasks.update).toHaveBeenCalledWith('s2', { done: true })
    expect(within(card()).getByText('2/4')).toBeInTheDocument()
    expect(within(card()).getByRole('progressbar', { name: 'Subtasks' })).toHaveAttribute('aria-valuenow', '50')
    expect(within(card()).getByText('Drop at the end')).toHaveClass('line-through')

    // Once answered, the board and the focus read the counts again.
    const reads = vi.mocked(focus.get).mock.calls.length
    vi.mocked(tasks.get).mockImplementation(async (id: string) =>
      taskWith(id, id === taskA.id ? four().map((item) => (item.id === 's2' ? { ...item, done: true } : item)) : []),
    )
    answer(sub('s2', 'Drop at the end', true, 1))
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: ['lists'] }))
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['focus'] })
    await waitFor(() => expect(vi.mocked(focus.get).mock.calls.length).toBeGreaterThan(reads))

    // Unticking strikes it back to normal.
    vi.mocked(subtasks.update).mockImplementation(() => new Promise(() => undefined))
    await waitFor(() => expect(within(card()).getByRole('checkbox', { name: 'Drop at the end' })).toHaveAttribute('aria-checked', 'true'))
    await user.click(within(card()).getByRole('checkbox', { name: 'Drop at the end' }))
    expect(subtasks.update).toHaveBeenLastCalledWith('s2', { done: false })
    expect(within(card()).getByText('1/4')).toBeInTheDocument()
    expect(within(card()).getByText('Drop at the end')).not.toHaveClass('line-through')
  })

  it('adding a subtask in focus appends it', async () => {
    withSubtasks(four())
    vi.mocked(subtasks.create).mockImplementation(() => new Promise(() => undefined))
    const { user } = renderFocus()
    await screen.findByText('Drop at the end')
    const field = within(card()).getByRole('textbox', { name: 'New subtask' })

    // Empty, or past 255 characters: the board list's errors, and nothing sent.
    await user.click(field)
    await user.keyboard('{Enter}')
    expect(within(card()).getByText('Enter a title')).toBeInTheDocument()
    // The long titles are pasted: typed one key at a time they took past the 5 s limit on CI, and
    // the keys still pending then landed in the next test.
    await user.paste('x'.repeat(256))
    await user.keyboard('{Enter}')
    expect(within(card()).getByText('Use at most 255 characters')).toBeInTheDocument()
    expect(subtasks.create).not.toHaveBeenCalled()

    await user.clear(field)
    await user.type(field, 'Check the widget{Enter}')

    expect(subtasks.create).toHaveBeenCalledWith(taskA.id, 'Check the widget')
    expect(within(card()).getAllByRole('checkbox').at(-1)).toHaveAttribute('aria-label', 'Check the widget')
    expect(within(card()).getByText('1/5')).toBeInTheDocument()

    // 255 characters are fine.
    await user.click(field)
    await user.paste('y'.repeat(255))
    await user.keyboard('{Enter}')
    expect(subtasks.create).toHaveBeenLastCalledWith(taskA.id, 'y'.repeat(255))
  })

  it('a task without subtasks shows only Add subtask', async () => {
    withSubtasks([])
    const { user } = renderFocus()
    const add = await within(await screen.findByRole('timer').then(() => card())).findByRole('button', { name: 'Add subtask' })

    expect(within(card()).queryByText('Subtasks')).not.toBeInTheDocument()
    expect(within(card()).queryByRole('textbox', { name: 'New subtask' })).not.toBeInTheDocument()
    expect(within(card()).queryAllByRole('checkbox')).toEqual([])

    await user.click(add)
    expect(within(card()).getByRole('textbox', { name: 'New subtask' })).toHaveFocus()
  })

  it('all subtasks done offers Complete task', async () => {
    withSubtasks([sub('s1', 'Write the cases', true, 0), sub('s2', 'Drop at the end', true, 1)])
    vi.mocked(focus.send).mockResolvedValue(inOrder([taskB.id, taskC.id], paused({ task: taskB })))
    const { user } = renderFocus()

    const done = await within(await screen.findByRole('timer').then(() => card())).findByText('All done here.')
    expect(done).toBeInTheDocument()
    expect(within(card()).getByText('2/2')).toBeInTheDocument()
    expect(within(card()).getByRole('progressbar', { name: 'Subtasks' })).toHaveAttribute('aria-valuenow', '100')

    await user.click(within(card()).getByRole('button', { name: 'Complete task' }))
    await waitFor(() => expect(sent()).toEqual([expect.objectContaining({ type: 'complete', task_id: taskA.id })]))
  })

  it('more than five subtasks collapse behind Show all', async () => {
    const seven = [
      sub('s1', 'Done one', true, 0),
      sub('s2', 'Done two', true, 1),
      ...['Three', 'Four', 'Five', 'Six', 'Seven'].map((title, index) => sub(`p${index}`, title, false, index + 2)),
    ]
    // Seven subtasks, two done: a sixth pending one would be hidden too.
    seven.push(sub('p9', 'Eight', false, 9))
    withSubtasks(seven)
    const { user } = renderFocus()
    await screen.findByText('Three')

    const names = () => within(card()).getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))
    expect(names()).toEqual(['Three', 'Four', 'Five', 'Six', 'Seven'])
    await user.click(within(card()).getByRole('button', { name: 'Show all (8)' }))

    expect(names()).toEqual(['Done one', 'Done two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'])
    expect(within(card()).queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument()
  })

  it('a viewer sees the subtasks read-only', async () => {
    role.canWrite = false
    withSubtasks(four())
    renderFocus()
    await screen.findByText('Drop at the end')

    const boxes = within(card()).getAllByRole('checkbox')
    expect(boxes).toHaveLength(4)
    for (const box of boxes) expect(box).toBeDisabled()
    expect(within(card()).getByText('1/4')).toBeInTheDocument()
    expect(within(card()).queryByRole('textbox', { name: 'New subtask' })).not.toBeInTheDocument()
    expect(within(card()).queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument()
    expect(within(card()).queryByRole('button', { name: /^Rename / })).not.toBeInTheDocument()
  })

  it('a next task shows its subtask count', async () => {
    withSubtasks(four())
    renderFocus()
    await screen.findByText('DEV-1727')

    const item = (title: string) => within(screen.getByRole('list', { name: 'Next tasks' })).getByText(title).closest('li')!
    expect(within(item(taskB.title)).getByText('2 subtasks · 30min')).toBeInTheDocument()
    expect(within(item(taskC.title)).getByText('20min')).toBeInTheDocument()
    expect(item(taskC.title)).not.toHaveTextContent('subtask')
  })
})

describe('FocusPage notes of the task in focus (#33)', () => {
  /** B counting here, with A right after it in Today. */
  function bInFocus(): FocusState {
    const base = counting(deviceId(), paused({ task: taskB, today: { ...paused().today, tasks: [{ ...taskB, position: 0 }, { ...taskA, position: 1 }] } }))
    return { ...base, session: { ...base.session!, task_id: taskB.id } }
  }

  beforeEach(() => {
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId()))
    vi.mocked(tasks.get).mockImplementation(async (id: string) => ({ ...taskWith(id, []), notes: id === taskA.id ? '<p>Ask Ana</p>' : '' }))
    vi.mocked(tasks.update).mockImplementation(async (id: string, payload) => ({ ...taskWith(id, []), ...payload }) as Task)
  })

  const card = () => screen.getByRole('timer').closest<HTMLElement>('[data-running]')!

  async function openNotes(user: ReturnType<typeof renderFocus>['user']) {
    await screen.findByRole('button', { name: 'Pause' })
    // Under the subtasks, in the card.
    await user.click(await within(card()).findByRole('button', { name: /^Notes/ }))
    const field = await within(card()).findByRole('textbox', { name: 'Task notes' })
    await waitFor(() => expect(field).toHaveFocus())
    return field
  }

  it('changing the task in focus saves and closes the open notes', async () => {
    // Skip here: the editor is left for the button, and what it holds is saved for A.
    vi.mocked(focus.send).mockResolvedValue(bInFocus())
    const { user, unmount } = renderFocus()
    let field = await openNotes(user)
    placeCaretAtEnd(field)
    await user.paste(', then the chart')
    vi.mocked(focus.get).mockResolvedValue(bInFocus())
    await user.click(screen.getByRole('button', { name: 'Skip' }))

    await waitFor(() => expect(within(card()).getByText(taskB.title)).toBeInTheDocument())
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(taskA.id, { notes: '<p>Ask Ana, then the chart</p>' }))
    expect(tasks.update).toHaveBeenCalledTimes(1)
    expect(within(card()).queryByRole('textbox', { name: 'Task notes' })).not.toBeInTheDocument()
    unmount()

    // The task changes elsewhere (the widget's Skip) while the editor still has the focus here.
    vi.mocked(tasks.update).mockClear()
    vi.mocked(focus.get).mockResolvedValue(counting(deviceId()))
    const second = renderFocus()
    field = await openNotes(second.user)
    placeCaretAtEnd(field)
    await second.user.paste(', today')
    vi.mocked(focus.get).mockResolvedValue(bInFocus())
    await second.queryClient.invalidateQueries({ queryKey: ['focus', LIST] })

    await waitFor(() => expect(within(card()).getByText(taskB.title)).toBeInTheDocument())
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(taskA.id, { notes: '<p>Ask Ana, today</p>' }))
    expect(tasks.update).toHaveBeenCalledTimes(1)
    expect(within(card()).queryByRole('textbox', { name: 'Task notes' })).not.toBeInTheDocument()
    // The notes of B, closed, with nothing written.
    expect(within(card()).getByRole('button', { name: /^Notes/ })).toHaveAttribute('data-muted', 'true')
  })

  it('a second click on Notes closes the open notes for good, and saves what was written', async () => {
    const { user } = renderFocus()
    const button = () => within(card()).getByRole('button', { name: /^Notes/ })

    // Unchanged: the second click closes it, and it does not open again.
    await openNotes(user)
    await user.click(button())
    await waitFor(() => expect(within(card()).queryByRole('textbox', { name: 'Task notes' })).not.toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(within(card()).queryByRole('textbox', { name: 'Task notes' })).not.toBeInTheDocument()
    expect(button()).toHaveAttribute('aria-expanded', 'false')
    expect(tasks.update).not.toHaveBeenCalled()

    // Written: the second click saves it and closes it.
    const field = await openNotes(user)
    placeCaretAtEnd(field)
    await user.paste(', then the chart')
    await user.click(button())
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(taskA.id, { notes: '<p>Ask Ana, then the chart</p>' }))
    await waitFor(() => expect(within(card()).queryByRole('textbox', { name: 'Task notes' })).not.toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(within(card()).queryByRole('textbox', { name: 'Task notes' })).not.toBeInTheDocument()
  })

  it('without a change, a new task in focus sends no notes', async () => {
    const { user, queryClient } = renderFocus()
    await openNotes(user)
    vi.mocked(focus.get).mockResolvedValue(bInFocus())
    await queryClient.invalidateQueries({ queryKey: ['focus', LIST] })

    await waitFor(() => expect(within(card()).getByText(taskB.title)).toBeInTheDocument())
    expect(tasks.update).not.toHaveBeenCalled()
  })
})
