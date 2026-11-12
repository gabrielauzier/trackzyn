import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/utils'
import type { TodayDoneTask, TodaySession } from '@/types'
import { DoneCard } from './done-card'

vi.mock('@/components/board/task-dialog', () => ({
  TaskDialog: ({ taskId }: { taskId: string | null }) => (taskId ? <div role="dialog" aria-label="Edit task">{taskId}</div> : null),
}))

const work = { id: 'l1', name: 'Work', color: 1 }

function done(overrides: Partial<TodayDoneTask>): TodayDoneTask {
  return {
    id: 'd',
    title: 'Done task',
    list: work,
    estimate_minutes: null,
    completed_at: '2026-11-11T15:00:00Z',
    spent_seconds: 0,
    verdict: null,
    diff_seconds: 0,
    series: false,
    ...overrides,
  }
}

/** The instant of a minute of 2026-11-11 in America/Sao_Paulo (UTC-3). */
const atMinute = (minute: number) => new Date(Date.UTC(2026, 10, 11, 3) + minute * 60_000).toISOString()

function session(overrides: Partial<TodaySession>): TodaySession {
  const base: Omit<TodaySession, 'started_at' | 'ended_at'> & Partial<TodaySession> = {
    id: 's',
    kind: 'task',
    task_id: null,
    title: 'Task',
    list_id: work.id,
    list_color: work.color,
    start_minute: 0,
    end_minute: 0,
    open: false,
    ...overrides,
  }
  return { started_at: atMinute(base.start_minute), ended_at: atMinute(base.end_minute), ...base }
}

const tasks: TodayDoneTask[] = [
  done({ id: 'a', title: 'Send the report', estimate_minutes: 30, spent_seconds: 25 * 60, verdict: 'early', diff_seconds: -300 }),
  done({ id: 'b', title: 'Fix the login', estimate_minutes: 60, spent_seconds: 60 * 60, verdict: 'on_time', diff_seconds: 0 }),
  done({ id: 'c', title: 'Migrate the table', estimate_minutes: 60, spent_seconds: 100 * 60, verdict: 'late', diff_seconds: 2400 }),
  done({ id: 'd', title: 'Answer the email', estimate_minutes: null, spent_seconds: 17 * 60 }),
]

// 3h 22min of the reader's sessions on these tasks today, split over two sessions of one of them.
const sessions: TodaySession[] = [
  session({ id: 's1', task_id: 'a', start_minute: 540, end_minute: 565 }),
  session({ id: 's2', task_id: 'b', start_minute: 570, end_minute: 630 }),
  session({ id: 's3', task_id: 'c', start_minute: 640, end_minute: 700 }),
  session({ id: 's4', task_id: 'c', start_minute: 720, end_minute: 760 }),
  session({ id: 's5', task_id: 'd', start_minute: 780, end_minute: 797 }),
  // Not counted: a break, and a session on a task still pending.
  session({ id: 'brk', kind: 'break', task_id: null, start_minute: 700, end_minute: 720 }),
  session({ id: 'other', task_id: 'pending-task', start_minute: 800, end_minute: 860 }),
]

function show(props: Partial<Parameters<typeof DoneCard>[0]> = {}) {
  return renderWithProviders(<DoneCard done={tasks} sessions={sessions} canWrite {...props} />)
}

const tile = (title: string) => screen.getByRole('button', { name: new RegExp(title) })

describe('DoneCard', () => {
  it('sums the time of the reader’s sessions of today on these tasks and counts them in the title (HOJE-36)', () => {
    show()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Done today')
    expect(screen.getByText('3hr 22min in 4 tasks')).toBeInTheDocument()
  })

  it('lists the tasks in the order the server gives, newest first (HOJE-35)', () => {
    show()
    expect(screen.getAllByRole('button').map((button) => button.querySelector('.truncate')!.textContent)).toEqual([
      'Send the report',
      'Fix the login',
      'Migrate the table',
      'Answer the email',
    ])
  })

  it('draws each task with its total time against its estimate and the badge of the verdict (HOJE-37)', () => {
    show()
    expect(within(tile('Send the report')).getByText('Work · 25min of 30min')).toBeInTheDocument()
    expect(within(tile('Send the report')).getByText('5min early')).toHaveClass('text-status-good')
    expect(within(tile('Fix the login')).getByText('On time')).toHaveClass('text-status-good')
    expect(within(tile('Migrate the table')).getByText('Work · 1hr 40min of 1hr')).toBeInTheDocument()
    expect(within(tile('Migrate the table')).getByText('40min late')).toHaveClass('text-status-critical')
    expect(tile('Send the report').querySelector('[data-slot="tile-done-icon"]')).toBeInTheDocument()
  })

  it('shows only the total time and no badge for a task without an estimate (HOJE-38)', () => {
    show()
    const noEstimate = tile('Answer the email')
    expect(within(noEstimate).getByText('Work · 17min')).toBeInTheDocument()
    expect(within(noEstimate).queryByText(/ of /)).toBeNull()
    expect(within(noEstimate).queryByText(/early|late|On time/)).toBeNull()
  })

  it('says Nothing done today yet when the user completed nothing today (HOJE-39)', () => {
    show({ done: [], sessions: [] })
    expect(screen.getByText('Nothing done today yet')).toBeInTheDocument()
    expect(screen.queryByText(/ in \d+ task/)).toBeNull()
  })

  it('opens the task dialog of the clicked task', async () => {
    const { user } = show()
    await user.click(tile('Fix the login'))
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toHaveTextContent('b')
  })
})
