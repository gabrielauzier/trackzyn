import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { BoardColumn, DoneColumn } from '@/components/board/board-column'
import { i18n, renderWithProviders, PLAIN_TASK_FIELDS } from '@/test/utils'
import type { TrackzynApi } from '@/lib/platform'
import type { Board, BoardProgressColumnView, TaskCardView } from '@/types'

vi.mock('@/lib/api', () => ({ tasks: { create: vi.fn() } }))

const LIST = '99999999-9999-4999-8999-999999999999'

function card(id: string, title: string, estimate: number | null = 60, group_id: string | null = null): TaskCardView {
  return { ...PLAIN_TASK_FIELDS, group_id, id, title, estimate_minutes: estimate, spent_seconds: 0, position: 0, subtasks: { done: 0, total: 0 }, created_via: null, scheduled_on: null, scheduled_time: null, series: null }
}

const renderTask = (task: TaskCardView) => <p key={task.id}>{task.title}</p>

function progressView(overrides: Partial<BoardProgressColumnView> = {}): BoardProgressColumnView {
  return { tasks: [], estimate_minutes: 0, done: 0, total: 0, ...overrides }
}

describe('BoardColumn', () => {
  it('shows All clear in a column without pending tasks', () => {
    renderWithProviders(
      <BoardColumn column="backlog" view={{ tasks: [], estimate_minutes: 0 }} listId={LIST} canWrite renderTask={renderTask} />,
    )

    expect(screen.getByRole('heading', { name: 'Backlog' })).toBeInTheDocument()
    expect(screen.getByText('All clear')).toBeInTheDocument()
    expect(screen.getByText('All clear').querySelector('svg')).toHaveClass('lucide-circle-check')
  })

  it('lists the tasks instead of All clear', () => {
    renderWithProviders(
      <BoardColumn
        column="backlog"
        view={{ tasks: [card('a', 'DEV-1725')], estimate_minutes: 60 }}
        listId={LIST}
        canWrite
        renderTask={renderTask}
      />,
    )

    expect(screen.getByText('DEV-1725')).toBeInTheDocument()
    expect(screen.queryByText('All clear')).not.toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows the pending estimate and the done/total bar in Today', () => {
    renderWithProviders(
      <BoardColumn
        column="today"
        view={progressView({ tasks: [card('a', 'DEV-1725')], estimate_minutes: 60, done: 0, total: 1 })}
        listId={LIST}
        canWrite
        renderTask={renderTask}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByTitle('Pending estimate')).toHaveTextContent('1hr')
    expect(screen.getByText('0/1 Done')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0')
  })

  it('shows the done/total bar in This week', () => {
    renderWithProviders(
      <BoardColumn
        column="this_week"
        view={progressView({ estimate_minutes: 60, done: 11, total: 12 })}
        listId={LIST}
        canWrite
        renderTask={renderTask}
      />,
    )

    expect(screen.getByRole('heading', { name: 'This week' })).toBeInTheDocument()
    expect(screen.getByText('11/12 Done')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '92')
  })

  it('enables Focus now while Today has a pending task', () => {
    renderWithProviders(
      <BoardColumn
        column="today"
        view={progressView({ tasks: [card('a', 'DEV-1725')], estimate_minutes: 60, total: 1 })}
        listId={LIST}
        canWrite
        renderTask={renderTask}
      />,
    )

    expect(screen.getByRole('button', { name: 'Focus now' })).toBeEnabled()
  })

  it('disables Focus now when Today has no pending task', () => {
    renderWithProviders(
      <BoardColumn column="today" view={progressView()} listId={LIST} canWrite renderTask={renderTask} />,
    )

    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
  })

  it('REM-05 disables Focus now when Today has only reminders, and enables it with one task among them', () => {
    const reminder = { ...card('r', 'Pagar o DAS', null), kind: 'reminder' as const }
    const { unmount } = renderWithProviders(
      <BoardColumn column="today" view={progressView({ tasks: [reminder], total: 1 })} listId={LIST} canWrite renderTask={renderTask} />,
    )
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
    unmount()

    renderWithProviders(
      <BoardColumn column="today" view={progressView({ tasks: [reminder, card('a', 'DEV-1725')], total: 2 })} listId={LIST} canWrite renderTask={renderTask} />,
    )
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeEnabled()
  })

  it('has Focus now only in Today', () => {
    renderWithProviders(
      <BoardColumn
        column="this_week"
        view={progressView({ tasks: [card('a', 'DEV-1725')], total: 1 })}
        listId={LIST}
        canWrite
        renderTask={renderTask}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Focus now' })).not.toBeInTheDocument()
  })

  it('offers Add task to a writer and nothing to a viewer', () => {
    const { unmount } = renderWithProviders(
      <BoardColumn column="backlog" view={{ tasks: [], estimate_minutes: 0 }} listId={LIST} canWrite renderTask={renderTask} />,
    )
    expect(screen.getByRole('button', { name: 'Add task' })).toBeInTheDocument()
    unmount()

    renderWithProviders(
      <BoardColumn
        column="today"
        view={progressView({ tasks: [card('a', 'DEV-1725')], total: 1 })}
        listId={LIST}
        canWrite={false}
        renderTask={renderTask}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Add task' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
  })
})

describe('BoardColumn open-without-starting (#14)', () => {
  const asDesktop = () =>
    Object.defineProperty(window, 'trackzyn', {
      value: { isDesktop: true, windowRole: 'main' } as unknown as TrackzynApi,
      configurable: true,
    })

  afterEach(() => {
    Reflect.deleteProperty(window, 'trackzyn')
  })

  const today = (tasks: TaskCardView[], canWrite = true, onOpenFocus = vi.fn()) =>
    renderWithProviders(
      <BoardColumn
        column="today"
        view={progressView({ tasks, estimate_minutes: 60, total: tasks.length })}
        listId={LIST}
        canWrite={canWrite}
        renderTask={renderTask}
        onFocusNow={vi.fn()}
        onOpenFocus={onOpenFocus}
      />,
    )

  it('desktop shows the open-without-starting button next to Focus now', async () => {
    asDesktop()
    const onOpenFocus = vi.fn()
    const { user } = today([card('a', 'DEV-1725')], true, onOpenFocus)

    const focusNow = screen.getByRole('button', { name: 'Focus now' })
    const open = screen.getByRole('button', { name: 'Open focus without starting the timer' })
    expect(open).toBeEnabled()
    // An icon button (the eye), on the same row as Focus now and to its right, with its height.
    expect(open.querySelector('svg')).toHaveClass('lucide-eye')
    expect(open).not.toHaveTextContent(/\S/)
    expect(open.parentElement).toBe(focusNow.parentElement)
    expect(focusNow.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(open).toHaveClass('size-9')
    expect(focusNow).toHaveClass('h-9')

    // The hint says the same as the label.
    await user.hover(open)
    expect((await screen.findAllByText('Open focus without starting the timer')).length).toBeGreaterThan(0)

    await user.click(open)
    expect(onOpenFocus).toHaveBeenCalledTimes(1)
  })

  it('browser has no open-without-starting button', () => {
    today([card('a', 'DEV-1725')])

    expect(screen.getByRole('button', { name: 'Focus now' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Open focus without starting the timer' })).not.toBeInTheDocument()
  })

  it('open-without-starting is disabled when Today is empty or read-only', () => {
    asDesktop()
    const { unmount } = today([])
    expect(screen.getByRole('button', { name: 'Open focus without starting the timer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
    unmount()

    today([card('a', 'DEV-1725')], false)
    expect(screen.getByRole('button', { name: 'Open focus without starting the timer' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
  })
})

describe('BoardColumn focus buttons at the top of Today', () => {
  const asDesktop = () =>
    Object.defineProperty(window, 'trackzyn', {
      value: { isDesktop: true, windowRole: 'main' } as unknown as TrackzynApi,
      configurable: true,
    })

  afterEach(() => {
    Reflect.deleteProperty(window, 'trackzyn')
  })

  const today = (tasks: TaskCardView[], canWrite = true) =>
    renderWithProviders(
      <BoardColumn
        column="today"
        view={progressView({ tasks, estimate_minutes: 60, done: 1, total: tasks.length + 1 })}
        listId={LIST}
        canWrite={canWrite}
        renderTask={renderTask}
        onFocusNow={vi.fn()}
        onOpenFocus={vi.fn()}
      />,
    )

  const follows = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)

  it('Today shows the focus buttons between the progress bar and the first task', () => {
    asDesktop()
    today([card('a', 'DEV-1725'), card('b', 'DEV-1726')])

    const progress = screen.getByRole('progressbar')
    const focusNow = screen.getByRole('button', { name: 'Focus now' })
    const eye = screen.getByRole('button', { name: 'Open focus without starting the timer' })
    const firstTask = screen.getByText('DEV-1725')
    expect(follows(progress, focusNow)).toBe(true)
    expect(follows(screen.getByText('1/3 Done'), focusNow)).toBe(true)
    expect(follows(focusNow, eye)).toBe(true)
    expect(follows(eye, firstTask)).toBe(true)
    // Nothing of the row is left at the foot of the column, after the tasks and Add task.
    expect(follows(focusNow, screen.getByRole('button', { name: 'Add task' }))).toBe(true)
    expect(screen.getAllByRole('button', { name: 'Focus now' })).toHaveLength(1)
    expect(focusNow.parentElement!.className).not.toMatch(/\bmt-auto\b/)
  })

  it('the focus buttons row sticks to the top while the column scrolls', () => {
    today([card('a', 'DEV-1725')])

    const row = screen.getByRole('button', { name: 'Focus now' }).closest<HTMLElement>('[data-slot="focus-buttons"]')!
    expect(row).not.toBeNull()
    expect(row).toHaveClass('sticky', 'z-10')
    // At the top of the scrolling area (below the app bar where the narrow layout has one).
    expect(row.className).toMatch(/(^|\s)top-\S+/)
    // The column's own background, opaque, and no line under it: nothing between the row and the
    // first card (2026-11-06, the user asked for the shadow to go).
    expect(row.className).toMatch(/(^|\s)bg-/)
    expect(row.className).not.toMatch(/(^|\s)(shadow|border)(-|\s|$)/)
    // Nor on the container that holds the buttons (the buttons keep their own outline).
    const inner = row.firstElementChild as HTMLElement
    expect(inner.className).not.toMatch(/(^|\s)(shadow|border)(-|\s|$)/)
    // The tasks scroll under it: they come after it, outside it.
    expect(row).not.toContainElement(screen.getByText('DEV-1725'))
  })

  it('focus buttons keep their disabled and desktop-only rules at the top', () => {
    asDesktop()
    const { unmount } = today([])
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open focus without starting the timer' })).toBeDisabled()
    // Still above the empty state, not at the foot.
    expect(follows(screen.getByRole('button', { name: 'Focus now' }), screen.getByText('All clear'))).toBe(true)
    unmount()

    const viewer = today([card('a', 'DEV-1725')], false)
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Open focus without starting the timer' })).toBeDisabled()
    viewer.unmount()

    const writer = today([card('a', 'DEV-1725')])
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Open focus without starting the timer' })).toBeEnabled()
    writer.unmount()

    Reflect.deleteProperty(window, 'trackzyn')
    today([card('a', 'DEV-1725')])
    expect(screen.getByRole('button', { name: 'Focus now' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Open focus without starting the timer' })).not.toBeInTheDocument()
  })
})

describe('DoneColumn', () => {
  const done: Board['columns']['done'] = {
    today_count: 0,
    days: [
      { date: '2026-10-22', tasks: [card('a', 'DEV-1724')] },
      { date: '2026-10-21', tasks: [card('b', 'DEV-1669'), card('c', 'DEV-1668'), card('d', 'CRED-7801')] },
    ],
  }

  it('groups the tasks by day with the day counters and the today counter', () => {
    renderWithProviders(<DoneColumn done={done} renderTask={renderTask} />)

    expect(screen.getByRole('heading', { name: 'Done' })).toBeInTheDocument()
    expect(screen.getByText('0 tasks today')).toBeInTheDocument()

    const groups = screen.getAllByRole('group')
    expect(groups).toHaveLength(2)
    expect(within(groups[0]).getByText('Thu, Oct 22, 2026')).toBeInTheDocument()
    expect(within(groups[0]).getByText('1 task')).toBeInTheDocument()
    expect(within(groups[0]).getByText('DEV-1724')).toBeInTheDocument()
    expect(within(groups[1]).getByText('Wed, Oct 21, 2026')).toBeInTheDocument()
    expect(within(groups[1]).getByText('3 tasks')).toBeInTheDocument()
    expect(within(groups[1]).getByText('CRED-7801')).toBeInTheDocument()
  })

  it('counts the tasks done today', () => {
    renderWithProviders(
      <DoneColumn done={{ today_count: 1, days: [{ date: '2026-10-24', tasks: [card('a', 'DEV-1724')] }] }} renderTask={renderTask} />,
    )

    expect(screen.getByText('1 task today')).toBeInTheDocument()
  })

  it('reads 0 tarefas hoje in Portuguese for an empty list', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<DoneColumn done={{ today_count: 0, days: [] }} renderTask={renderTask} />)

      expect(screen.getByRole('heading', { name: 'Concluídas' })).toBeInTheDocument()
      expect(screen.getByText('0 tarefas hoje')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})

describe('the group containers of the columns (GRP-04, GRP-05, EDGE-05)', () => {
  const GROUP = { id: 'g1', name: 'Pipeline', priority: 'none' as const, due_on: null }

  it('GRP-04 draws the group as a container with the column\'s count and its cards, in order, beside the loose tasks', () => {
    renderWithProviders(
      <BoardColumn
        column="this_week"
        view={progressView({ tasks: [card('a', 'Loose'), card('b', 'Step 1', 60, 'g1'), card('c', 'Step 2', 60, 'g1')] })}
        groups={[GROUP]}
        listId={LIST}
        canWrite
        renderTask={renderTask}
      />,
    )

    const container = screen.getByRole('group', { name: 'Group Pipeline' })
    expect(within(container).getByText('2 tasks')).toBeInTheDocument()
    expect(within(container).getAllByText(/^Step/).map((step) => step.textContent)).toEqual(['Step 1', 'Step 2'])
    expect(within(container).queryByText('Loose')).not.toBeInTheDocument()
    expect(screen.getByText('Loose')).toBeInTheDocument()
  })

  it('GRP-05 a column without a task of the group has no container', () => {
    renderWithProviders(
      <BoardColumn column="backlog" view={{ tasks: [card('a', 'Loose')], estimate_minutes: 60 }} groups={[GROUP]} listId={LIST} canWrite renderTask={renderTask} />,
    )

    expect(screen.queryByRole('group', { name: 'Group Pipeline' })).not.toBeInTheDocument()
  })

  it('EDGE-05 a group with tasks in Today and Done shows in both, each counting its own column', () => {
    renderWithProviders(
      <>
        <BoardColumn
          column="today"
          view={progressView({ tasks: [card('a', 'Open 1', 60, 'g1'), card('b', 'Open 2', 60, 'g1')] })}
          groups={[GROUP]}
          listId={LIST}
          canWrite
          renderTask={renderTask}
        />
        <DoneColumn
          done={{ today_count: 1, days: [{ date: '2026-11-11', tasks: [card('c', 'Closed', 60, 'g1')] }] }}
          groups={[GROUP]}
          renderTask={renderTask}
        />
      </>,
    )

    const [today, done] = screen.getAllByRole('group', { name: 'Group Pipeline' })
    expect(within(today!).getByText('2 tasks')).toBeInTheDocument()
    expect(within(today!).getByText('Open 1')).toBeInTheDocument()
    expect(within(done!).getByText('1 task')).toBeInTheDocument()
    expect(within(done!).getByText('Closed')).toBeInTheDocument()
  })

  it('numbers the cards inside a container by their place in the column', () => {
    const numbered = (task: TaskCardView, index: number) => <p key={task.id}>{`${index + 1}. ${task.title}`}</p>
    renderWithProviders(
      <BoardColumn
        column="today"
        view={progressView({ tasks: [card('a', 'Loose'), card('b', 'Step', 60, 'g1')] })}
        groups={[GROUP]}
        listId={LIST}
        canWrite
        renderTask={numbered}
      />,
    )

    expect(within(screen.getByRole('group', { name: 'Group Pipeline' })).getByText('2. Step')).toBeInTheDocument()
  })
})
