import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'

import FocusWidgetPage from '@/pages/focus-widget'
import { focus, subtasks, tasks } from '@/lib/api'
import { deviceId } from '@/lib/focus/device-id'
import type { QueuedAction } from '@/lib/focus/queue'
import type { TrackzynApi } from '@/lib/platform'
import { play } from '@/lib/sounds/synth'
import { renderWithProviders, selectContents } from '@/test/utils'
import type { FocusState, Subtask, Task } from '@/types'

vi.mock('@/lib/api', () => ({
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
  tasks: { get: vi.fn(), update: vi.fn() },
  subtasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn() },
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: true }),
}))
vi.mock('@/lib/sounds/synth', () => ({ play: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }))

const LIST = '11111111-1111-4111-8111-111111111111'
const taskA = { id: 'task-a', title: 'DEV-1725', estimate_minutes: 60, spent_seconds: 0, awaiting_extend: false }
const taskB = { id: 'task-b', title: 'DEV-1726', estimate_minutes: 30, spent_seconds: 0, awaiting_extend: false }
const now = () => new Date().toISOString()

/** Today of the list with A and B pending, nothing running. */
function paused(overrides: Partial<FocusState> = {}): FocusState {
  return {
    server_now: now(),
    session: null,
    task: taskA,
    today: { pending: 2, done: 0, estimate_minutes: 90, tasks: [{ ...taskA, position: 0 }, { ...taskB, position: 1 }] },
    stale: null,
    ...overrides,
  }
}

/** Task A counting on this device, with an hour left. */
function counting(base: FocusState = paused()): FocusState {
  return {
    ...base,
    server_now: now(),
    session: {
      id: 'session-1',
      kind: 'task',
      task_id: taskA.id,
      list_id: LIST,
      device_id: deviceId(),
      started_at: now(),
      deadline_at: new Date(Date.now() + 3600_000).toISOString(),
      planned_seconds: null,
    },
  }
}

const empty: FocusState = { server_now: now(), session: null, task: null, today: { pending: 0, done: 0, estimate_minutes: 0, tasks: [] }, stale: null }

let focusChanged: (() => void) | null
function installWidgetBridge() {
  focusChanged = null
  const bridge = {
    isDesktop: true,
    windowRole: 'widget',
    expandFocus: vi.fn(async () => undefined),
    resizeWidget: vi.fn(async () => undefined),
    notifyFocusChanged: vi.fn(),
    onFocusChanged: vi.fn((callback: () => void) => {
      focusChanged = callback
      return () => undefined
    }),
    onWidgetState: vi.fn(() => () => undefined),
    reportFocusState: vi.fn(),
    onPauseRequest: vi.fn(() => () => undefined),
  }
  Object.defineProperty(window, 'trackzyn', { value: bridge as unknown as TrackzynApi, configurable: true })
  return bridge
}

const sent = () => vi.mocked(focus.send).mock.calls.map(([entry]) => (entry as QueuedAction).action)

function renderWidget() {
  const result = renderWithProviders(<FocusWidgetPage />, { route: '/widget' })
  const hover = async () => result.user.hover(await screen.findByRole('group', { name: 'Focus widget' }))
  return { ...result, hover }
}

let bridge: ReturnType<typeof installWidgetBridge>

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  bridge = installWidgetBridge()
  vi.mocked(focus.get).mockImplementation(async () => counting())
  vi.mocked(focus.send).mockResolvedValue(paused())
  vi.mocked(focus.heartbeat).mockResolvedValue(counting())
})

afterEach(() => {
  Reflect.deleteProperty(window, 'trackzyn')
  localStorage.clear()
})

describe('FocusWidgetPage', () => {
  it('shows the task of the open session and its timer, without a list to start from', async () => {
    renderWidget()

    expect(await screen.findByText('DEV-1725')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent(/^(00:59:\d\d|01:00:00)$/)
    expect(focus.get).toHaveBeenCalledWith(undefined)
  })

  it('opened on a paused task, reads the list of the last focus screen', async () => {
    localStorage.setItem('trackzyn.focus.list', LIST)
    // Paused after 10 minutes on it: Resume (a task that never counted reads Start, #14).
    const counted = { ...taskA, spent_seconds: 600 }
    vi.mocked(focus.get).mockResolvedValue(paused({ task: counted, today: { ...paused().today, tasks: [{ ...counted, position: 0 }, { ...taskB, position: 1 }] } }))
    const { hover } = renderWidget()

    expect(await screen.findByText('DEV-1725')).toBeInTheDocument()
    expect(focus.get).toHaveBeenCalledWith(LIST)
    await hover()
    expect(screen.getByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('pausing applies the pause and then tells the main window (WIDGET-12, WIDGET-22)', async () => {
    // The server answers the pause with the time A counted (a task that never counted reads Start, #14).
    const counted = { ...taskA, spent_seconds: 600 }
    vi.mocked(focus.send).mockResolvedValue(paused({ task: counted, today: { ...paused().today, tasks: [{ ...counted, position: 0 }, { ...taskB, position: 1 }] } }))
    const { user, hover } = renderWidget()
    await screen.findByText('DEV-1725')
    await hover()
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    await waitFor(() => expect(bridge.notifyFocusChanged).toHaveBeenCalledTimes(1))
    expect(sent()).toEqual([expect.objectContaining({ type: 'pause', list_id: LIST })])
    expect(await screen.findByRole('button', { name: 'Resume' })).toBeInTheDocument()
  })

  it('completing plays the completion sound here and tells the main window (SOUND-01, WIDGET-23)', async () => {
    const { user, hover } = renderWidget()
    await screen.findByText('DEV-1725')
    await hover()
    await user.click(screen.getByRole('button', { name: 'Complete' }))

    expect(vi.mocked(play).mock.calls).toEqual([['complete']])
    expect(sent()).toEqual([expect.objectContaining({ type: 'complete', task_id: taskA.id })])
    await waitFor(() => expect(bridge.notifyFocusChanged).toHaveBeenCalledTimes(1))
  })

  it('a change from the main window reads the focus again, without reloading (WIDGET-22)', async () => {
    renderWidget()
    await screen.findByText('DEV-1725')
    const reads = vi.mocked(focus.get).mock.calls.length
    vi.mocked(focus.get).mockResolvedValue(paused({ task: { ...taskA, title: 'DEV-1725 renamed' } }))

    act(() => focusChanged!())

    expect(await screen.findByText('DEV-1725 renamed')).toBeInTheDocument()
    expect(vi.mocked(focus.get).mock.calls.length).toBe(reads + 1)
  })

  it('a task that left Today closes the widget onto the board (WIDGET-17)', async () => {
    renderWidget()
    await screen.findByText('DEV-1725')
    vi.mocked(focus.get).mockResolvedValue(paused({ task: taskB, today: { pending: 1, done: 0, estimate_minutes: 30, tasks: [{ ...taskB, position: 0 }] } }))

    act(() => focusChanged!())

    await waitFor(() => expect(bridge.expandFocus.mock.calls).toEqual([['task_left']]))
  })

  it('completing the last task of Today keeps the widget open with All clear and Expand (WIDGET-16)', async () => {
    vi.mocked(focus.get).mockResolvedValue(counting(paused({ today: { pending: 1, done: 0, estimate_minutes: 60, tasks: [{ ...taskA, position: 0 }] } })))
    vi.mocked(focus.send).mockResolvedValue({ ...empty, today: { ...empty.today, done: 1 } })
    const { user, hover } = renderWidget()
    await screen.findByText('DEV-1725')
    await hover()
    await user.click(screen.getByRole('button', { name: 'Complete' }))

    expect(await screen.findByText('All clear')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Expand' })).toBeInTheDocument()
    expect(bridge.expandFocus).not.toHaveBeenCalled()
  })

  it('Expand brings the main window back to the focus screen (WIDGET-18)', async () => {
    const { user, hover } = renderWidget()
    await screen.findByText('DEV-1725')
    await hover()
    await user.click(screen.getByRole('button', { name: 'Expand' }))

    expect(bridge.expandFocus.mock.calls).toEqual([[undefined]])
  })

  it('saving the notes tells the main window, so its task dialog reads them again (WIDGET-15)', async () => {
    vi.mocked(tasks.get).mockResolvedValue({ id: taskA.id, notes: '' } as never)
    vi.mocked(tasks.update).mockResolvedValue({ id: taskA.id, notes: 'Numbers' } as never)
    const { user, hover } = renderWidget()
    await screen.findByText('DEV-1725')
    await hover()
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    const notes = await screen.findByRole('textbox', { name: 'Notes' })
    selectContents(notes)
    await user.paste('Numbers')
    await user.tab()

    await waitFor(() => expect(bridge.notifyFocusChanged).toHaveBeenCalledTimes(1))
    expect(tasks.update).toHaveBeenCalledWith(taskA.id, { notes: '<p>Numbers</p>' })
    expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument()
  })

  it('a second click on Notes closes the open notes for good, and saves what was written', async () => {
    vi.mocked(tasks.get).mockResolvedValue({ id: taskA.id, notes: '' } as never)
    vi.mocked(tasks.update).mockResolvedValue({ id: taskA.id, notes: 'Numbers' } as never)
    const { user, hover } = renderWidget()
    await screen.findByText('DEV-1725')
    await hover()

    // Unchanged: the second click closes it, and it does not open again.
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    await screen.findByRole('textbox', { name: 'Notes' })
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument()
    expect(tasks.update).not.toHaveBeenCalled()

    // Written: the second click saves it and closes it.
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    const notes = await screen.findByRole('textbox', { name: 'Notes' })
    selectContents(notes)
    await user.paste('Numbers')
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(taskA.id, { notes: '<p>Numbers</p>' }))
    await waitFor(() => expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument()
  })

  it('shows an action the server refused in the widget, grown for it (Edge Case, SYNC-07)', async () => {
    vi.mocked(focus.send).mockRejectedValue({ response: { status: 422, data: { code: 'invalid_time' } } })
    const { user, hover } = renderWidget()
    await screen.findByText('DEV-1725')
    await hover()
    await user.click(screen.getByRole('button', { name: 'Pause' }))

    expect(await screen.findByText('Actions refused by the server')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    await waitFor(() => expect(bridge.resizeWidget.mock.calls).toEqual([['notes']]))

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(screen.queryByText('Actions refused by the server')).not.toBeInTheDocument()
    await waitFor(() => expect(bridge.resizeWidget.mock.calls).toEqual([['notes'], ['compact']]))
  })

  it('says in the widget that an action older than 24h was dropped (Edge Case, SYNC-06)', async () => {
    const old = new Date(Date.now() - 25 * 3600_000).toISOString()
    localStorage.setItem(
      'trackzyn.focus.queue',
      JSON.stringify({ pending: [{ action_id: 'old-1', action: { type: 'pause', occurred_at: old, device_id: deviceId(), list_id: LIST } }], conflicts: [] }),
    )
    const { user } = renderWidget()

    expect(await screen.findByText('An action made offline more than 24h ago was discarded.')).toBeInTheDocument()
    expect(focus.send).not.toHaveBeenCalled()
    await waitFor(() => expect(bridge.resizeWidget.mock.calls).toEqual([['notes']]))

    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(screen.queryByText('An action made offline more than 24h ago was discarded.')).not.toBeInTheDocument()
  })

  it('reports nothing for the close dialog: the main window does (SYNC-08)', async () => {
    renderWidget()
    await screen.findByText('DEV-1725')

    expect(bridge.reportFocusState).not.toHaveBeenCalled()
    expect(bridge.onPauseRequest).not.toHaveBeenCalled()
  })
})

describe('FocusWidgetPage subtasks (#16)', () => {
  const items: Subtask[] = [
    { id: 's1', task_id: taskA.id, title: 'Write the cases', done: true, position: 0 },
    { id: 's2', task_id: taskA.id, title: 'Drop at the end', done: false, position: 1 },
  ]
  const withItems = (list: Subtask[]) => ({ id: taskA.id, title: taskA.title, notes: '', subtasks: list }) as unknown as Task

  beforeEach(() => {
    const withCounts = { ...taskA, subtasks: { done: 1, total: 2 } }
    vi.mocked(focus.get).mockImplementation(async () =>
      counting(paused({ task: withCounts, today: { ...paused().today, tasks: [{ ...withCounts, position: 0 }, { ...taskB, position: 1 }] } })),
    )
    vi.mocked(tasks.get).mockResolvedValue(withItems(items))
  })

  const panel = () => screen.queryByRole('region', { name: 'Subtasks' })

  it('the subtasks icon opens the subtask panel at the notes size', async () => {
    const { user, hover } = renderWidget()
    expect(await screen.findByText('1/2')).toBeInTheDocument()
    await hover()
    expect(bridge.resizeWidget).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Subtasks' }))

    // 300x240, the size of the notes panel, with the subtasks to tick under the controls.
    await waitFor(() => expect(bridge.resizeWidget.mock.calls).toEqual([['notes']]))
    const opened = await screen.findByRole('region', { name: 'Subtasks' })
    expect(await within(opened).findByRole('checkbox', { name: 'Drop at the end' })).toBeEnabled()
    expect(within(opened).getByRole('checkbox', { name: 'Write the cases' })).toHaveAttribute('aria-checked', 'true')
    expect(within(opened).getByText('Subtasks · 1/2')).toBeInTheDocument()
    // Only ticking: no field to add, nothing to rename, move or delete.
    expect(within(opened).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(opened).queryAllByRole('button')).toEqual([])
    const controls = screen.getByRole('group', { name: 'Focus widget' })
    expect(controls.compareDocumentPosition(opened) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Subtasks' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('notes and subtasks panels replace each other', async () => {
    const { user, hover } = renderWidget()
    await screen.findByText('1/2')
    await hover()

    await user.click(screen.getByRole('button', { name: 'Subtasks' }))
    expect(await screen.findByRole('region', { name: 'Subtasks' })).toBeInTheDocument()

    // Notes take the subtasks' place, at the same size.
    await user.click(screen.getByRole('button', { name: 'Notes' }))
    const notes = await screen.findByRole('textbox', { name: 'Notes' })
    expect(panel()).not.toBeInTheDocument()

    // And the subtasks take the notes' place again, from inside the notes field, the size kept the whole way.
    await user.click(notes)
    await user.click(screen.getByRole('button', { name: 'Subtasks' }))
    expect(await screen.findByRole('region', { name: 'Subtasks' })).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument()
    expect(bridge.resizeWidget.mock.calls.every((call) => (call as unknown[])[0] === 'notes')).toBe(true)

    // Closing the panel shrinks the widget back to 300x64.
    await user.click(screen.getByRole('button', { name: 'Subtasks' }))
    await waitFor(() => expect(panel()).not.toBeInTheDocument())
    expect(bridge.resizeWidget.mock.calls.at(-1)).toEqual(['compact'])
  })

  it('ticking a subtask in the widget tells the main window', async () => {
    let answer!: (subtask: Subtask) => void
    vi.mocked(subtasks.update).mockImplementation(() => new Promise((resolve) => (answer = resolve)))
    const { user, hover } = renderWidget()
    await screen.findByText('1/2')
    await hover()
    await user.click(screen.getByRole('button', { name: 'Subtasks' }))
    const opened = await screen.findByRole('region', { name: 'Subtasks' })

    await user.click(await within(opened).findByRole('checkbox', { name: 'Drop at the end' }))
    expect(subtasks.update).toHaveBeenCalledWith('s2', { done: true })
    expect(within(opened).getByText('Subtasks · 2/2')).toBeInTheDocument()
    expect(bridge.notifyFocusChanged).not.toHaveBeenCalled()

    // Answered: the main window is told, and the widget reads its counter again.
    const withCounts = { ...taskA, subtasks: { done: 2, total: 2 } }
    vi.mocked(focus.get).mockImplementation(async () =>
      counting(paused({ task: withCounts, today: { ...paused().today, tasks: [{ ...withCounts, position: 0 }, { ...taskB, position: 1 }] } })),
    )
    vi.mocked(tasks.get).mockResolvedValue(withItems(items.map((item) => ({ ...item, done: true }))))
    answer({ ...items[1]!, done: true })
    await waitFor(() => expect(bridge.notifyFocusChanged).toHaveBeenCalledTimes(1))
    expect(await screen.findByText('2/2')).toBeInTheDocument()
  })
})
