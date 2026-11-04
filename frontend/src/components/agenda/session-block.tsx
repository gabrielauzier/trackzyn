import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { clockTime } from '@/lib/agenda/format'
import type { LaidOutPiece } from '@/lib/agenda/layout'
import { cn } from '@/lib/utils'

/** Below this length a block shows its title and time on a single line. */
const ONE_LINE_MINUTES = 15

interface SessionBlockProps {
  piece: LaidOutPiece
  pxPerMinute: number
  /** The workspace timezone; the times read in it. */
  timezone: string
  selected?: boolean
  onSelect?: () => void
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  /** The edge handles of a selected block. */
  children?: ReactNode
}

/**
 * One session on the grid (AGENDA-03 to AGENDA-05): its title (or `Intervalo`) and `HH:MM – HH:MM`, in
 * the color of its list; a break in grey with a dashed border; an open session with an indigo border and
 * `agora` for its end.
 */
export function SessionBlock({ piece, pxPerMinute, timezone, selected = false, onSelect, onPointerDown, children }: SessionBlockProps) {
  const { t } = useTranslation()
  const { session } = piece
  const isBreak = session.kind === 'break'
  const title = isBreak ? t('agenda.break') : (session.task_title ?? '')
  const range = t('agenda.range', {
    start: clockTime(session.started_at, timezone),
    end: session.ended_at === null ? t('agenda.now') : clockTime(session.ended_at, timezone),
  })
  const oneLine = piece.end - piece.start < ONE_LINE_MINUTES
  const color = `var(--chart-${session.list_color})`
  const style: CSSProperties = {
    top: piece.start * pxPerMinute,
    height: Math.max(1, (piece.end - piece.start) * pxPerMinute),
    left: `${(piece.lane / piece.lanes) * 100}%`,
    width: `${100 / piece.lanes}%`,
    ...(isBreak ? {} : { backgroundColor: `color-mix(in oklab, ${color} 18%, var(--background))` }),
    ...(isBreak || piece.running ? {} : { borderLeftColor: color }),
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect?.()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${range}`}
      aria-pressed={selected}
      data-session-id={session.id}
      data-kind={session.kind}
      data-running={piece.running || undefined}
      className={cn(
        'absolute overflow-hidden rounded-md px-1.5 py-0.5 text-xs text-foreground select-none',
        isBreak ? 'border border-dashed border-muted-foreground/60 bg-muted' : 'border-l-4',
        piece.running && 'border-2 border-primary',
        selected && 'z-10 ring-2 ring-ring ring-offset-1 ring-offset-background',
      )}
      style={style}
      onClick={onSelect}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
    >
      <div className={cn('min-w-0', oneLine ? 'flex items-baseline gap-1 truncate' : 'flex flex-col')}>
        <span className="truncate font-medium">{title}</span>
        <span className={cn('tabular-nums text-muted-foreground', oneLine && 'shrink-0')}>{range}</span>
      </div>
      {children}
    </div>
  )
}
