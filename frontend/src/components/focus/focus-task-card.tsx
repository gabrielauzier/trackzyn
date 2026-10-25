import { cn } from '@/lib/utils'
import type { Display } from '@/lib/focus/display'
import { formatClock } from '@/lib/focus/format-clock'

interface FocusTaskCardProps {
  title: string
  display: Display
  className?: string
}

/** The task in focus: highlighted contour, its title and the timer as the display reads it (FOCUS-02, FOCUS-03, FOCUS-13). */
export function FocusTaskCard({ title, display, className }: FocusTaskCardProps) {
  const running = display.mode === 'countdown' || display.mode === 'countup'
  return (
    <div
      data-running={running}
      className={cn(
        'flex items-center justify-between gap-3 rounded-xl border-2 border-primary bg-card px-4 py-3 shadow-sm',
        !running && 'border-primary/50',
        className,
      )}
    >
      <span className="min-w-0 truncate text-base font-medium">{title}</span>
      <span role="timer" className="shrink-0 font-mono text-2xl font-bold tabular-nums">
        {formatClock(display.mode === 'awaiting_extend' ? 0 : display.seconds)}
      </span>
    </div>
  )
}
