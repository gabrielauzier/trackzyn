import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/utils'
import type { TodayPendingTask } from '@/types'
import { PendingCard } from './pending-card'

// The dialog loads the task from the API; here it only has to open with the clicked task.
vi.mock('@/components/board/task-dialog', () => ({
  TaskDialog: ({ taskId }: { taskId: string | null }) => (taskId ? <div role="dialog" aria-label="Edit task">{taskId}</div> : null),
}))

const work = { id: 'l1', name: 'Work', color: 1 }
const home = { id: 'l2', name: 'Home', color: 3 }

function task(overrides: Partial<TodayPendingTask>): TodayPendingTask {
  return {
    id: 't',
    title: 'Task',
    list: work,
    estimate_minutes: null,
    position: 0,
    scheduled_on: null,
    scheduled_minute: null,
    plan_minute: null,
    has_session_today: false,
    days_late: null,
    subtasks: { done: 0, total: 0 },
    series: false,
    ...overrides,
  }
}

/** 14:20, the hour of the mockup. */
const NOW = 14 * 60 + 20
const END_19 = 19 * 60

// The mockup's day: five tasks that sum 4h 58min.
const mockup: TodayPendingTask[] = [
  task({ id: 'late', title: 'Review the PR', scheduled_on: '2026-11-11', scheduled_minute: 13 * 60, estimate_minutes: 90, position: 0 }),
  task({ id: 'timed', title: 'Call the client', scheduled_on: '2026-11-11', scheduled_minute: 16 * 60, estimate_minutes: 30, position: 1 }),
  task({ id: 'planned', title: 'Write the spec', plan_minute: 15 * 60, estimate_minutes: 60, position: 2, list: home }),
  task({ id: 'carried', title: 'Pay the bill', scheduled_on: '2026-11-08', days_late: 3, estimate_minutes: 28, position: 3 }),
  task({ id: 'loose', title: 'Tidy the inbox', estimate_minutes: 90, position: 4 }),
]

function show(props: Partial<Parameters<typeof PendingCard>[0]> = {}) {
  return renderWithProviders(
    <PendingCard pending={mockup} nowMinute={NOW} workdayEnd={END_19} focusLeftSeconds={0} canWrite timeZone="America/Sao_Paulo" {...props} />,
  )
}

/** The titles of each group, by its heading. */
function groups() {
  return Object.fromEntries(
    screen.queryAllByRole('heading', { level: 3 }).map((heading) => [
      heading.textContent,
      within(heading.closest('section')!)
        .getAllByRole('button')
        .map((button) => button.querySelector('.truncate')!.textContent),
    ]),
  )
}

describe('PendingCard', () => {
  it('says how many tasks are pending and their estimates in the title (HOJE-23)', () => {
    show()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Pending')
    expect(screen.getByText('5 tasks · 4hr 58min estimated')).toBeInTheDocument()
  })

  it('puts each task in its group with the count beside the name, in the order of HOJE-25 (HOJE-26)', () => {
    show()
    expect(groups()).toEqual({
      'Late 1': ['Review the PR'],
      'Timed 1': ['Call the client'],
      'In the plan 1': ['Write the spec'],
      'From earlier days 1': ['Pay the bill'],
      'No plan 1': ['Tidy the inbox'],
    })
  })

  it('hides the empty groups', () => {
    show({ pending: [mockup[4]] })
    expect(Object.keys(groups())).toEqual(['No plan 1'])
  })

  it('orders a group by the start of today, then by position (HOJE-26)', () => {
    show({
      pending: [
        task({ id: 'b', title: 'Second by position', position: 5 }),
        task({ id: 'a', title: 'First by position', position: 1 }),
      ],
    })
    expect(groups()['No plan 2']).toEqual(['First by position', 'Second by position'])
  })

  it('shows the start of a late task in amber and how long ago it passed (HOJE-27)', () => {
    show()
    const late = screen.getByRole('button', { name: /Review the PR/ })
    expect(within(late).getByText('13:00 · passed 1hr 20min ago')).toHaveClass('text-amber-600')
    expect(late).toHaveClass('border-amber-500')
  })

  it('labels a task from earlier days with how many days ago (HOJE-28)', () => {
    show()
    expect(within(screen.getByRole('button', { name: /Pay the bill/ })).getByText('3 days ago')).toBeInTheDocument()
  })

  it('draws each task with its list and estimate (HOJE-24)', () => {
    show()
    const planned = screen.getByRole('button', { name: /Write the spec/ })
    expect(within(planned).getByText(/^Home/)).toBeInTheDocument()
    expect(within(planned).getByText('1hr')).toBeInTheDocument()
  })

  describe('capacity (HOJE-29 to HOJE-32)', () => {
    const fourHours = [task({ id: 'a', estimate_minutes: 120 }), task({ id: 'b', estimate_minutes: 120, position: 1 })]

    it('adds what is left of the focused task and turns amber with the excess hatched when it does not fit (HOJE-30)', () => {
      show({ pending: fourHours, focusLeftSeconds: 58 * 60 })
      const text = screen.getByText("Doesn't fit the day: 18min of tasks left over")
      expect(text).toHaveClass('text-amber-600')
      expect(document.querySelector('[data-slot="capacity-over"]')).toBeInTheDocument()
    })

    it('says how much is free without an alert colour when it fits (HOJE-31)', () => {
      show({ pending: fourHours })
      const text = screen.getByText('Fits the day: 40min free')
      expect(text.className).not.toMatch(/amber/)
      expect(document.querySelector('[data-slot="capacity-over"]')).toBeNull()
    })

    it('counts the time left as zero after the end of the workday (HOJE-29)', () => {
      show({ pending: [task({ id: 'a', estimate_minutes: 30 })], nowMinute: 18 * 60 + 30, workdayEnd: 18 * 60 })
      expect(screen.getByText("Doesn't fit the day: 30min of tasks left over")).toBeInTheDocument()
    })

    it('says how many tasks have no estimate, counted as 0 (HOJE-32)', () => {
      show({ pending: [...fourHours, task({ id: 'c', position: 2 }), task({ id: 'd', position: 3 })] })
      expect(screen.getByText('2 without an estimate, counted as 0')).toBeInTheDocument()
      expect(screen.getByText('Fits the day: 40min free')).toBeInTheDocument()
    })

    it('says nothing about estimates when every task has one', () => {
      show({ pending: fourHours })
      expect(screen.queryByText(/without an estimate/)).toBeNull()
    })
  })

  it('opens the task dialog of the clicked task (HOJE-33)', async () => {
    const { user } = show()
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.click(screen.getByRole('button', { name: /Write the spec/ }))
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toHaveTextContent('planned')
  })

  it('says Nothing pending for today without the groups and the capacity when empty (HOJE-34)', () => {
    show({ pending: [] })
    expect(screen.getByText('Nothing pending for today')).toBeInTheDocument()
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([])
    expect(screen.queryByText(/fit the day|Fits the day/)).toBeNull()
    expect(screen.queryByRole('link', { name: 'Create list' })).toBeNull()
  })

  it('links to Create list when the workspace has no active lists (HOJE-72)', () => {
    show({ pending: [], noLists: true })
    expect(screen.getByText('Nothing pending for today')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create list' })).toHaveAttribute('href', '/lists?new=1')
  })
})
