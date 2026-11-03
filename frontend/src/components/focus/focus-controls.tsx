import { useTranslation } from 'react-i18next'
import { Check, Pause, Play, SkipForward, Square } from 'lucide-react'

import { BreakPicker } from '@/components/focus/break-picker'
import { Button } from '@/components/ui/button'
import type { Display } from '@/lib/focus/display'

/** The focus actions the controls call (from `useFocus`). */
export interface FocusControlActions {
  start: (taskId: string) => unknown
  pause: () => unknown
  skip: (taskId: string) => unknown
  complete: (taskId: string) => unknown
  takeBreak: (minutes: number) => unknown
  endBreak: () => unknown
}

interface FocusControlsProps {
  display: Display
  /** The task in focus. */
  taskId: string | null
  /** Pending tasks of Today; with one, there is nothing to skip to (FOCUS-07). */
  pending: number
  actions: FocusControlActions
}

/**
 * `Pausar` or `Retomar`, `Pular`, `Concluir` and `Intervalo` for the task in focus (FOCUS-04 to
 * FOCUS-08, BREAK-01); during a break, only `Encerrar intervalo` (BREAK-04).
 */
export function FocusControls({ display, taskId, pending, actions }: FocusControlsProps) {
  const { t } = useTranslation()

  if (display.mode === 'break') {
    return (
      <div className="flex justify-center">
        <Button variant="outline" onClick={() => actions.endBreak()}>
          <Square /> {t('focus.controls.endBreak')}
        </Button>
      </div>
    )
  }

  const running = display.mode === 'countdown' || display.mode === 'countup'
  if ((!running && display.mode !== 'paused') || taskId === null) return null

  return (
    <div className="flex flex-wrap justify-center gap-2">
      {running ? (
        <Button variant="outline" onClick={() => actions.pause()}>
          <Pause /> {t('focus.controls.pause')}
        </Button>
      ) : (
        <Button onClick={() => actions.start(taskId)}>
          <Play /> {t('focus.controls.resume')}
        </Button>
      )}
      <Button variant="outline" disabled={pending <= 1} onClick={() => actions.skip(taskId)}>
        <SkipForward /> {t('focus.controls.skip')}
      </Button>
      <Button variant="outline" onClick={() => actions.complete(taskId)}>
        <Check /> {t('focus.controls.complete')}
      </Button>
      <BreakPicker onPick={(minutes) => actions.takeBreak(minutes)} />
    </div>
  )
}
