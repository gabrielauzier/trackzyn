import type { Display } from '@/lib/focus/display'
import type { SoundKind } from '@/lib/sounds/synth'
import type { FocusState } from '@/types'

/** What the sounds look at in one frame of the timer. */
export interface SoundFrame {
  display: Display
  /** The task the timer shows, or null when Today has none left. */
  taskId: string | null
  /** Total seconds spent on that task, all sessions together (SOUND-02). */
  spent: number
  /** Tasks of Today already done. */
  done: number
  /** When the break in progress ends, on the server's clock; null outside a break. */
  breakEndsAt: number | null
  /** The server's clock at this frame. */
  at: number
}

const PROGRESS_SECONDS = 600
const RUNNING = new Set<Display['mode']>(['countdown', 'countup'])

/** The frame of the timer at `nowMs` (server clock), from the focus state and what it shows. */
export function frameOf(state: FocusState, display: Display, nowMs: number): SoundFrame {
  const { session, task } = state
  let spent = task?.spent_seconds ?? 0
  if (display.mode === 'countup') spent = display.seconds
  if (display.mode === 'countdown' && task?.estimate_minutes != null) spent = task.estimate_minutes * 60 - display.seconds
  const breakEndsAt = session?.kind === 'break' && session.deadline_at ? Date.parse(session.deadline_at) : null
  return { display, taskId: task?.id ?? null, spent, done: state.today.done, breakEndsAt, at: nowMs }
}

/**
 * The sounds to play between two frames of the timer: complete when a task of Today is done
 * (SOUND-01); progress when the total time on the task passes a multiple of 10 min with its session
 * open (SOUND-02); estimate when the same task passes to waiting for `Estender` (SOUND-03); break_end
 * when the break leaves on its own at its end, not by `Encerrar intervalo` (SOUND-04).
 */
export function soundsFor(prev: SoundFrame, next: SoundFrame): SoundKind[] {
  const sounds: SoundKind[] = []
  const sameTask = prev.taskId !== null && prev.taskId === next.taskId
  if (next.done > prev.done) sounds.push('complete')
  if (
    sameTask &&
    RUNNING.has(prev.display.mode) &&
    RUNNING.has(next.display.mode) &&
    Math.floor(next.spent / PROGRESS_SECONDS) > Math.floor(prev.spent / PROGRESS_SECONDS)
  ) {
    sounds.push('progress')
  }
  if (sameTask && RUNNING.has(prev.display.mode) && next.display.mode === 'awaiting_extend') sounds.push('estimate')
  if (
    prev.display.mode === 'break' &&
    next.display.mode !== 'break' &&
    prev.breakEndsAt !== null &&
    next.at >= prev.breakEndsAt
  ) {
    sounds.push('break_end')
  }
  return sounds
}
