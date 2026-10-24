import type { FocusState } from '@/types'

export type DisplayMode = 'countdown' | 'countup' | 'awaiting_extend' | 'break' | 'paused' | 'idle' | 'all_clear'

/** What the focus timer shows: the mode and the seconds on the clock. */
export interface Display {
  mode: DisplayMode
  seconds: number
}

/**
 * What the timer shows at `nowMs` (server clock): a task counting down what is left of its estimate,
 * counting up past it or without one, waiting for `Estender` once the estimate is used up, a break
 * counting down, a paused task frozen at its value, or nothing left in Today. A deadline already
 * reached counts as reached even before the server settles it (FOCUS-10, BREAK-03).
 */
export function deriveDisplay(state: FocusState, nowMs: number): Display {
  const { session, task } = state
  const deadline = session?.deadline_at ? Date.parse(session.deadline_at) : null
  const running = session !== null && (deadline === null || nowMs < deadline)

  // A break always has its end as deadline.
  if (session?.kind === 'break' && running && deadline !== null) {
    return { mode: 'break', seconds: Math.ceil((deadline - nowMs) / 1000) }
  }
  if (session?.kind === 'task' && deadline !== null && !running) return { mode: 'awaiting_extend', seconds: 0 }
  if (task === null) return { mode: state.today.done > 0 ? 'all_clear' : 'idle', seconds: 0 }

  if (session?.kind === 'task' && running) {
    if (deadline !== null) return { mode: 'countdown', seconds: Math.ceil((deadline - nowMs) / 1000) }
    const elapsed = Math.max(0, nowMs - Date.parse(state.server_now))
    return { mode: 'countup', seconds: task.spent_seconds + Math.floor(elapsed / 1000) }
  }

  if (task.awaiting_extend) return { mode: 'awaiting_extend', seconds: 0 }
  const left = task.estimate_minutes === null ? 0 : task.estimate_minutes * 60 - task.spent_seconds
  return { mode: 'paused', seconds: left > 0 ? left : task.spent_seconds }
}
