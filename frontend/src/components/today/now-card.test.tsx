import { screen, within } from '@testing-library/react'
import { toast } from 'sonner'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { deriveDisplay } from '@/lib/focus/display'
import type { FocusConflict } from '@/lib/focus/queue'
import { renderWithProviders } from '@/test/utils'
import type { FocusState, TodaySession } from '@/types'
import { NowCard, type NowCardFocus } from './now-card'

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}))

const sessionWorkspace = vi.hoisted(() => ({ value: null as { id: string; name: string } | null }))
vi.mock('@/lib/today/use-session-workspace', () => ({
  useSessionWorkspace: (_listId: string | null, knownHere: boolean) => (knownHere ? null : sessionWorkspace.value),
}))

/** 14:20 in São Paulo (UTC-3). */
const NOW = Date.parse('2026-11-11T17:20:00.000Z')
const NOW_MINUTE = 14 * 60 + 20
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

function daySession(overrides: Partial<TodaySession>): TodaySession {
  return { id: 's', kind: 'task', task_id: null, title: 'Task', list_id: work.id, list_color: work.color, start_minute: 0, end_minute: 0, open: false, ...overrides }
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
    <NowCard focus={focus} canWrite nowMinute={NOW_MINUTE} lists={[work, home]} sessions={[]} {...props} />,
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
      rerender(<NowCard focus={{ ...focus, conflicts: [refused] }} canWrite nowMinute={NOW_MINUTE} lists={[work, home]} sessions={[]} />)
      expect(toast.error).toHaveBeenCalledWith('The server refused: Complete')
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['focus'] })
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
