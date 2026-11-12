import { screen, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deriveDisplay } from '@/lib/focus/display'
import type { FocusConflict } from '@/lib/focus/queue'
import { renderWithProviders } from '@/test/utils'
import { tasks } from '@/lib/api'
import type { FocusState, Task, TodayPendingTask, TodayPlanBlock, TodaySession } from '@/types'
import { NowCard, type NowCardFocus } from './now-card'

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}))

vi.mock('@/lib/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/api')>()),
  tasks: { get: vi.fn(), move: vi.fn() },
}))

const sessionWorkspace = vi.hoisted(() => ({ value: null as { id: string; name: string } | null }))
vi.mock('@/lib/today/use-session-workspace', () => ({
  useSessionWorkspace: (_listId: string | null, knownHere: boolean) => (knownHere ? null : sessionWorkspace.value),
}))

/** 14:20 in São Paulo (UTC-3). */
const NOW = Date.parse('2026-11-11T17:20:00.000Z')
const NOW_MINUTE = 14 * 60 + 20
const DAY = '2026-11-11'
const iso = (ms: number) => new Date(ms).toISOString()
const work = { id: 'list-1', name: 'Work', color: 2 }
const home = { id: 'list-2', name: 'Home', color: 4 }

const review = { id: 'task-a', title: 'Review the PR', estimate_minutes: 90, spent_seconds: 32 * 60, awaiting_extend: false }

function state(overrides: Partial<FocusState>): FocusState {
  return {
    server_now: iso(NOW),
    session: null,
    task: review,
    today: { pending: 1, done: 0, estimate_minutes: 90, tasks: [{ ...review, position: 0 }] },
    stale: null,
    ...overrides,
  }
}

/** A task session on `Review the PR` with 58 min of its estimate left. */
const focused = state({
  session: {
    id: 'session-1',
    kind: 'task',
    task_id: 'task-a',
    list_id: work.id,
    device_id: 'device',
    started_at: iso(NOW - 12 * 60_000),
    deadline_at: iso(NOW + 58 * 60_000),
    planned_seconds: null,
  },
})

const noEstimate = state({
  task: { ...review, estimate_minutes: null, spent_seconds: 3 * 3600 },
  session: { ...focused.session!, deadline_at: null, started_at: iso(NOW - 25 * 60_000) },
})

const used = state({
  task: { ...review, spent_seconds: 95 * 60, awaiting_extend: true },
  session: { ...focused.session!, deadline_at: iso(NOW - 5 * 60_000) },
})

const onBreak = state({
  session: {
    id: 'break-1',
    kind: 'break',
    task_id: null,
    list_id: work.id,
    device_id: 'device',
    started_at: iso(NOW - 5 * 60_000),
    deadline_at: iso(NOW + 10 * 60_000),
    planned_seconds: 900,
  },
})

/** The instant of a minute of 2026-11-11 in America/Sao_Paulo (UTC-3). */
const atMinute = (minute: number) => new Date(Date.UTC(2026, 10, 11, 3) + minute * 60_000).toISOString()

function daySession(overrides: Partial<TodaySession>): TodaySession {
  const base: Omit<TodaySession, 'started_at' | 'ended_at'> & Partial<TodaySession> = { id: 's', kind: 'task', task_id: null, title: 'Task', list_id: work.id, list_color: work.color, start_minute: 0, end_minute: 0, open: false, ...overrides }
  return { started_at: atMinute(base.start_minute), ended_at: atMinute(base.end_minute), ...base }
}

function actions() {
  const done = () => vi.fn(async () => ({ states: [], expired: [], offline: false }))
  return {
    start: done(),
    pause: done(),
    skip: done(),
    complete: done(),
    extend: done(),
    takeBreak: done(),
    endBreak: done(),
    recover: done(),
    retry: done(),
    discard: vi.fn(),
  }
}

function focusOf(focusState: FocusState | null, conflicts: FocusConflict[] = []): NowCardFocus {
  return {
    state: focusState,
    display: focusState ? deriveDisplay(focusState, NOW) : null,
    actions: actions(),
    conflicts,
  }
}

function show(focus: NowCardFocus, props: Partial<Parameters<typeof NowCard>[0]> = {}) {
  return renderWithProviders(
    <NowCard focus={focus} canWrite nowMinute={NOW_MINUTE} day={DAY} lists={[work, home]} sessions={[]} blocks={[]} pending={[]} {...props} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  sessionWorkspace.value = null
})

afterEach(() => {
  vi.useRealTimers()
})

describe('NowCard with an open session', () => {
  describe('in focus (HOJE-07)', () => {
    it('shows the task and its list, the time against the estimate, what is left and when it ends', () => {
      show(focusOf(focused))
      expect(screen.getByText('Now · in focus')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Review the PR' })).toBeInTheDocument()
      expect(screen.getByText('Work')).toBeInTheDocument()
      expect(screen.getByText('32min of 1hr 30min')).toBeInTheDocument()
      expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', String(Math.round((32 / 90) * 100)))
      expect(screen.getByText('58min left · ends at 15:18')).toBeInTheDocument()
      for (const name of ['Complete', 'Pause', 'Break']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    })

    it('shows only the time of the session, with no bar and no end, for a task without an estimate (HOJE-08)', () => {
      show(focusOf(noEstimate))
      expect(screen.getByText('25min elapsed')).toBeInTheDocument()
      expect(screen.queryByRole('progressbar')).toBeNull()
      expect(screen.queryByText(/ends at/)).toBeNull()
      expect(screen.queryByText(/ of /)).toBeNull()
    })
  })

  describe('actions (HOJE-09)', () => {
    it('completes the task in focus', async () => {
      const focus = focusOf(focused)
      const { user } = show(focus)
      await user.click(screen.getByRole('button', { name: 'Complete' }))
      expect(focus.actions.complete).toHaveBeenCalledWith('task-a')
    })

    it('pauses', async () => {
      const focus = focusOf(focused)
      const { user } = show(focus)
      await user.click(screen.getByRole('button', { name: 'Pause' }))
      expect(focus.actions.pause).toHaveBeenCalledTimes(1)
    })

    it('opens the focus break picker and takes the break on the session’s list', async () => {
      const focus = focusOf({ ...focused, session: { ...focused.session!, list_id: home.id } })
      const { user } = show(focus)
      await user.click(screen.getByRole('button', { name: 'Break' }))
      await user.click(screen.getByRole('button', { name: '10 min' }))
      expect(focus.actions.takeBreak).toHaveBeenCalledWith(10, undefined, home.id)
    })
  })

  describe('estimate used up (HOJE-74)', () => {
    it('says the estimate is used up with the time spent, and offers Extend and Complete', async () => {
      const focus = focusOf(used)
      const { user } = show(focus)
      expect(screen.getByText('Estimate used up')).toBeInTheDocument()
      expect(screen.getByText('1hr 35min spent')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Pause' })).toBeNull()
      await user.click(screen.getByRole('button', { name: 'Extend' }))
      expect(focus.actions.extend).toHaveBeenCalledWith('task-a')
      await user.click(screen.getByRole('button', { name: 'Complete' }))
      expect(focus.actions.complete).toHaveBeenCalledWith('task-a')
    })
  })

  describe('on a break (HOJE-10)', () => {
    it('shows the name of the break, what is left and End break', async () => {
      const focus = focusOf(onBreak)
      const { user } = show(focus, { sessions: [daySession({ id: 'break-1', kind: 'break', title: 'Coffee', open: true })] })
      expect(screen.getByText('Now · on a break')).toBeInTheDocument()
      expect(screen.getByText('Coffee')).toBeInTheDocument()
      expect(screen.getByText('10min left')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'End break' }))
      expect(focus.actions.endBreak).toHaveBeenCalledTimes(1)
    })

    it('calls a break without a name Break', () => {
      show(focusOf(onBreak), { sessions: [daySession({ id: 'break-1', kind: 'break', title: null, open: true })] })
      expect(within(screen.getByRole('region')).getByText('Break')).toBeInTheDocument()
    })
  })

  describe('Abrir foco (HOJE-17, HOJE-19)', () => {
    it('links Open focus and the title to the focus of the session’s list', () => {
      show(focusOf({ ...focused, session: { ...focused.session!, list_id: home.id } }))
      expect(screen.getByRole('link', { name: 'Open focus' })).toHaveAttribute('href', `/focus/${home.id}`)
      expect(screen.getByRole('link', { name: 'Review the PR' })).toHaveAttribute('href', `/focus/${home.id}`)
    })

    it('links Open focus to the list of an open break', () => {
      show(focusOf(onBreak))
      expect(screen.getByRole('link', { name: 'Open focus' })).toHaveAttribute('href', `/focus/${work.id}`)
    })
  })

  describe('in another workspace (HOJE-20)', () => {
    it('names the other workspace and offers no action', () => {
      sessionWorkspace.value = { id: 'ws-there', name: 'Client work' }
      show(focusOf({ ...focused, session: { ...focused.session!, list_id: 'list-elsewhere' } }))
      expect(screen.getByText('In focus in another workspace: Client work')).toBeInTheDocument()
      expect(screen.queryByRole('button')).toBeNull()
    })
  })

  describe('viewer (HOJE-21)', () => {
    it('shows no action button in focus', () => {
      show(focusOf(focused), { canWrite: false })
      expect(screen.getByText('32min of 1hr 30min')).toBeInTheDocument()
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('shows no action button with the estimate used up or on a break', () => {
      const { unmount } = show(focusOf(used), { canWrite: false })
      expect(screen.queryByRole('button')).toBeNull()
      unmount()
      show(focusOf(onBreak), { canWrite: false })
      expect(screen.queryByRole('button')).toBeNull()
    })
  })

  describe('refusals (HOJE-22)', () => {
    it('shows a refused action of the card in a toast and reads the focus again', () => {
      const focus = focusOf(focused)
      const { rerender, queryClient } = show(focus)
      const invalidate = vi.spyOn(queryClient, 'invalidateQueries')
      const refused: FocusConflict = {
        action_id: 'a1',
        action: { type: 'complete', task_id: 'task-a', occurred_at: iso(NOW), device_id: 'device', list_id: work.id },
        status: 409,
        code: 'invalid_transition',
      }
      rerender(
        <NowCard
          focus={{ ...focus, conflicts: [refused] }}
          canWrite
          nowMinute={NOW_MINUTE}
          day={DAY}
          lists={[work, home]}
          sessions={[]}
          blocks={[]}
          pending={[]}
        />,
      )
      expect(toast.error).toHaveBeenCalledWith('The server refused: Complete')
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['focus'] })
    })

    it('shows exactly the API message of a refused action of the card', () => {
      const focus = focusOf(focused)
      const { rerender } = show(focus)
      const refused: FocusConflict = {
        action_id: 'a2',
        action: { type: 'complete', task_id: 'task-a', occurred_at: iso(NOW), device_id: 'device', list_id: work.id },
        status: 409,
        code: 'invalid_transition',
        message: 'The task is already done',
      }
      rerender(
        <NowCard
          focus={{ ...focus, conflicts: [refused] }}
          canWrite
          nowMinute={NOW_MINUTE}
          day={DAY}
          lists={[work, home]}
          sessions={[]}
          blocks={[]}
          pending={[]}
        />,
      )
      expect(toast.error).toHaveBeenCalledWith('The task is already done')
      expect(toast.error).toHaveBeenCalledTimes(1)
    })

    it('does not toast a refusal that was already there when the card opened', () => {
      const old: FocusConflict = {
        action_id: 'old',
        action: { type: 'pause', occurred_at: iso(NOW), device_id: 'device', list_id: work.id },
        status: 409,
        code: 'invalid_transition',
      }
      show(focusOf(focused, [old]))
      expect(toast.error).not.toHaveBeenCalled()
    })
  })
})

function pendingTask(overrides: Partial<TodayPendingTask>): TodayPendingTask {
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
    ...overrides,
  }
}

function block(overrides: Partial<TodayPlanBlock>): TodayPlanBlock {
  return { id: 'b', kind: 'task', task_id: null, title: 'Block', list_color: null, start_minute: 0, minutes: 30, done: false, ...overrides }
}

/** Nothing open: the first pending task of Today waits, paused. */
const idle = state({})

// The mockup's Pendente: five tasks, 4h 58min of estimates. `Write the spec` (Home) is planned 13:30–15:00.
const spec = pendingTask({ id: 'task-spec', title: 'Write the spec', list: home, plan_minute: 13 * 60 + 30, estimate_minutes: 90, position: 3 })
const pendingFive = [
  pendingTask({ id: 'p1', title: 'Review the PR', estimate_minutes: 90, scheduled_minute: 16 * 60, position: 0 }),
  pendingTask({ id: 'p2', title: 'Call the client', estimate_minutes: 30, position: 1 }),
  spec,
  pendingTask({ id: 'p4', title: 'Pay the bill', list: home, estimate_minutes: 28, position: 1 }),
  pendingTask({ id: 'p5', title: 'Tidy the inbox', estimate_minutes: 60, position: 2 }),
]
const specBlock = block({ id: 'b-spec', task_id: 'task-spec', title: 'Write the spec', list_color: home.color, start_minute: 13 * 60 + 30, minutes: 90 })

function taskRead(overrides: Partial<Task>): Task {
  return {
    id: 't',
    list_id: work.id,
    title: 'Task',
    notes: '',
    estimate_minutes: null,
    column: 'today',
    position: 0,
    completed_at: null,
    created_at: iso(NOW),
    subtasks: [],
    created_via: null,
    scheduled_on: null,
    scheduled_time: null,
    ...overrides,
  } as Task
}

describe('NowCard with nothing open', () => {
  describe('the plan suggests a task (HOJE-11)', () => {
    it('shows the planned task with a dashed edge in its list’s faint colour, the time of the block and how long ago it started', () => {
      show(focusOf(idle), { blocks: [specBlock], pending: pendingFive })
      expect(screen.getByText('Now · nothing in focus')).toBeInTheDocument()
      expect(screen.getByText('By the plan, now would be')).toBeInTheDocument()
      const suggested = document.querySelector<HTMLElement>('[data-slot="suggested-task"]')!
      expect(suggested).toHaveClass('border-2', 'border-dashed')
      expect(suggested.style.borderColor).toContain('--chart-4')
      expect(within(suggested).getByText('Write the spec')).toBeInTheDocument()
      expect(within(suggested).getByText('Home')).toBeInTheDocument()
      expect(screen.getByText('13:30–15:00 · started 50min ago')).toBeInTheDocument()
      for (const name of ['Start focus', 'Another task', 'Break']) expect(screen.getByRole('button', { name })).toBeInTheDocument()
    })

    it('starts the focus on a suggested task already in Today without moving it (HOJE-14)', async () => {
      const focus = focusOf(idle)
      const { user } = show(focus, { blocks: [specBlock], pending: pendingFive })
      await user.click(screen.getByRole('button', { name: 'Start focus' }))
      expect(focus.actions.start).toHaveBeenCalledWith('task-spec')
      expect(tasks.move).not.toHaveBeenCalled()
    })

    it('moves a suggested task of another column to the top of Today first, then starts it (HOJE-14)', async () => {
      const order: string[] = []
      vi.mocked(tasks.get).mockResolvedValue(taskRead({ id: 'task-week', list_id: home.id, column: 'this_week', title: 'Plan the trip' }))
      vi.mocked(tasks.move).mockImplementation(async () => {
        order.push('move')
        return taskRead({ id: 'task-week', list_id: home.id, column: 'today' })
      })
      const focus = focusOf(idle)
      vi.mocked(focus.actions.start).mockImplementation(async () => {
        order.push('start')
        return { states: [], expired: [], offline: false }
      })
      const weekBlock = block({ id: 'b-week', task_id: 'task-week', title: 'Plan the trip', list_color: home.color, start_minute: 14 * 60, minutes: 60 })
      const { user } = show(focus, { blocks: [weekBlock], pending: pendingFive })
      await user.click(await screen.findByRole('button', { name: 'Start focus' }))
      // The top of Today of its own list: `Pay the bill` comes before `Write the spec` there.
      expect(tasks.move).toHaveBeenCalledWith('task-week', { column: 'today', before_task_id: 'p4' })
      expect(focus.actions.start).toHaveBeenCalledWith('task-week')
      expect(order).toEqual(['move', 'start'])
    })

    it('does not start when the move fails, and shows the API’s error (HOJE-22)', async () => {
      vi.mocked(tasks.get).mockResolvedValue(taskRead({ id: 'task-week', list_id: home.id, column: 'this_week' }))
      vi.mocked(tasks.move).mockRejectedValue({ response: { status: 404, data: { detail: 'Task not found' } } })
      const focus = focusOf(idle)
      const weekBlock = block({ id: 'b-week', task_id: 'task-week', title: 'Plan the trip', list_color: home.color, start_minute: 14 * 60, minutes: 60 })
      const { user } = show(focus, { blocks: [weekBlock], pending: pendingFive })
      await user.click(await screen.findByRole('button', { name: 'Start focus' }))
      expect(toast.error).toHaveBeenCalledWith('Task not found')
      expect(focus.actions.start).not.toHaveBeenCalled()
    })

    it('starts the focus on the task picked with Another task (HOJE-15)', async () => {
      const focus = focusOf(idle)
      const { user } = show(focus, { blocks: [specBlock], pending: pendingFive })
      await user.click(screen.getByRole('button', { name: 'Another task' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Call the client/ }))
      expect(focus.actions.start).toHaveBeenCalledWith('p2')
    })

    it('takes a break on the suggested task’s list', async () => {
      const focus = focusOf(idle)
      const { user } = show(focus, { blocks: [specBlock], pending: pendingFive })
      await user.click(screen.getByRole('button', { name: 'Break' }))
      await user.click(screen.getByRole('button', { name: '5 min' }))
      expect(focus.actions.takeBreak).toHaveBeenCalledWith(5, undefined, home.id)
    })
  })

  describe('nothing planned for now (HOJE-12)', () => {
    it('says so with how many tasks are pending and their estimates, Choose a task and Plan today', () => {
      show(focusOf(idle), { pending: pendingFive })
      expect(screen.getByText('Nothing planned for now')).toBeInTheDocument()
      expect(screen.getByText('5 tasks pending · 4hr 58min estimated')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Choose a task' })).toBeInTheDocument()
      // HOJE-16
      expect(screen.getByRole('link', { name: 'Plan today' })).toHaveAttribute('href', `/planejar/${DAY}`)
    })

    it('ignores a block that does not hold the current minute', () => {
      show(focusOf(idle), { pending: pendingFive, blocks: [block({ ...specBlock, start_minute: 9 * 60, minutes: 60 })] })
      expect(screen.getByText('Nothing planned for now')).toBeInTheDocument()
    })

    it('starts the focus on the task chosen with Choose a task (HOJE-15)', async () => {
      const focus = focusOf(idle)
      const { user } = show(focus, { pending: pendingFive })
      await user.click(screen.getByRole('button', { name: 'Choose a task' }))
      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Tidy the inbox/ }))
      expect(focus.actions.start).toHaveBeenCalledWith('p5')
    })
  })

  describe('the footer without focus (HOJE-13)', () => {
    it('says how long the user has been without a session and the name and end of the last one of the day', () => {
      const sessions = [
        daySession({ id: 'lunch', kind: 'break', title: 'Lunch', start_minute: 12 * 60 + 20, end_minute: 13 * 60 + 20 }),
        daySession({ id: 'morning', task_id: 'p1', title: 'Review the PR', start_minute: 9 * 60, end_minute: 12 * 60 }),
      ]
      show(focusOf(idle), { pending: pendingFive, sessions })
      expect(screen.getByText('No focus for 1hr · last session: Lunch, until 13:20')).toBeInTheDocument()
    })

    it('calls a last break without a name Break', () => {
      const sessions = [daySession({ id: 'brk', kind: 'break', title: null, start_minute: 13 * 60, end_minute: 14 * 60 })]
      show(focusOf(idle), { pending: pendingFive, sessions })
      expect(screen.getByText('No focus for 20min · last session: Break, until 14:00')).toBeInTheDocument()
    })

    it('says No session today without a session in the day', () => {
      show(focusOf(idle), { pending: pendingFive })
      expect(screen.getByText('No session today')).toBeInTheDocument()
    })

    it('has no footer while a session is open', () => {
      show(focusOf(focused), { sessions: [daySession({ id: 'session-1', task_id: 'task-a', start_minute: 800, end_minute: 860, open: true })] })
      expect(screen.queryByText(/No focus for|No session today/)).toBeNull()
    })
  })

  describe('Abrir foco without a session (HOJE-17, HOJE-18)', () => {
    it('goes to the list of the suggested task', () => {
      show(focusOf(idle), { blocks: [specBlock], pending: pendingFive })
      expect(screen.getByRole('link', { name: 'Open focus' })).toHaveAttribute('href', `/focus/${home.id}`)
    })

    it('goes to the list of the first task of Pendente without a suggested task', () => {
      // In the order of the groups: `Pay the bill` (Home, from earlier days) comes before `Tidy the inbox` (Work, no plan).
      show(focusOf(idle), {
        pending: [
          pendingTask({ id: 'loose', title: 'Tidy the inbox', list: work, position: 0 }),
          pendingTask({ id: 'carried', title: 'Pay the bill', list: home, days_late: 2, position: 1 }),
        ],
      })
      expect(screen.getByRole('link', { name: 'Open focus' })).toHaveAttribute('href', `/focus/${home.id}`)
    })

    it('is gone without a session, a suggested task or a pending task', () => {
      show(focusOf(idle))
      expect(screen.queryByRole('link', { name: 'Open focus' })).toBeNull()
    })
  })

  describe('viewer (HOJE-21)', () => {
    it('shows neither Start focus, Another task nor Break on a suggested task', () => {
      show(focusOf(idle), { blocks: [specBlock], pending: pendingFive, canWrite: false })
      expect(screen.getByText('Write the spec')).toBeInTheDocument()
      expect(screen.queryByRole('button')).toBeNull()
    })

    it('shows no Choose a task when nothing is planned', () => {
      show(focusOf(idle), { pending: pendingFive, canWrite: false })
      expect(screen.queryByRole('button', { name: 'Choose a task' })).toBeNull()
    })
  })
})
