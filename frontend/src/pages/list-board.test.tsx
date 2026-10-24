import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'

import ListBoardPage from '@/pages/list-board'
import { lists, tasks } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'
import type { Board, ListCard, Task, TaskCardView } from '@/types'

const state = vi.hoisted(() => ({ canWrite: true }))

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), board: vi.fn() },
  tasks: { move: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn() },
  subtasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: state.canWrite }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const WEEK = '11111111-1111-4111-8111-111111111111'
const WORK = '22222222-2222-4222-8222-222222222222'
const TODAY_TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DONE_TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

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
function layOutColumns() {
  const columns = ['backlog', 'this_week', 'today', 'done']
  const taskColumn: Record<string, string> = { [TODAY_TASK]: 'today', [DONE_TASK]: 'done' }
  const original = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const column = this.dataset.column
    if (column) return DOMRect.fromRect({ x: columns.indexOf(column) * 300, y: 0, width: 280, height: 600 })
    const owner = taskColumn[this.dataset.taskId ?? '']
    if (owner) return DOMRect.fromRect({ x: columns.indexOf(owner) * 300 + 10, y: 100, width: 260, height: 80 })
    return original.call(this)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
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

    expect(await screen.findByRole('button', { name: 'Week' })).toBeInTheDocument()
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

  it('completes a task from its check', async () => {
    const { user } = renderBoard()

    await user.click(await screen.findByRole('checkbox', { name: 'Complete DEV-1725' }))

    await waitFor(() =>
      expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'done', before_task_id: null }),
    )
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
