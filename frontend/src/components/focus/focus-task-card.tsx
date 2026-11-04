import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Display } from '@/lib/focus/display'
import { formatClock } from '@/lib/focus/format-clock'

interface FocusTaskCardProps {
  title: string
  display: Display
  /** Opened without starting a task that never counted: dashed, the estimate in grey and `Cronômetro parado` (#14). */
  stopped?: boolean
  /** While a next task is dragged over it: the card is the drop area, with this line under `Solte para focar nesta agora` (#15). */
  dropHint?: string | null
  /** Under the title and the timer, past a line: the subtasks of the task (#16). */
  children?: ReactNode
  className?: string
}

/** The task in focus: highlighted contour, its title and the timer as the display reads it (FOCUS-02, FOCUS-03, FOCUS-13). */
export function FocusTaskCard({ title, display, stopped = false, dropHint = null, children, className }: FocusTaskCardProps) {
  const { t } = useTranslation()
  const running = display.mode === 'countdown' || display.mode === 'countup'
  const dropping = dropHint !== null

  if (dropping) {
    return (
      <div
        data-running={running}
        data-drop-zone
        className={cn('flex min-h-16 flex-col justify-center gap-1 rounded-xl border-2 border-dashed border-primary bg-primary/10 px-4 py-3', className)}
      >
        <span className="text-sm font-semibold text-primary">{t('focus.queue.dropToFocus')}</span>
        {dropHint && <span className="text-xs text-muted-foreground">{dropHint}</span>}
      </div>
    )
  }

  return (
    <div
      data-running={running}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 rounded-xl border-2 border-primary bg-card px-4 py-3 shadow-sm',
        !running && 'border-primary/50',
        stopped && 'border-dashed shadow-none',
        className,
      )}
    >
      <div className="flex min-w-0 flex-col items-start gap-1">
        <span className="max-w-full truncate text-base font-medium">{title}</span>
        {stopped && <Badge variant="secondary">{t('focus.card.stopped')}</Badge>}
      </div>
      <span role="timer" className={cn('shrink-0 font-mono text-2xl font-bold tabular-nums', stopped && 'text-muted-foreground')}>
        {formatClock(display.mode === 'awaiting_extend' ? 0 : display.seconds)}
      </span>
      {children && <div className="col-span-2 -mx-4 mt-3 border-t px-3 pt-3">{children}</div>}
    </div>
  )
}
