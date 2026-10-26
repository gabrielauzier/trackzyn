import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'

import ListBoardPage from '@/pages/list-board'
import { focus, lists, tasks } from '@/lib/api'
import { deviceId } from '@/lib/focus/device-id'
import type { QueuedAction } from '@/lib/focus/queue'
import { play } from '@/lib/sounds/synth'
import { i18n, renderWithProviders } from '@/test/utils'
import type { Board, FocusState, ListCard, Task, TaskCardView } from '@/types'

const state = vi.hoisted(() => ({ canWrite: true }))

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), board: vi.fn() },
  tasks: { move: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn() },
  subtasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
  authHeaders: () => ({}),
}))
vi.mock('@/lib/sounds/synth', () => ({ play: vi.fn() }))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: state.canWrite }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const WEEK = '11111111-1111-4111-8111-111111111111'
const WORK = '22222222-2222-4222-8222-222222222222'
const TODAY_TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DONE_TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const T2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const T3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function card(id: string, title: string, estimate: number | null = 60): TaskCardView {
  return { id, title, estimate_minutes: estimate, spent_seconds: 0, position: 0, subtasks: { done: 0, total: 0 } }
}

function boardOf(id: string, name: string): Board {
  return {
    list: { id, name, color: 3 },
    timezone: 'America/Sao_Paulo',
    pending: { count: 1, estimate_minutes: 60 },
    columns: {
      backlog: { tasks: [], estimate_minutes: 0 },
      this_week: { tasks: [], estimate_minutes: 60, done: 11, total: 12 },
      today: { tasks: [card(TODAY_TASK, 'DEV-1725')], estimate_minutes: 60, done: 0, total: 1 },
      done: { today_count: 0, days: [{ date: '2026-10-22', tasks: [card(DONE_TASK, 'DEV-1724')] }] },
    },
  }
}

function listCard(id: string, name: string, position: number): ListCard {
  return {
    id,
    workspace_id: 'ws',
    name,
    color: position + 1,
    position,
    is_archived: false,
    created_by_user_id: null,
    created_at: '2026-10-24T10:00:00Z',
    pending_count: 0,
    preview: [],
  }
}

const fullTask: Task = {
  id: TODAY_TASK,
  list_id: WEEK,
  title: 'DEV-1725',
  notes: '',
  estimate_minutes: 60,
  column: 'today',
  position: 0,
  completed_at: null,
  created_at: '2026-10-24T10:00:00Z',
  subtasks: [],
}

function renderBoard(listId = WEEK) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<p>Home page</p>} />
      <Route path="/lists/:listId" element={<ListBoardPage />} />
      <Route path="/focus/:listId" element={<p>Focus page</p>} />
    </Routes>,
    { route: `/lists/${listId}` },
  )
}

function mockMatchMedia(matches: boolean) {
  vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList,
  )
}

/**
 * jsdom has no layout: lay the four columns out in a row so the keyboard
 * sensor can find the column to the left or right.
 */
function layOutColumns(todayStack: string[] = [TODAY_TASK]) {
  const columns = ['backlog', 'this_week', 'today', 'done']
  const taskColumn: Record<string, string> = { [DONE_TASK]: 'done' }
  const taskRow: Record<string, number> = {}
  todayStack.forEach((id, row) => {
    taskColumn[id] = 'today'
    taskRow[id] = row
  })
  const original = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const column = this.dataset.column
    if (column) return DOMRect.fromRect({ x: columns.indexOf(column) * 300, y: 0, width: 280, height: 600 })
    const id = this.dataset.taskId ?? ''
    const owner = taskColumn[id]
    if (owner) {
      const y = 100 + (taskRow[id] ?? 0) * 100
      return DOMRect.fromRect({ x: columns.indexOf(owner) * 300 + 10, y, width: 260, height: 80 })
    }
    return original.call(this)
  })
}

/** Today holds T1, T2 and T3; the server keeps whatever order the last move asked for. */
function mockTodayOfThree() {
  let order = [TODAY_TASK, T2, T3]
  const titles: Record<string, string> = { [TODAY_TASK]: 'DEV-1725', [T2]: 'DEV-1726', [T3]: 'DEV-1727' }
  vi.mocked(tasks.move).mockImplementation(async (id, { before_task_id }) => {
    order = order.filter((other) => other !== id)
    order.splice(before_task_id ? order.indexOf(before_task_id) : order.length, 0, id)
    return { ...fullTask, id, title: titles[id] }
  })
  vi.mocked(lists.board).mockImplementation(async () => {
    const board = boardOf(WEEK, 'Week')
    board.columns.today.tasks = order.map((id) => card(id, titles[id]))
    board.columns.today.total = 3
    return board
  })
  layOutColumns([TODAY_TASK, T2, T3])
}

function todayTitles() {
  const today = document.querySelector<HTMLElement>('[data-column="today"]')!
  return Array.from(today.querySelectorAll<HTMLElement>('[data-task-id]')).map(
    (task) => within(task).getByRole('button', { name: /^DEV-/ }).textContent,
  )
}

const focusTask = { id: TODAY_TASK, title: 'DEV-1725', estimate_minutes: 60, spent_seconds: 0, awaiting_extend: false }

/** The focus of the list: nothing running, or this user's session counting on DEV-1725. */
function focusState(counting: boolean): FocusState {
  const now = new Date()
  return {
    server_now: now.toISOString(),
    session: counting
      ? {
          id: 'session-1',
          kind: 'task',
          task_id: TODAY_TASK,
          list_id: WEEK,
          device_id: deviceId(),
          started_at: now.toISOString(),
          deadline_at: new Date(now.getTime() + 3000_000).toISOString(),
          planned_seconds: null,
        }
      : null,
    task: focusTask,
    today: { pending: 1, done: 0, estimate_minutes: 60, tasks: [{ ...focusTask, position: 0 }] },
    stale: null,
  }
}

const focusActions = () => vi.mocked(focus.send).mock.calls.map(([entry]) => (entry as QueuedAction).action)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(focus.get).mockResolvedValue(focusState(false))
  vi.mocked(focus.send).mockResolvedValue({ ...focusState(false), task: null, today: { pending: 0, done: 1, estimate_minutes: 0, tasks: [] } })
  state.canWrite = true
  vi.mocked(lists.board).mockImplementation(async (id: string) =>
    id === WORK ? boardOf(WORK, 'Work') : boardOf(WEEK, 'Week'),
  )
  vi.mocked(lists.list).mockResolvedValue({
    timezone: 'America/Sao_Paulo',
    lists: [listCard(WEEK, 'Week', 0), listCard(WORK, 'Work', 1)],
  })
  vi.mocked(tasks.move).mockResolvedValue(fullTask)
  vi.mocked(tasks.get).mockResolvedValue(fullTask)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('ListBoardPage', () => {
  it('shows Back, the list selector, the summary and the four columns in order', async () => {
    renderBoard()

    const selector = await screen.findByRole('button', { name: 'Week' })
    const badge = within(selector).getByText('W')
    expect(badge).toHaveAttribute('data-slot', 'list-badge')
    expect(badge.style.backgroundColor).toBe('var(--chart-3)')
    expect(screen.getByRole('link', { name: 'Back' })).toHaveAttribute('href', '/')
    expect(screen.getByText('This list has 1 pending task, Est.: 1hr')).toBeInTheDocument()
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual([
      'Backlog',
      'This week',
      'Today',
      'Done',
    ])
    expect(lists.board).toHaveBeenCalledWith(WEEK)
  })

  it('shows an empty list as all clear in Portuguese', async () => {
    vi.mocked(lists.board).mockResolvedValue({
      list: { id: WEEK, name: 'Week', color: 3 },
      timezone: 'America/Sao_Paulo',
      pending: { count: 0, estimate_minutes: 0 },
      columns: {
        backlog: { tasks: [], estimate_minutes: 0 },
        this_week: { tasks: [], estimate_minutes: 0, done: 0, total: 0 },
        today: { tasks: [], estimate_minutes: 0, done: 0, total: 0 },
        done: { today_count: 0, days: [] },
      },
    })
    await i18n.changeLanguage('pt-BR')
    try {
      renderBoard()

      expect(await screen.findByText('Esta lista tem 0 tarefas pendentes, Est.: 0min')).toBeInTheDocument()
      const column = (name: string) => document.querySelector<HTMLElement>(`[data-column="${name}"]`)!
      for (const [name, heading] of [
        ['backlog', 'Backlog'],
        ['this_week', 'Esta semana'],
        ['today', 'Hoje'],
      ]) {
        expect(within(column(name)).getByRole('heading', { name: heading })).toBeInTheDocument()
        expect(within(column(name)).getByText('Tudo limpo')).toBeInTheDocument()
      }
      expect(within(column('done')).getByRole('heading', { name: 'Concluídas' })).toBeInTheDocument()
      expect(within(column('done')).getByText('0 tarefas hoje')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('numbers the Today cards from 1 in column order', async () => {
    const board = boardOf(WEEK, 'Week')
    board.columns.today.tasks = [card(TODAY_TASK, 'DEV-1725'), card('t2', 'DEV-1726'), card('t3', 'DEV-1727')]
    vi.mocked(lists.board).mockResolvedValue(board)
    renderBoard()

    await screen.findByText('DEV-1727')
    const today = document.querySelector<HTMLElement>('[data-column="today"]')!
    const numbered = Array.from(today.querySelectorAll<HTMLElement>('[data-task-id]')).map((task) => [
      within(task).getByTitle('Order in Today').textContent,
      within(task).getByRole('button', { name: /^DEV-/ }).textContent,
    ])
    expect(numbered).toEqual([
      ['1', 'DEV-1725'],
      ['2', 'DEV-1726'],
      ['3', 'DEV-1727'],
    ])
  })

  it('moves a task dragged to Done into done', async () => {
    layOutColumns()
    const { user } = renderBoard()

    await screen.findByText('DEV-1725')
    const today = document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!
    today.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')
    await user.keyboard(' ')

    await waitFor(() =>
      expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'done', before_task_id: null }),
    )
  })

  it('previews a task dragged over Done there, and puts it back on cancel', async () => {
    layOutColumns()
    const { user } = renderBoard()

    await screen.findByText('DEV-1725')
    const inColumn = (column: string) =>
      document.querySelector(`[data-column="${column}"] [data-task-id="${TODAY_TASK}"]`)
    document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')

    await waitFor(() => expect(inColumn('done')).not.toBeNull())
    expect(inColumn('today')).toBeNull()
    expect(tasks.move).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(inColumn('today')).not.toBeNull())
    expect(inColumn('done')).toBeNull()
    expect(tasks.move).not.toHaveBeenCalled()
  })

  it('moves a task dragged out of Done back to a pending column', async () => {
    // The server answers the move by reopening the task in Today.
    let reopened = false
    vi.mocked(tasks.move).mockImplementation(async () => {
      reopened = true
      return { ...fullTask, id: DONE_TASK, title: 'DEV-1724' }
    })
    vi.mocked(lists.board).mockImplementation(async () => {
      const board = boardOf(WEEK, 'Week')
      if (!reopened) return board
      board.columns.today.tasks.unshift(card(DONE_TASK, 'DEV-1724'))
      board.columns.done.days = []
      return board
    })
    layOutColumns()
    const { user } = renderBoard()

    await screen.findByText('DEV-1724')
    document.querySelector<HTMLElement>(`[data-task-id="${DONE_TASK}"]`)!.focus()
    await user.keyboard(' ')
    // The first step lands on the Done column itself, the second on the Today card.
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    await user.keyboard(' ')

    await waitFor(() =>
      expect(tasks.move).toHaveBeenCalledWith(DONE_TASK, { column: 'today', before_task_id: TODAY_TASK }),
    )
    const today = document.querySelector<HTMLElement>('[data-column="today"]')!
    const check = await within(today).findByRole('checkbox', { name: 'Complete DEV-1724' })
    expect(check).toHaveAttribute('aria-checked', 'false')
    expect(check).toBeEnabled()
    expect(within(today).getByRole('button', { name: 'DEV-1724' })).not.toHaveClass('line-through')
    const done = document.querySelector<HTMLElement>('[data-column="done"]')!
    expect(within(done).queryByText('DEV-1724')).not.toBeInTheDocument()
  })

  it('previews the card in the column it is dragged over, and puts it back on cancel', async () => {
    layOutColumns()
    const { user } = renderBoard()

    await screen.findByText('DEV-1725')
    const inColumn = (column: string) =>
      document.querySelector(`[data-column="${column}"] [data-task-id="${DONE_TASK}"]`)
    document.querySelector<HTMLElement>(`[data-task-id="${DONE_TASK}"]`)!.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowLeft}{ArrowLeft}')

    await waitFor(() => expect(inColumn('today')).not.toBeNull())
    expect(inColumn('done')).toBeNull()
    expect(tasks.move).not.toHaveBeenCalled()

    await user.keyboard('{Escape}')

    await waitFor(() => expect(inColumn('done')).not.toBeNull())
    expect(inColumn('today')).toBeNull()
    expect(tasks.move).not.toHaveBeenCalled()
  })

  it('reorders a task one position down within Today', async () => {
    mockTodayOfThree()
    const { user } = renderBoard()

    await screen.findByText('DEV-1727')
    document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')

    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'today', before_task_id: T3 }))
    expect(tasks.move).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(todayTitles()).toEqual(['DEV-1726', 'DEV-1725', 'DEV-1727']))
  })

  it('reorders a task one position up within Today', async () => {
    mockTodayOfThree()
    const { user } = renderBoard()

    await screen.findByText('DEV-1727')
    document.querySelector<HTMLElement>(`[data-task-id="${T3}"]`)!.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowUp}')
    await user.keyboard(' ')

    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(T3, { column: 'today', before_task_id: T2 }))
    expect(tasks.move).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(todayTitles()).toEqual(['DEV-1725', 'DEV-1727', 'DEV-1726']))
  })

  it('completes a task from its check', async () => {
    const { user } = renderBoard()

    await user.click(await screen.findByRole('checkbox', { name: 'Complete DEV-1725' }))

    await waitFor(() =>
      expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'done', before_task_id: null }),
    )
  })

  it('goes to the focus page from Focus now (FOCUS-01)', async () => {
    const { user } = renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Focus now' }))

    expect(await screen.findByText('Focus page')).toBeInTheDocument()
  })

  it('Focus now asks the focus page to go on to the widget (WIDGET-01)', async () => {
    function FocusProbe() {
      const { state } = useLocation()
      return <p>Focus page {JSON.stringify(state)}</p>
    }
    const { user } = renderWithProviders(
      <Routes>
        <Route path="/lists/:listId" element={<ListBoardPage />} />
        <Route path="/focus/:listId" element={<FocusProbe />} />
      </Routes>,
      { route: `/lists/${WEEK}` },
    )

    await user.click(await screen.findByRole('button', { name: 'Focus now' }))

    expect(await screen.findByText('Focus page {"collapse":true}')).toBeInTheDocument()
  })

  it('highlights the card in focus with its time running (FOCUS-16)', async () => {
    vi.mocked(focus.get).mockResolvedValue(focusState(true))
    renderBoard()

    const timer = await screen.findByRole('timer', { name: 'Time in focus' })
    const wrapper = document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!
    expect(wrapper).toContainElement(timer)
    expect(timer.textContent).toMatch(/^00:(50:00|49:5\d)$/)
    expect(wrapper.querySelector('[data-slot="card"]')).toHaveClass('border-2', 'border-primary')
    const done = document.querySelector<HTMLElement>(`[data-task-id="${DONE_TASK}"] [data-slot="card"]`)!
    expect(done).not.toHaveClass('border-primary')
  })

  it('completes a task out of focus with a move and plays the completion sound once (SOUND-01)', async () => {
    const { user } = renderBoard()

    await user.click(await screen.findByRole('checkbox', { name: 'Complete DEV-1725' }))

    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'done', before_task_id: null }))
    expect(focus.send).not.toHaveBeenCalled()
    expect(vi.mocked(play).mock.calls).toEqual([['complete']])
  })

  it('completes the task in focus through focus, so the next task of Today starts (Edge Case, FOCUS-08, SOUND-01)', async () => {
    vi.mocked(focus.get).mockResolvedValue(focusState(true))
    const { user } = renderBoard()
    await screen.findByRole('timer', { name: 'Time in focus' })

    await user.click(screen.getByRole('checkbox', { name: 'Complete DEV-1725' }))

    await waitFor(() => expect(focusActions()).toHaveLength(1))
    expect(focusActions()[0]).toMatchObject({ type: 'complete', task_id: TODAY_TASK, list_id: WEEK })
    expect(tasks.move).not.toHaveBeenCalled()
    expect(vi.mocked(play).mock.calls).toEqual([['complete']])
  })

  it('completes the task in focus through focus when it is dragged to Done (Edge Case, FOCUS-08)', async () => {
    vi.mocked(focus.get).mockResolvedValue(focusState(true))
    layOutColumns()
    const { user } = renderBoard()
    await screen.findByRole('timer', { name: 'Time in focus' })

    document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')
    await user.keyboard(' ')

    await waitFor(() => expect(focusActions()).toHaveLength(1))
    expect(focusActions()[0]).toMatchObject({ type: 'complete', task_id: TODAY_TASK })
    expect(tasks.move).not.toHaveBeenCalled()
    expect(vi.mocked(play).mock.calls).toEqual([['complete']])
  })

  it('switches to another list from the selector without going home', async () => {
    const { user } = renderBoard()

    await user.click(await screen.findByRole('button', { name: 'Week' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Work' }))

    expect(await screen.findByRole('button', { name: 'Work' })).toBeInTheDocument()
    expect(lists.board).toHaveBeenLastCalledWith(WORK)
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()
  })

  it('shows one column at a time with tabs below 768px', async () => {
    mockMatchMedia(true)
    const { user } = renderBoard()

    const tablist = await screen.findByRole('tablist')
    expect(within(tablist).getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Backlog',
      'This week',
      'Today',
      'Done',
    ])
    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Today'])

    await user.click(within(tablist).getByRole('tab', { name: 'Backlog' }))

    expect(screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)).toEqual(['Backlog'])
  })

  it('shows all four columns side by side from 768px', async () => {
    mockMatchMedia(false)
    renderBoard()

    await screen.findByText('DEV-1725')
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('opens the task dialog from a card', async () => {
    const { user } = renderBoard()

    await user.click(await screen.findByRole('button', { name: 'DEV-1725' }))

    expect(await screen.findByRole('dialog', { name: 'Edit task' })).toBeInTheDocument()
    expect(tasks.get).toHaveBeenCalledWith(TODAY_TASK)
  })

  it('lets a viewer neither drag, add nor complete', async () => {
    state.canWrite = false
    renderBoard()

    await screen.findByText('DEV-1725')
    const wrapper = document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!
    expect(wrapper).not.toHaveAttribute('aria-roledescription')
    expect(wrapper).not.toHaveAttribute('tabindex')
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Complete DEV-1725' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
  })

  it('goes back home when the list does not exist', async () => {
    vi.mocked(lists.board).mockRejectedValue({ response: { status: 404, data: { detail: 'Not found' } } })
    renderBoard()

    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })
})
