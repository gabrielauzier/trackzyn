import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { clockTime } from '@/lib/agenda/format'
import type { LaidOutPiece } from '@/lib/agenda/layout'
import { cn } from '@/lib/utils'

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
 * One session on the grid (AGENDA-03 to AGENDA-05), in the color of its list; a break in grey with a dashed
 * border; an open session with an indigo border. The block carries no text: hovering or focusing it opens a
 * tooltip with the whole title (or `Intervalo`) and `HH:MM – HH:MM`, `agora` for the end of an open session.
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
  const color = `var(--chart-${session.list_color})`
  const style: CSSProperties & Record<'--block-color', string> = {
    '--block-color': isBreak ? 'var(--muted-foreground)' : color,
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            aria-label={`${title}, ${range}`}
            aria-pressed={selected}
            data-session-id={session.id}
            data-kind={session.kind}
            data-running={piece.running || undefined}
            className={cn(
              'absolute overflow-hidden rounded-md opacity-75 select-none transition-[opacity,outline-color]',
              'outline-2 outline-transparent hover:z-20 hover:opacity-100 hover:outline-(--block-color)',
              'focus-visible:opacity-100 focus-visible:outline-(--block-color)',
              isBreak ? 'border border-dashed border-muted-foreground/60 bg-muted' : 'border-l-4',
              piece.running && 'border-2 border-primary',
              selected && 'z-10 opacity-100 ring-2 ring-ring ring-offset-1 ring-offset-background',
            )}
            style={style}
            onClick={onSelect}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
          >
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex flex-col gap-0.5">
          <span className="font-medium break-words whitespace-normal">{title}</span>
          <span className="tabular-nums opacity-80">{range}</span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
