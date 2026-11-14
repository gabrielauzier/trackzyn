import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen, waitFor, within } from '@testing-library/react'
import { Route, Routes, useLocation } from 'react-router-dom'

import ListBoardPage from '@/pages/list-board'
import { cardFields, focus, groups, lists, tasks } from '@/lib/api'
import { deviceId } from '@/lib/focus/device-id'
import type { QueuedAction } from '@/lib/focus/queue'
import { play } from '@/lib/sounds/synth'
import { toast } from 'sonner'
import { i18n, renderWithProviders, PLAIN_TASK_FIELDS } from '@/test/utils'
import type { Board, FocusState, ListCard, Task, TaskCardView } from '@/types'

const state = vi.hoisted(() => ({ canWrite: true }))

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), board: vi.fn() },
  tasks: { move: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), remove: vi.fn(), duplicate: vi.fn(), moveToList: vi.fn(), skip: vi.fn() },
  subtasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  focus: { get: vi.fn(), send: vi.fn(), heartbeat: vi.fn() },
  cardFields: { get: vi.fn(), set: vi.fn() },
  groups: { move: vi.fn() },
  authHeaders: () => ({}),
}))
vi.mock('@/lib/sounds/synth', () => ({ play: vi.fn() }))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: state.canWrite }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }))

const WEEK = '11111111-1111-4111-8111-111111111111'
const WORK = '22222222-2222-4222-8222-222222222222'
const TODAY_TASK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const DONE_TASK = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const T2 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const T3 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function card(id: string, title: string, estimate: number | null = 60): TaskCardView {
  return { ...PLAIN_TASK_FIELDS, id, title, estimate_minutes: estimate, spent_seconds: 0, position: 0, subtasks: { done: 0, total: 0 }, created_via: null, scheduled_on: null, scheduled_time: null, series: null }
}

function boardOf(id: string, name: string): Board {
  return { groups: [],
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

const fullTask: Task = { ...PLAIN_TASK_FIELDS,
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
  created_via: null,
  scheduled_on: null,
  scheduled_time: null,
  series: null,
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
/** Moves a card one column from its "More actions" menu, where the arrows went. */
async function moveFromMenu(user: ReturnType<typeof renderBoard>['user'], scope: ReturnType<typeof within>, name: 'Move left' | 'Move right') {
  await user.click(scope.getByRole('button', { name: 'More actions' }))
  await user.click(await screen.findByRole('menuitem', { name }))
}

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
  vi.mocked(cardFields.get).mockResolvedValue({ hidden: [] })
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
    vi.mocked(lists.board).mockResolvedValue({ groups: [],
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

  it('moves a task dropped on the empty Backlog area to the end of Backlog', async () => {
    // The server answers the move by keeping the task in Backlog.
    let moved = false
    vi.mocked(tasks.move).mockImplementation(async () => {
      moved = true
      return { ...fullTask, column: 'backlog' }
    })
    vi.mocked(lists.board).mockImplementation(async () => {
      const board = boardOf(WEEK, 'Week')
      if (!moved) return board
      board.columns.backlog.tasks = [card(TODAY_TASK, 'DEV-1725')]
      board.columns.today.tasks = []
      return board
    })
    layOutColumns()
    const { user } = renderBoard()

    await screen.findByText('DEV-1725')
    document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!.focus()
    await user.keyboard(' ')
    // The first step lands on the Today column itself; This week and Backlog are empty,
    // so the next two land on their column areas.
    await user.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}')
    await user.keyboard(' ')

    await waitFor(() =>
      expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'backlog', before_task_id: null }),
    )
    expect(tasks.move).toHaveBeenCalledTimes(1)
    const backlog = document.querySelector<HTMLElement>('[data-column="backlog"]')!
    expect(await within(backlog).findByText('DEV-1725')).toBeInTheDocument()
  })

  it('moves a task dropped on the empty This week area to the end of This week', async () => {
    // The server answers the move by keeping the task in This week.
    let moved = false
    vi.mocked(tasks.move).mockImplementation(async () => {
      moved = true
      return { ...fullTask, column: 'this_week' }
    })
    vi.mocked(lists.board).mockImplementation(async () => {
      const board = boardOf(WEEK, 'Week')
      if (!moved) return board
      board.columns.this_week.tasks = [card(TODAY_TASK, 'DEV-1725')]
      board.columns.today.tasks = []
      return board
    })
    layOutColumns()
    const { user } = renderBoard()

    await screen.findByText('DEV-1725')
    document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!.focus()
    await user.keyboard(' ')
    // The first step lands on the Today column itself; This week is empty, so the next lands on its area.
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    await user.keyboard(' ')

    await waitFor(() =>
      expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'this_week', before_task_id: null }),
    )
    expect(tasks.move).toHaveBeenCalledTimes(1)
    const thisWeek = document.querySelector<HTMLElement>('[data-column="this_week"]')!
    expect(await within(thisWeek).findByText('DEV-1725')).toBeInTheDocument()
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
    const reopenedTitle = await within(today).findByRole('button', { name: 'DEV-1724' })
    const reopenedCard = reopenedTitle.closest<HTMLElement>('[data-task-id]')!
    expect(within(reopenedCard).queryByLabelText('Completed')).not.toBeInTheDocument()
    expect(within(reopenedCard).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(reopenedTitle).not.toHaveClass('line-through')
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

  describe('quick actions of a card', () => {
    const inToday = () => within(document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!)

    it('moves the card one column to the left or right from its menu', async () => {
      const { user } = renderBoard()
      await screen.findByText('DEV-1725')

      await moveFromMenu(user, inToday(), 'Move left')
      await waitFor(() =>
        expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'this_week', before_task_id: null }),
      )

      await moveFromMenu(user, inToday(), 'Move right')
      await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'done', before_task_id: null }))
    })

    it('keeps the move arrows in the menu, not on the card, and turns off the one past the edge', async () => {
      const { user } = renderBoard()
      await screen.findByText('DEV-1725')

      // The card keeps only the subtasks, the notes and the menu.
      expect(inToday().queryByRole('button', { name: 'Move left' })).not.toBeInTheDocument()
      expect(inToday().queryByRole('button', { name: 'Move right' })).not.toBeInTheDocument()
      await user.click(inToday().getByRole('button', { name: 'More actions' }))
      const items = (await screen.findAllByRole('menuitem')).map((item) => item.textContent?.trim())
      // First in the menu, before changing the list.
      expect(items.slice(0, 3)).toEqual(['Move left', 'Move right', 'Change list'])
      expect(screen.getByRole('menuitem', { name: 'Move left' })).not.toHaveAttribute('aria-disabled')
      await user.keyboard('{Escape}')

      // Done is the last column: nothing to its right.
      const done = within(document.querySelector<HTMLElement>('[data-column="done"]')!)
      await user.click(done.getAllByRole('button', { name: 'More actions' })[0]!)
      expect(await screen.findByRole('menuitem', { name: 'Move right' })).toHaveAttribute('aria-disabled', 'true')
      expect(screen.getByRole('menuitem', { name: 'Move left' })).not.toHaveAttribute('aria-disabled')
    })

    it('shows the subtasks and the notes of the card', async () => {
      vi.mocked(tasks.get).mockResolvedValue({ ...fullTask, notes: '<p>Ask Ana</p>' })
      const { user } = renderBoard()
      await screen.findByText('DEV-1725')

      await user.click(inToday().getByRole('button', { name: 'Show notes' }))

      expect(await screen.findByRole('textbox', { name: 'Notes' })).toHaveTextContent('Ask Ana')
      await user.click(screen.getByRole('button', { name: 'Close notes' }))
      expect(screen.queryByRole('textbox', { name: 'Notes' })).not.toBeInTheDocument()
    })

    it('US-1 schedules the card from Agendar and shows the new badge without reloading the page', async () => {
      // Wednesday 2026-11-11, 14:07 in Sao Paulo, the board's timezone.
      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2026-11-11T17:07:00Z'))
      try {
        vi.mocked(tasks.update).mockResolvedValue({ ...fullTask, scheduled_on: '2026-11-12' })
        const { user } = renderBoard()
        await screen.findByText('DEV-1725')
        expect(inToday().queryByTitle('Thu, Nov 12')).not.toBeInTheDocument()
        const scheduled = boardOf(WEEK, 'Week')
        scheduled.columns.today.tasks = [{ ...card(TODAY_TASK, 'DEV-1725'), scheduled_on: '2026-11-12' }]
        vi.mocked(lists.board).mockResolvedValue(scheduled)

        await user.click(inToday().getByRole('button', { name: 'More actions' }))
        ;(await screen.findByRole('menuitem', { name: 'Schedule' })).focus()
        await user.keyboard('{ArrowRight}')
        await user.click(await screen.findByRole('menuitemcheckbox', { name: /^Tomorrow/ }))

        await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(TODAY_TASK, { scheduled_on: '2026-11-12' }))
        expect(await inToday().findByTitle('Thu, Nov 12')).toHaveTextContent('Tomorrow')
      } finally {
        vi.useRealTimers()
      }
    })

    it('US-12 skips an occurrence of a series from the menu', async () => {
      const rule = { freq: 'weekly' as const, interval: 1, weekdays: [5], month_day: null, until: null, count: null }
      const repeating = boardOf(WEEK, 'Week')
      repeating.columns.today.tasks = [
        { ...card(TODAY_TASK, 'DEV-1725'), scheduled_on: '2026-11-13', series: { id: 'series-1', rule, next_on: '2026-11-20' } },
      ]
      vi.mocked(lists.board).mockResolvedValue(repeating)
      vi.mocked(tasks.skip).mockResolvedValue(fullTask)
      const { user } = renderBoard()
      await screen.findByText('DEV-1725')

      await user.click(inToday().getByRole('button', { name: 'More actions' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Skip this occurrence' }))

      await waitFor(() => expect(tasks.skip).toHaveBeenCalledWith(TODAY_TASK))
    })

    describe('US-12 the question of a series', () => {
      const rule = { freq: 'weekly' as const, interval: 1, weekdays: [5], month_day: null, until: null, count: null }
      const withCard = (series: TaskCardView['series']) => {
        const board = boardOf(WEEK, 'Week')
        board.columns.today.tasks = [{ ...card(TODAY_TASK, 'DEV-1725'), scheduled_on: '2026-11-13', scheduled_time: '10:00', series }]
        vi.mocked(lists.board).mockResolvedValue(board)
      }
      const openSchedule = async (user: ReturnType<typeof renderBoard>['user']) => {
        await screen.findByText('DEV-1725')
        await user.click(inToday().getByRole('button', { name: 'More actions' }))
        ;(await screen.findByRole('menuitem', { name: 'Schedule' })).focus()
        await user.keyboard('{ArrowRight}')
      }

      beforeEach(() => {
        // Wednesday 2026-11-11, 14:07 in Sao Paulo, the board's timezone.
        vi.useFakeTimers({ toFake: ['Date'] })
        vi.setSystemTime(new Date('2026-11-11T17:07:00Z'))
        vi.mocked(tasks.update).mockResolvedValue(fullTask)
        vi.mocked(tasks.remove).mockResolvedValue(undefined)
      })
      afterEach(() => vi.useRealTimers())

      it('asks before a new day of an occurrence and sends the scope chosen', async () => {
        withCard({ id: 'series-1', rule, next_on: '2026-11-20' })
        const { user } = renderBoard()
        await openSchedule(user)
        await user.click(await screen.findByRole('menuitemcheckbox', { name: /^Tomorrow/ }))

        const question = await screen.findByRole('dialog', { name: 'Change a repeating task' })
        expect(tasks.update).not.toHaveBeenCalled()
        await user.click(within(question).getByRole('button', { name: /^This and the next ones/ }))

        await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(TODAY_TASK, { scheduled_on: '2026-11-12', scope: 'series' }))
      })

      it('saves nothing when the question is cancelled', async () => {
        withCard({ id: 'series-1', rule, next_on: '2026-11-20' })
        const { user } = renderBoard()
        await openSchedule(user)
        await user.click(await screen.findByRole('menuitemcheckbox', { name: /^Tomorrow/ }))
        const question = await screen.findByRole('dialog', { name: 'Change a repeating task' })
        await user.click(within(question).getByRole('button', { name: 'Cancel' }))

        await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change a repeating task' })).not.toBeInTheDocument())
        expect(tasks.update).not.toHaveBeenCalled()
      })

      it('does not ask for a task without a series', async () => {
        withCard(null)
        const { user } = renderBoard()
        await openSchedule(user)
        await user.click(await screen.findByRole('menuitemcheckbox', { name: /^Tomorrow/ }))

        await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(TODAY_TASK, { scheduled_on: '2026-11-12' }))
        expect(screen.queryByRole('dialog', { name: 'Change a repeating task' })).not.toBeInTheDocument()
      })

      it('asks how to delete an occurrence and sends the scope chosen', async () => {
        withCard({ id: 'series-1', rule, next_on: '2026-11-20' })
        const { user } = renderBoard()
        await screen.findByText('DEV-1725')
        await user.click(inToday().getByRole('button', { name: 'More actions' }))
        await user.click(await screen.findByRole('menuitem', { name: 'Delete task' }))

        const question = await screen.findByRole('dialog', { name: 'Delete a repeating task' })
        expect(within(question).getByRole('button', { name: /^Delete this one only/ })).toHaveTextContent('Fri, Nov 20')
        expect(tasks.remove).not.toHaveBeenCalled()
        await user.click(within(question).getByRole('button', { name: /^Delete this one only/ }))

        await waitFor(() => expect(tasks.remove).toHaveBeenCalledWith(TODAY_TASK, 'occurrence'))
      })
    })

    it('duplicates the card from the more actions menu', async () => {
      vi.mocked(tasks.duplicate).mockResolvedValue(fullTask)
      const { user } = renderBoard()
      await screen.findByText('DEV-1725')

      await user.click(inToday().getByRole('button', { name: 'More actions' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Duplicate' }))

      await waitFor(() => expect(tasks.duplicate).toHaveBeenCalledWith(TODAY_TASK))
    })

    it('changes the list of the card, offering only the other lists', async () => {
      vi.mocked(tasks.moveToList).mockResolvedValue({ ...fullTask, list_id: WORK })
      const { user } = renderBoard()
      await screen.findByText('DEV-1725')

      await user.click(inToday().getByRole('button', { name: 'More actions' }))
      // The submenu opens with the arrow key, as Radix's own pointer logic needs real pointer travel.
      ;(await screen.findByRole('menuitem', { name: 'Change list' })).focus()
      await user.keyboard('{ArrowRight}')

      expect(screen.queryByRole('menuitem', { name: 'Week' })).not.toBeInTheDocument()
      const work = await screen.findByRole('menuitem', { name: 'Work' })
      work.focus()
      await user.keyboard('{Enter}')

      await waitFor(() => expect(tasks.moveToList).toHaveBeenCalledWith(TODAY_TASK, WORK))
    })

    it('asks for confirmation before deleting the card', async () => {
      vi.mocked(tasks.remove).mockResolvedValue(undefined)
      const { user } = renderBoard()
      await screen.findByText('DEV-1725')

      await user.click(inToday().getByRole('button', { name: 'More actions' }))
      await user.click(await screen.findByRole('menuitem', { name: 'Delete task' }))

      const confirm = await screen.findByRole('dialog', { name: 'Delete task' })
      expect(tasks.remove).not.toHaveBeenCalled()
      await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

      await waitFor(() => expect(tasks.remove).toHaveBeenCalledWith(TODAY_TASK))
    })

    it('gives a viewer the subtasks and the notes, but no moving, duplicating or deleting', async () => {
      state.canWrite = false
      renderBoard()
      await screen.findByText('DEV-1725')

      expect(inToday().getByRole('button', { name: 'Show subtasks' })).toBeInTheDocument()
      expect(inToday().getByRole('button', { name: 'Show notes' })).toBeInTheDocument()
      expect(inToday().queryByRole('button', { name: 'Move left' })).not.toBeInTheDocument()
      expect(inToday().queryByRole('button', { name: 'More actions' })).not.toBeInTheDocument()
    })
  })

  it('Move right from the menu of a Today card completes the task and plays the sound once', async () => {
    const { user } = renderBoard()
    await screen.findByText('DEV-1725')
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    const card = document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!
    await moveFromMenu(user, within(card), 'Move right')

    await waitFor(() =>
      expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'done', before_task_id: null }),
    )
    expect(tasks.move).toHaveBeenCalledTimes(1)
    expect(vi.mocked(play).mock.calls).toEqual([['complete']])
  })

  it('dropping on Done completes the task', async () => {
    layOutColumns()
    const { user } = renderBoard()

    await screen.findByText('DEV-1725')
    document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!.focus()
    await user.keyboard(' ')
    await user.keyboard('{ArrowRight}')
    await user.keyboard(' ')

    await waitFor(() =>
      expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'done', before_task_id: null }),
    )
    expect(tasks.move).toHaveBeenCalledTimes(1)
    expect(focus.send).not.toHaveBeenCalled()
    expect(vi.mocked(play).mock.calls).toEqual([['complete']])
  })

  it('a task completed on the board shows at the top of today in Done', async () => {
    const todayDate = new Date().toLocaleDateString('en-CA')
    const EARLIER = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    let completed = false
    // The move stays pending until released, so what shows first is the board's own update.
    let release: () => void = () => {}
    vi.mocked(tasks.move).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            completed = true
            resolve({ ...fullTask, column: 'done' })
          }
        }),
    )
    vi.mocked(lists.board).mockImplementation(async () => {
      const board = boardOf(WEEK, 'Week')
      const earlier = card(EARLIER, 'DEV-1700')
      if (completed) {
        // The server lists today's completions latest first.
        board.columns.today.tasks = []
        board.columns.done.days = [
          { date: todayDate, tasks: [card(TODAY_TASK, 'DEV-1725'), earlier] },
          ...board.columns.done.days,
        ]
      } else {
        board.columns.done.days = [{ date: todayDate, tasks: [earlier] }, ...board.columns.done.days]
      }
      return board
    })
    const { user } = renderBoard()
    await screen.findByText('DEV-1700')

    const doneTitles = () => {
      const done = document.querySelector<HTMLElement>('[data-column="done"]')!
      return within(within(done).getAllByRole('group')[0]).getAllByRole('button', { name: /^DEV-/ }).map((b) => b.textContent)
    }
    expect(doneTitles()).toEqual(['DEV-1700'])

    const today = document.querySelector<HTMLElement>(`[data-column="today"] [data-task-id="${TODAY_TASK}"]`)!
    await moveFromMenu(user, within(today), 'Move right')

    // At once, before the server answers.
    await waitFor(() => expect(doneTitles()).toEqual(['DEV-1725', 'DEV-1700']))
    expect(tasks.move).toHaveBeenCalledTimes(1)

    // And still on top once the board reloads.
    release()
    await waitFor(() => expect(lists.board).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(doneTitles()).toEqual(['DEV-1725', 'DEV-1700']))
  })

  it('a failed estimate save restores it and shows the API error', async () => {
    let rejectSave: (error: unknown) => void = () => {}
    vi.mocked(tasks.update).mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject
        }),
    )
    const { user } = renderBoard()
    await screen.findByText('DEV-1725')
    const inCard = () => within(document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!)

    await user.click(inCard().getByRole('button', { name: 'Edit estimate' }))
    const field = inCard().getByRole('textbox', { name: 'Edit estimate' })
    expect(field).toHaveValue('01:00')
    await user.clear(field)
    await user.type(field, '0130{Enter}')

    expect(tasks.update).toHaveBeenCalledWith(TODAY_TASK, { estimate_minutes: 90 })
    // The new value shows while the save is on its way.
    await waitFor(() => expect(inCard().getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('1hr 30min'))
    expect(screen.getByText('This list has 1 pending task, Est.: 1hr 30min')).toBeInTheDocument()

    rejectSave({ response: { status: 422, data: { detail: 'Estimate is out of range' } } })

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Estimate is out of range'))
    await waitFor(() => expect(inCard().getByRole('button', { name: 'Edit estimate' })).toHaveTextContent(/^1hr$/))
    expect(screen.getByText('This list has 1 pending task, Est.: 1hr')).toBeInTheDocument()
  })

  it('WAIT-04 an estimate edited on the card leaves a waiting task out of the sums, before the refetch', async () => {
    // The save never answers, so only the sums made on the client show.
    vi.mocked(tasks.update).mockImplementation(() => new Promise(() => {}))
    vi.mocked(lists.board).mockImplementation(async () => {
      const board = boardOf(WEEK, 'Week')
      board.columns.today.tasks = [card(TODAY_TASK, 'DEV-1725'), { ...card(T2, 'Aguardando o deploy', 120), waiting: true }]
      board.pending = { count: 2, estimate_minutes: 60 }
      return board
    })
    const { user } = renderBoard()
    await screen.findByText('DEV-1725')
    const inCard = within(document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!)

    await user.click(inCard.getByRole('button', { name: 'Edit estimate' }))
    const field = inCard.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(field)
    await user.type(field, '0130{Enter}')

    expect(await screen.findByText('This list has 2 pending tasks, Est.: 1hr 30min')).toBeInTheDocument()
    const header = (column: string) => within(document.querySelector<HTMLElement>(`[data-column="${column}"]`)!).getByTitle('Pending estimate')
    expect(header('today')).toHaveTextContent(/^1hr 30min$/)
    expect(header('this_week')).toHaveTextContent(/^1hr 30min$/)
  })

  it('saves an estimate edited on the card and updates the totals', async () => {
    // The server keeps the new estimate and sums it again.
    let saved = false
    vi.mocked(tasks.update).mockImplementation(async () => {
      saved = true
      return { ...fullTask, estimate_minutes: 90 }
    })
    vi.mocked(lists.board).mockImplementation(async () => {
      const board = boardOf(WEEK, 'Week')
      if (!saved) return board
      board.columns.today.tasks = [card(TODAY_TASK, 'DEV-1725', 90)]
      board.columns.today.estimate_minutes = 90
      board.pending.estimate_minutes = 90
      return board
    })
    const { user } = renderBoard()
    await screen.findByText('DEV-1725')
    const inCard = within(document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!)

    await user.click(inCard.getByRole('button', { name: 'Edit estimate' }))
    const field = inCard.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(field)
    await user.type(field, '0130{Enter}')

    expect(tasks.update).toHaveBeenCalledWith(TODAY_TASK, { estimate_minutes: 90 })
    expect(await screen.findByText('This list has 1 pending task, Est.: 1hr 30min')).toBeInTheDocument()
    const today = document.querySelector<HTMLElement>('[data-column="today"]')!
    expect(within(today).getByTitle('Pending estimate')).toHaveTextContent('1hr 30min')
    expect(within(today).getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('1hr 30min')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
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

  it('open-without-starting navigates to the focus screen with start false', async () => {
    Object.defineProperty(window, 'trackzyn', {
      value: { isDesktop: true, windowRole: 'main', onWidgetState: vi.fn(() => () => undefined), collapseFocus: vi.fn(), notifyFocusChanged: vi.fn() },
      configurable: true,
    })
    try {
      function FocusProbe() {
        const { state, pathname } = useLocation()
        return <p>Focus page {pathname} {JSON.stringify(state)}</p>
      }
      const { user } = renderWithProviders(
        <Routes>
          <Route path="/lists/:listId" element={<ListBoardPage />} />
          <Route path="/focus/:listId" element={<FocusProbe />} />
        </Routes>,
        { route: `/lists/${WEEK}` },
      )

      await user.click(await screen.findByRole('button', { name: 'Open focus without starting the timer' }))

      expect(await screen.findByText(`Focus page /focus/${WEEK} {"start":false}`)).toBeInTheDocument()
      expect(focus.send).not.toHaveBeenCalled()
      expect(window.trackzyn!.collapseFocus).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(window, 'trackzyn')
    }
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

    await screen.findByText('DEV-1725')
    const card = document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!
    await moveFromMenu(user, within(card), 'Move right')

    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(TODAY_TASK, { column: 'done', before_task_id: null }))
    expect(focus.send).not.toHaveBeenCalled()
    expect(vi.mocked(play).mock.calls).toEqual([['complete']])
  })

  it('completes the task in focus through focus, so the next task of Today starts (Edge Case, FOCUS-08, SOUND-01)', async () => {
    vi.mocked(focus.get).mockResolvedValue(focusState(true))
    const { user } = renderBoard()
    await screen.findByRole('timer', { name: 'Time in focus' })

    const card = document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!
    await moveFromMenu(user, within(card), 'Move right')

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

  it('a writer sees the grab cursor on a task card, and the grabbing one while dragging it', async () => {
    layOutColumns()
    const { user } = renderBoard()

    await screen.findByText('DEV-1725')
    const wrapper = document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!
    expect(wrapper).toHaveClass('cursor-grab')
    // The title opens the task: it shows the pointer, not the grab hand.
    expect(within(wrapper).getByRole('button', { name: 'DEV-1725' })).toHaveClass('cursor-pointer')

    wrapper.focus()
    await user.keyboard(' ')
    // The card that follows the pointer is the grabbed one, with the accent border.
    const overlay = await waitFor(() => {
      const copies = document.querySelectorAll<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)
      expect(copies.length).toBe(2)
      return copies[1]
    })
    expect(overlay).toHaveClass('cursor-grabbing')
    expect(overlay.querySelector('[data-slot="card"]')).toHaveClass('border-primary')
    await user.keyboard('{Escape}')
  })

  it('a clicked task card keeps the accent border, through its own buttons and menu, until a click outside the cards', async () => {
    const { user } = renderBoard()

    await screen.findByText('DEV-1725')
    const wrapperOf = (id: string) => document.querySelector<HTMLElement>(`[data-column] [data-task-id="${id}"]`)!
    const selected = (id: string) => wrapperOf(id).querySelector('[data-slot="card"]')!.classList.contains('border-primary')
    expect(selected(TODAY_TASK)).toBe(false)

    // A button inside the card selects it, and the border stays after the click.
    await user.click(within(wrapperOf(TODAY_TASK)).getByRole('button', { name: 'Show subtasks' }))
    expect(selected(TODAY_TASK)).toBe(true)

    // Its menu opens outside the card: a click in it keeps the card selected.
    await user.click(within(wrapperOf(TODAY_TASK)).getByRole('button', { name: 'More actions' }))
    await user.click(await screen.findByRole('menuitem', { name: 'Change list' }))
    expect(selected(TODAY_TASK)).toBe(true)
    await user.keyboard('{Escape}{Escape}')
    expect(selected(TODAY_TASK)).toBe(true)

    // Another card takes the selection.
    await user.click(within(wrapperOf(DONE_TASK)).getByRole('button', { name: 'Show notes' }))
    expect(selected(DONE_TASK)).toBe(true)
    expect(selected(TODAY_TASK)).toBe(false)

    // A click outside every card clears it.
    await user.click(document.body)
    expect(selected(DONE_TASK)).toBe(false)
  })

  it('a task card reached with the keyboard is selected too', async () => {
    renderBoard()

    await screen.findByText('DEV-1725')
    const wrapper = document.querySelector<HTMLElement>(`[data-column] [data-task-id="${TODAY_TASK}"]`)!
    act(() => wrapper.focus())
    expect(wrapper.querySelector('[data-slot="card"]')).toHaveClass('border-primary')
  })

  it('lets a viewer neither drag, add nor complete', async () => {
    state.canWrite = false
    renderBoard()

    await screen.findByText('DEV-1725')
    const wrapper = document.querySelector<HTMLElement>(`[data-task-id="${TODAY_TASK}"]`)!
    expect(wrapper).not.toHaveAttribute('aria-roledescription')
    expect(wrapper).not.toHaveAttribute('tabindex')
    // Nothing to pick up, so no grab cursor.
    expect(wrapper.className).not.toMatch(/(^|\s)cursor-grab/)
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(wrapper).queryByRole('button', { name: 'Move right' })).not.toBeInTheDocument()
    expect(within(wrapper).queryByRole('button', { name: 'Edit estimate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
  })

  it('goes back home when the list does not exist', async () => {
    vi.mocked(lists.board).mockRejectedValue({ response: { status: 404, data: { detail: 'Not found' } } })
    renderBoard()

    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })
})

describe('ListBoardPage card fields (FIELDS-02, FIELDS-04)', () => {
  it('the gear of the board bar turns Prazo off: the due chips leave the board without reading it again', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      vi.mocked(lists.board).mockImplementation(async () => {
        const board = boardOf(WEEK, 'Week')
        board.columns.today.tasks = [{ ...card(TODAY_TASK, 'DEV-1725'), due_on: '2026-12-20', priority: 'high' }]
        return board
      })
      vi.mocked(cardFields.set).mockResolvedValue({ hidden: ['due'] })
      const { user } = renderBoard()
      expect(await screen.findByText('Prazo 20 dez')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Campos do card' }))
      const due = await screen.findByRole('switch', { name: 'Prazo' })
      await waitFor(() => expect(due).toBeEnabled())
      await user.click(due)

      expect(cardFields.set).toHaveBeenCalledWith(WEEK, ['due'])
      await waitFor(() => expect(screen.queryByText('Prazo 20 dez')).not.toBeInTheDocument())
      // The other fields stay on, and the board was read only once.
      expect(screen.getByRole('img', { name: 'Prioridade alta' })).toBeInTheDocument()
      expect(lists.board).toHaveBeenCalledTimes(1)
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('FIELDS-04 the fields hidden on the server stay hidden on the cards of the list', async () => {
    vi.mocked(cardFields.get).mockResolvedValue({ hidden: ['priority'] })
    vi.mocked(lists.board).mockImplementation(async () => {
      const board = boardOf(WEEK, 'Week')
      board.columns.today.tasks = [{ ...card(TODAY_TASK, 'DEV-1725'), priority: 'high', flagged: true, flag_reason: 'Blocked' }]
      return board
    })
    renderBoard()

    expect(await screen.findByText('Blocked')).toBeInTheDocument()
    await waitFor(() => expect(cardFields.get).toHaveBeenCalledWith(WEEK))
    await waitFor(() => expect(screen.queryByRole('img', { name: 'High priority' })).not.toBeInTheDocument())
  })
})

describe('ListBoardPage group containers and their drags (GRP-04, GRP-06..10)', () => {
  const G1 = '33333333-3333-4333-8333-333333333333'
  const A1 = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'
  const A2 = 'a2a2a2a2-a2a2-4a2a-8a2a-a2a2a2a2a2a2'
  const LOOSE = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
  const PIPELINE = { id: G1, name: 'Pipeline', priority: 'none' as const, due_on: null }
  // Today: the block of Pipeline (A1, A2), then a loose task.
  const rows = [A1, A2, LOOSE]

  function groupBoard(): Board {
    const board = boardOf(WEEK, 'Week')
    board.groups = [PIPELINE]
    board.columns.today.tasks = [
      { ...card(A1, 'Step 1'), group_id: G1 },
      { ...card(A2, 'Step 2'), group_id: G1 },
      card(LOOSE, 'Loose'),
    ]
    board.columns.done.days = []
    return board
  }

  /** Columns in a row, Today's cards stacked, the container around its two cards and its title on top. */
  function layOutGroupBoard() {
    const columns = ['backlog', 'this_week', 'today', 'done']
    const original = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.dataset.column) return DOMRect.fromRect({ x: columns.indexOf(this.dataset.column) * 300, y: 0, width: 280, height: 600 })
      if (this.dataset.groupTitle) return DOMRect.fromRect({ x: 610, y: 60, width: 260, height: 30 })
      if (this.dataset.groupId) return DOMRect.fromRect({ x: 605, y: 60, width: 270, height: 230 })
      const row = rows.indexOf(this.dataset.taskId ?? '')
      if (row >= 0) return DOMRect.fromRect({ x: 610, y: 100 + row * 100, width: 260, height: 80 })
      return original.call(this)
    })
  }

  const focusCard = (id: string) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!.focus()

  beforeEach(() => {
    vi.mocked(lists.board).mockImplementation(async () => groupBoard())
    vi.mocked(groups.move).mockResolvedValue({ tasks: [], group_without_next_action: null })
  })

  it('GRP-04 draws the group as a container with its count around its cards, the loose task outside', async () => {
    renderBoard()

    const container = await screen.findByRole('group', { name: 'Group Pipeline' })
    expect(within(container).getByText('2 tasks')).toBeInTheDocument()
    expect(within(container).getByRole('button', { name: 'Step 1' })).toBeInTheDocument()
    expect(within(container).getByRole('button', { name: 'Step 2' })).toBeInTheDocument()
    expect(within(container).queryByRole('button', { name: 'Loose' })).not.toBeInTheDocument()
  })

  it('GRP-06 a task dropped on a card of its own container keeps the group', async () => {
    layOutGroupBoard()
    const { user } = renderBoard()
    await screen.findByRole('group', { name: 'Group Pipeline' })

    focusCard(A1)
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')

    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(A1, { column: 'today', before_task_id: LOOSE, group_id: G1 }))
  })

  it('GRP-07 a task of the group dropped on a loose card leaves the group', async () => {
    layOutGroupBoard()
    const { user } = renderBoard()
    await screen.findByRole('group', { name: 'Group Pipeline' })

    focusCard(A2)
    await user.keyboard(' ')
    await user.keyboard('{ArrowDown}')
    await user.keyboard(' ')

    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(A2, { column: 'today', before_task_id: null, group_id: null }))
  })

  it('GRP-08 a loose task dropped on a card of the container enters the group, at that place', async () => {
    layOutGroupBoard()
    const { user } = renderBoard()
    await screen.findByRole('group', { name: 'Group Pipeline' })

    focusCard(LOOSE)
    await user.keyboard(' ')
    await user.keyboard('{ArrowUp}')
    await user.keyboard(' ')

    await waitFor(() => expect(tasks.move).toHaveBeenCalledWith(LOOSE, { column: 'today', before_task_id: A2, group_id: G1 }))
  })

  it('GRP-09 the title drags the whole container to another column', async () => {
    layOutGroupBoard()
    const { user } = renderBoard()
    const container = await screen.findByRole('group', { name: 'Group Pipeline' })

    within(container).getByRole('button', { name: /^Pipeline/ }).focus()
    await user.keyboard(' ')
    // The first step lands on the Today column itself, the second on This week.
    await user.keyboard('{ArrowLeft}{ArrowLeft}')
    await user.keyboard(' ')

    await waitFor(() => expect(groups.move).toHaveBeenCalledWith(G1, { from: 'today', to: 'this_week', before_task_id: null }))
    expect(tasks.move).not.toHaveBeenCalled()
  })

  it('a viewer cannot drag the container', async () => {
    state.canWrite = false
    renderBoard()
    const container = await screen.findByRole('group', { name: 'Group Pipeline' })

    expect(within(container).queryByRole('button', { name: /^Pipeline/ })).not.toBeInTheDocument()
  })

  it('GRP-10 a move that leaves the group without a next action says so, and Adicionar tarefa creates a task in it', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      vi.mocked(tasks.move).mockResolvedValue({ ...fullTask, group_without_next_action: { id: G1, name: 'Pipeline' } })
      vi.mocked(tasks.create).mockResolvedValue({ ...fullTask, group_id: G1 })
      const { user } = renderBoard()
      const container = await screen.findByRole('group', { name: 'Grupo Pipeline' })

      await user.click(within(container).getAllByRole('button', { name: 'Mais ações' })[0]!)
      await user.click(await screen.findByRole('menuitem', { name: 'Mover para a direita' }))

      await waitFor(() => expect(toast.info).toHaveBeenCalledTimes(1))
      const [message, options] = vi.mocked(toast.info).mock.calls[0]!
      expect(message).toBe('Pipeline está sem próxima ação')
      const action = (options as { action: { label: string; onClick: () => void } }).action
      expect(action.label).toBe('Adicionar tarefa')

      act(() => action.onClick())
      const dialog = await screen.findByRole('dialog', { name: 'Adicionar tarefa · Pipeline' })
      await user.type(within(dialog).getByLabelText('Título'), 'Next step')
      await user.click(within(dialog).getByRole('button', { name: 'Adicionar' }))

      await waitFor(() =>
        expect(tasks.create).toHaveBeenCalledWith({ list_id: WEEK, title: 'Next step', estimate_minutes: null, column: 'backlog', group_id: G1 }),
      )
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Adicionar tarefa · Pipeline' })).not.toBeInTheDocument())
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('GRP-10 a move that leaves a next action shows no toast', async () => {
    vi.mocked(tasks.move).mockResolvedValue({ ...fullTask, group_without_next_action: null })
    const { user } = renderBoard()
    const container = await screen.findByRole('group', { name: 'Group Pipeline' })

    await moveFromMenu(user, within(within(container).getAllByRole('button', { name: 'Step 1' })[0]!.closest<HTMLElement>('[data-task-id]')!), 'Move right')

    await waitFor(() => expect(tasks.move).toHaveBeenCalled())
    expect(toast.info).not.toHaveBeenCalled()
  })
})
