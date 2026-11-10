import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES } from '@/lib/agenda/layout'
import { HOVER_RING } from '@/lib/agenda/hover-ring'
import { scheduledColors } from '@/lib/agenda/scheduled-colors'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { DraftBlock } from '@/lib/plan/draft'
import { longDay } from '@/lib/schedule'
import { cn } from '@/lib/utils'

/** A block of the draft as the grid lays it out: its drawn minutes, cut at 24:00 (PLAN-44), and its lane. */
export interface LaidPlanBlock {
  block: DraftBlock
  start: number
  end: number
  lane: number
  lanes: number
}

interface PlanBlockProps {
  piece: LaidPlanBlock
  /** The day of the plan: a task scheduled for another day shows `Agendada para <dia>` (PLAN-38). */
  day: string
  pxPerMinute: number
  /** The block is open in the editor. */
  selected?: boolean
  /** A click or Enter opens the block (PLAN-06); absent, the block only shows. */
  onOpen?: () => void
  /** Starts moving the block (PLAN-05); absent, the block does not move. */
  onPointerDown?: (event: PointerEvent) => void
  /** The handle of the bottom edge, drawn by the grid. */
  children?: ReactNode
  /** Shown on hover and focus, as on the Agenda's blocks (PLAN-46). */
  tooltip?: ReactNode
}


/** A break: gray and hatched, unlike any task (PLAN-15). */
const breakFill: CSSProperties = {
  backgroundImage: 'repeating-linear-gradient(135deg, var(--muted) 0 6px, var(--border) 6px 8px)',
}

/**
 * A block of the day plan (PLAN-15, PLAN-38, PLAN-39): the title, `HH:MM – HH:MM` and, for a task, its length. A task
 * takes the faint colour and the 2px dashed edge of a task on the Agenda, solid on hover, crossed out once done; a task scheduled for another day carries
 * `Agendada para <dia>`. A break is gray and hatched, with a dashed edge like a break session.
 */
export function PlanBlock({ piece, day, pxPerMinute, selected = false, onOpen, onPointerDown, children, tooltip }: PlanBlockProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const { block } = piece
  const isTask = block.kind === 'task'
  const title = isTask ? block.task.title : block.name
  const done = isTask && block.task.done
  const elsewhere = isTask && block.task.scheduled_on !== null && block.task.scheduled_on !== day ? block.task.scheduled_on : null

  const range = t('plan.block.range', { start: minuteClock(block.start), end: minuteClock((block.start + block.minutes) % DAY_MINUTES) })
  const when = isTask ? `${range} · ${formatDuration(block.minutes * 60, language)}` : range
  const height = Math.max(1, (piece.end - piece.start) * pxPerMinute)
  // Under half an hour, the title and the time share one line.
  const short = piece.end - piece.start < 30

  const style: CSSProperties = {
    top: piece.start * pxPerMinute,
    height,
    left: `${(piece.lane / piece.lanes) * 100}%`,
    width: `${100 / piece.lanes}%`,
    ...(isTask ? scheduledColors(block.task.list.color) : breakFill),
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpen || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onOpen()
  }

  const drawn = (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${title}, ${when}`}
      aria-pressed={selected}
      data-plan-block={block.key}
      data-kind={block.kind}
      data-done={done || undefined}
      className={cn(
        'absolute flex overflow-hidden rounded-md px-2 text-xs select-none',
        short ? 'flex-row items-center gap-2' : 'flex-col gap-0.5 py-1',
        // The edges of the Agenda: a task's in the faint colour of its list, a break's gray; a block that opens or moves rings on hover.
        isTask ? 'border-2 border-dashed text-foreground' : 'border-2 border-dashed border-muted-foreground/60 text-muted-foreground',
        (onOpen || onPointerDown) && HOVER_RING,
        onPointerDown && 'cursor-grab',
        selected && 'z-10 ring-2 ring-primary ring-offset-1 ring-offset-background',
        'outline-2 outline-transparent focus-visible:outline-(--ring)',
      )}
      style={style}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      onPointerDown={(event) => (onPointerDown ? onPointerDown(event) : event.stopPropagation())}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span data-slot="plan-block-title" className={cn('truncate font-semibold', done && 'text-muted-foreground line-through')}>
          {title}
        </span>
        {elsewhere && (
          <span
            data-slot="plan-block-elsewhere"
            className="shrink-0 rounded-full bg-amber-100 px-1.5 text-[11px] whitespace-nowrap text-amber-900 dark:bg-amber-950 dark:text-amber-200"
          >
            {t('schedule.scheduledFor', { day: longDay(elsewhere, t, language) })}
          </span>
        )}
      </span>
      <span data-slot="plan-block-time" className="shrink-0 tabular-nums text-muted-foreground">
        {when}
      </span>
      {children}
    </div>
  )
  if (tooltip === undefined) return drawn
  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>{drawn}</TooltipTrigger>
        <TooltipContent side="right" className="flex flex-col gap-0.5">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
