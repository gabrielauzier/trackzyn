import { screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { today } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'
import type { TodayDoneTask, TodayPendingTask, TodayRead, TodaySession } from '@/types'
import { CloseDayDialog, type CloseFocusTask } from './close-day-dialog'

vi.mock('@/lib/api', () => ({ today: { close: vi.fn() } }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const hm = (h: number, m = 0) => h * 60 + m
const frete = { id: 'l1', name: 'Frete', color: 1 }
const fiap = { id: 'l2', name: 'FIAP', color: 3 }

function pending(overrides: Partial<TodayPendingTask>): TodayPendingTask {
  return {
    id: 'p',
    title: 'Pending',
    list: frete,
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

function done(overrides: Partial<TodayDoneTask>): TodayDoneTask {
  return {
    id: 'd',
    title: 'Done',
    list: frete,
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
    task_id: 'x',
    title: 'Task',
    list_id: frete.id,
    list_color: frete.color,
    start_minute: hm(9),
    end_minute: hm(10),
    open: false,
    ...overrides,
  }
  return { started_at: atMinute(base.start_minute), ended_at: atMinute(base.end_minute), ...base }
}

const day: TodayRead = {
  server_now: '2026-11-11T17:20:00.000Z',
  day: '2026-11-11',
  tomorrow: '2026-11-12',
  timezone: 'America/Sao_Paulo',
  now_minute: hm(14, 20),
  workday: { start: '09:00', end: '18:00' },
  pending: [
    pending({ id: 'lesson', title: 'Prepare the lesson', list: fiap, estimate_minutes: 90, days_late: 2 }),
    pending({ id: 'deps', title: 'Update the dependencies', days_late: 4 }),
    pending({ id: 'read', title: 'Read chapter 4' }),
  ],
  done: [
    done({ id: 'mr', title: 'Review the MR', estimate_minutes: 60, spent_seconds: 62 * 60, verdict: 'on_time', diff_seconds: 120 }),
    done({ id: 'bug', title: 'Fix the bug', estimate_minutes: 60, spent_seconds: 100 * 60, verdict: 'late', diff_seconds: 2400 }),
    done({ id: 'mail', title: 'Answer the email', list: fiap, spent_seconds: 20 * 60 }),
  ],
  plan: {
    saved: true,
    blocks: [
      { id: 'b1', kind: 'task', task_id: 'mr', title: 'Review the MR', list_color: 1, start_minute: hm(9), minutes: 60, done: true },
      { id: 'b2', kind: 'task', task_id: 'bug', title: 'Fix the bug', list_color: 1, start_minute: hm(10), minutes: 60, done: true },
      { id: 'b3', kind: 'task', task_id: 'lesson', title: 'Prepare the lesson', list_color: 3, start_minute: hm(16), minutes: 60, done: false },
      { id: 'b4', kind: 'task', task_id: 'focus', title: 'Write the spec', list_color: 1, start_minute: hm(13, 30), minutes: 90, done: false },
    ],
  },
  // Frete: 60 + 100 + 32 (the open one until 14:20) = 3hr 12min; FIAP: 20min; a break that does not count.
  sessions: [
    session({ id: 's1', task_id: 'mr', start_minute: hm(9), end_minute: hm(10) }),
    session({ id: 's2', task_id: 'bug', start_minute: hm(10), end_minute: hm(11, 40) }),
    session({ id: 's3', kind: 'break', task_id: null, title: null, start_minute: hm(12), end_minute: hm(13) }),
    session({ id: 's4', task_id: 'mail', list_id: fiap.id, list_color: fiap.color, start_minute: hm(13), end_minute: hm(13, 20) }),
    session({ id: 's5', task_id: 'focus', start_minute: hm(13, 48), end_minute: hm(14), open: true }),
  ],
  tomorrow_plan_blocks: 0,
  tomorrow_tasks: [],
  week_unscheduled: 0,
  focus_task_series: false,
}

const focusTask: CloseFocusTask = { id: 'focus', title: 'Write the spec', estimate_minutes: 90, list: frete }

function draw(overrides: { data?: TodayRead; focusTask?: CloseFocusTask | null } = {}) {
  const onClose = vi.fn()
  const result = renderWithProviders(
    <CloseDayDialog
      onClose={onClose}
      workspaceId="ws"
      workspaceName="Trackzyn"
      data={overrides.data ?? day}
      nowMinute={hm(14, 20)}
      lists={[frete, fiap]}
      focusTask={overrides.focusTask === undefined ? focusTask : overrides.focusTask}
    />,
  )
  return { ...result, onClose }
}

const dialog = () => screen.getByRole('dialog', { name: 'Close the day' })
const destination = (title: string) => within(dialog()).getByRole('group', { name: `Destination of ${title}` })
const pressed = (title: string) => within(destination(title)).getByRole('button', { pressed: true }).textContent

beforeEach(() => {
  vi.clearAllMocks()
})

describe('CloseDayDialog (HOJE-41 to HOJE-66)', () => {
  it('HOJE-41 says the day in full and the time, and the numbers Focused, Completed, Plan adherence and On time', () => {
    draw()
    expect(within(dialog()).getByText('Wednesday, November 11 · 14:20')).toBeInTheDocument()
    expect(within(within(dialog()).getByRole('group', { name: 'Focused' })).getByText('3hr 32min')).toBeInTheDocument()
    const completed = within(dialog()).getByRole('group', { name: 'Completed' })
    expect(completed).toHaveTextContent('3 of 4')
    // Block 13:30-15:00 against the open session since 13:48 (32 of 50) and the two morning blocks fully done: 152/170.
    expect(within(within(dialog()).getByRole('group', { name: 'Plan adherence' })).getByText('89%')).toBeInTheDocument()
    // Of the done tasks with an estimate, one on time and one late; the one without an estimate does not count.
    expect(within(dialog()).getByRole('group', { name: 'On time' })).toHaveTextContent('1 of 2')
  })

  it('HOJE-49 sums the Focused seconds of sessions off the whole minute and truncates once: 29min 40s + 29min 20s is 59min', () => {
    draw({ data: { ...day, sessions: [
        session({ id: 'x1', task_id: 'a', start_minute: hm(9), end_minute: hm(9, 30), started_at: '2026-11-11T12:00:40.000Z', ended_at: '2026-11-11T12:30:20.000Z' }),
        session({ id: 'x2', task_id: 'b', start_minute: hm(10, 10), end_minute: hm(10, 40), started_at: '2026-11-11T13:10:50.000Z', ended_at: '2026-11-11T13:40:10.000Z' }),
      ] }, focusTask: null })
    expect(within(within(dialog()).getByRole('group', { name: 'Focused' })).getByText('59min')).toBeInTheDocument()
  })

  it('HOJE-58 shows the focused time by list in a stacked bar with a legend, in the list colours', () => {
    draw()
    const shares = screen.getAllByTestId('list-share')
    expect(shares.map((share) => [share.style.flexGrow, share.style.backgroundColor])).toEqual([
      ['192', 'var(--chart-1)'],
      ['20', 'var(--chart-3)'],
    ])
    const legend = within(dialog()).getByRole('heading', { name: 'Time by list' }).parentElement!
    expect(within(legend).getByText(/Frete/)).toHaveTextContent('Frete 3hr 12min')
    expect(within(legend).getByText(/FIAP/)).toHaveTextContent('FIAP 20min')
  })

  it('HOJE-59 lists the pending tasks and the task in focus, each starting at Tomorrow', () => {
    draw()
    for (const title of ['Write the spec', 'Prepare the lesson', 'Update the dependencies', 'Read chapter 4']) {
      expect(within(destination(title)).getAllByRole('button').map((button) => button.textContent)).toEqual(['Tomorrow', 'This week', 'Backlog'])
      expect(pressed(title)).toBe('Tomorrow')
    }
  })

  it('HOJE-60 says a task carried 4 days was postponed 4 days in a row, and nothing for one carried 2 days', () => {
    draw()
    expect(within(dialog()).getByText('Postponed 4 days in a row')).toBeInTheDocument()
    expect(within(dialog()).queryByText(/Postponed 2 days/)).toBeNull()
    expect(within(dialog()).getAllByText(/Postponed/)).toHaveLength(1)
  })

  it('HOJE-60 says a task carried exactly 3 days was postponed 3 days in a row, the threshold included', () => {
    draw({ data: { ...day, pending: [pending({ id: 'three', title: 'Carried three days', days_late: 3 })] } })
    expect(within(dialog()).getByText('Postponed 3 days in a row')).toBeInTheDocument()
  })

  it('HOJE-63 shows the summary in Markdown with the chosen destinations and the note at the end', async () => {
    const { user } = draw()
    await user.click(within(destination('Read chapter 4')).getByRole('button', { name: 'This week' }))
    await user.type(within(dialog()).getByLabelText(/Note of the day/), 'Stuck on the timezone.')
    const summary = screen.getByTestId('close-summary').textContent!
    expect(summary.startsWith('## Trackzyn · 11/11\nFocused 3hr 32min · 3 of 4 done · adherence 89%')).toBe(true)
    expect(summary).toContain('- [x] Fix the bug (1hr 40min, +40min, Frete)')
    expect(summary).toContain('- Write the spec → tomorrow\n- Prepare the lesson → tomorrow\n- Update the dependencies → tomorrow\n- Read chapter 4 → this week')
    expect(summary.endsWith('\n\nStuck on the timezone.')).toBe(true)
  })

  it('HOJE-61 HOJE-64 sends the chosen moves on confirm, copies the summary and says it was copied', async () => {
    vi.mocked(today.close).mockResolvedValue({ ...day, pending: [] })
    const { user, onClose } = draw()
    await user.click(within(destination('Prepare the lesson')).getByRole('button', { name: 'This week' }))
    await user.click(within(destination('Update the dependencies')).getByRole('button', { name: 'Backlog' }))
    const summary = screen.getByTestId('close-summary').textContent
    await user.click(within(dialog()).getByRole('button', { name: 'Close the day' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(today.close).toHaveBeenCalledWith([
      { task_id: 'focus', to: 'tomorrow' },
      { task_id: 'lesson', to: 'this_week' },
      { task_id: 'deps', to: 'backlog' },
      { task_id: 'read', to: 'tomorrow' },
    ])
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Summary copied'))
    expect(await navigator.clipboard.readText()).toBe(summary)
  })

  it('HOJE-64 does not copy when Copy on close is unchecked', async () => {
    vi.mocked(today.close).mockResolvedValue(day)
    const { user, onClose } = draw()
    await navigator.clipboard.writeText('before')
    await user.click(within(dialog()).getByRole('checkbox', { name: 'Copy on close' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Close the day' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(await navigator.clipboard.readText()).toBe('before')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('HOJE-65 keeps the dialog open with the error and the choices when the close is refused, and copies nothing', async () => {
    vi.mocked(today.close).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { detail: 'Only pending tasks of the workspace can be moved', code: 'close_task_not_pending' } },
    })
    const { user, onClose } = draw()
    await user.click(within(destination('Read chapter 4')).getByRole('button', { name: 'Backlog' }))
    await user.click(within(dialog()).getByRole('button', { name: 'Close the day' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('Only pending tasks of the workspace can be moved')
    expect(onClose).not.toHaveBeenCalled()
    expect(pressed('Read chapter 4')).toBe('Backlog')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it('HOJE-75 offers only Tomorrow to an occurrence of a series, and all three to a plain task of the same list (L-048)', () => {
    const data = {
      ...day,
      pending: [pending({ id: 'standup', title: 'Daily standup', series: true }), pending({ id: 'read', title: 'Read chapter 4' })],
    }
    draw({ data, focusTask: null })
    const occurrence = destination('Daily standup')
    expect(within(occurrence).getByRole('button', { name: 'Tomorrow' })).toBeEnabled()
    expect(pressed('Daily standup')).toBe('Tomorrow')
    for (const name of ['This week', 'Backlog']) {
      const button = within(occurrence).getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Would end the recurrence')
    }
    for (const name of ['Tomorrow', 'This week', 'Backlog']) {
      const button = within(destination('Read chapter 4')).getByRole('button', { name })
      expect(button).toBeEnabled()
      expect(button).not.toHaveAttribute('title')
    }
  })

  it('HOJE-75 offers only Tomorrow to a task in focus that is an occurrence of a series', () => {
    draw({ data: { ...day, focus_task_series: true } })
    const focus = destination('Write the spec')
    expect(within(focus).getByRole('button', { name: 'Tomorrow' })).toBeEnabled()
    expect(pressed('Write the spec')).toBe('Tomorrow')
    for (const name of ['This week', 'Backlog']) {
      const button = within(focus).getByRole('button', { name })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('title', 'Would end the recurrence')
    }
  })

  it('HOJE-75 offers all three destinations to a task in focus that is not an occurrence of a series (L-048)', () => {
    draw({ data: { ...day, focus_task_series: false } })
    for (const name of ['Tomorrow', 'This week', 'Backlog']) {
      const button = within(destination('Write the spec')).getByRole('button', { name })
      expect(button).toBeEnabled()
      expect(button).not.toHaveAttribute('title')
    }
  })

  it('HOJE-75 keeps the dialog open with the error when the server answers 422 close_series_needs_tomorrow', async () => {
    vi.mocked(today.close).mockRejectedValue({
      isAxiosError: true,
      response: { status: 422, data: { detail: 'An occurrence of a series can only go to tomorrow', code: 'close_series_needs_tomorrow' } },
    })
    const { user, onClose } = draw()
    await user.click(within(dialog()).getByRole('button', { name: 'Close the day' }))
    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('An occurrence of a series can only go to tomorrow')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('HOJE-66 closes the day when the clipboard refuses, and offers Copy again', async () => {
    vi.mocked(today.close).mockResolvedValue(day)
    const { user, onClose } = draw()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('denied'))
    await user.click(within(dialog()).getByRole('button', { name: 'Close the day' }))
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(today.close).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalled()
    const [message, options] = vi.mocked(toast.error).mock.calls[0]!
    expect(message).toBe("Couldn't copy the summary")
    const action = (options as { action: { label: string; onClick: () => void } }).action
    expect(action.label).toBe('Copy again')
    action.onClick()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Summary copied'))
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('lists no task in focus when nothing is in focus', () => {
    draw({ focusTask: null })
    expect(within(dialog()).queryByRole('group', { name: 'Destination of Write the spec' })).toBeNull()
    expect(within(dialog()).getAllByRole('group', { name: /^Destination of/ })).toHaveLength(3)
  })
})
