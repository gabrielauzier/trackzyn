import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { clockTime } from '@/lib/agenda/format'
import type { LaidOutPiece } from '@/lib/agenda/layout'
import { cn } from '@/lib/utils'
import type { AgendaSession } from '@/types'

/** The edge of a block in its list colour, the left stripe pure and the other sides mixed to keep 3:1 (WCAG 1.4.11). */
function edgeColors(color: string): CSSProperties {
  const edge = `color-mix(in oklab, ${color} var(--session-edge), var(--foreground))`
  return { borderTopColor: edge, borderRightColor: edge, borderBottomColor: edge, borderLeftColor: color }
}

interface SessionBlockProps {
  piece: LaidOutPiece
  pxPerMinute: number
  /** The workspace timezone; the times read in it. */
  timezone: string
  selected?: boolean
  onSelect?: () => void
  onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
  /** Whether the block moves when dragged: its body shows the open hand (ADJ-14). */
  movable?: boolean
  /** The edge handles of a selected block. */
  children?: ReactNode
}

/**
 * One session on the grid (AGENDA-03 to AGENDA-05), in the color of its list; a break in grey with a dotted
 * border, as scheduled tasks and planned breaks; an open session with an indigo border. The block carries no text: hovering or focusing it opens a
 * tooltip with the whole title (or `Intervalo`) and `HH:MM – HH:MM`, `agora` for the end of an open session.
 * A joined block (`piece.members`) carries only the count of its sessions in its top right corner, and its
 * tooltip lists each session (MERGE-25, MERGE-26, MERGE-32).
 */
export function SessionBlock({ piece, pxPerMinute, timezone, selected = false, onSelect, onPointerDown, movable = false, children }: SessionBlockProps) {
  const { t, i18n } = useTranslation()
  const { session } = piece
  const isBreak = session.kind === 'break'
  const members = piece.members
  const titleOf = (member: AgendaSession) => (member.kind === 'break' ? t('agenda.break') : (member.task_title ?? ''))
  const rangeOf = (start: string, end: string | null) =>
    t('agenda.range', { start: clockTime(start, timezone), end: end === null ? t('agenda.now') : clockTime(end, timezone) })
  const title = titleOf(session)
  const range = rangeOf(session.started_at, session.ended_at)
  const count = members ? t('agenda.sessionCount', { count: members.length }) : ''
  // The whole length of a closed session; an open one runs to now, as its piece does.
  const secondsOf = (member: AgendaSession) =>
    member.ended_at === null ? piece.seconds : Math.max(0, Math.floor((Date.parse(member.ended_at) - Date.parse(member.started_at)) / 1000))
  // A joined block lasts the sum of its sessions, not the gaps between them (MERGE-20).
  const duration = formatDuration(members ? members.reduce((sum, member) => sum + secondsOf(member), 0) : secondsOf(session), i18n.language)
  // A joined block spans from its first start to the latest end of its sessions.
  const lastEnd = members && new Date(Math.max(...members.map((member) => Date.parse(member.ended_at!)))).toISOString()
  const label = lastEnd ? `${session.list_name}, ${count}, ${rangeOf(session.started_at, lastEnd)}` : `${title}, ${range}`
  const color = `var(--chart-${session.list_color})`
  const style: CSSProperties & Record<'--block-color', string> = {
    '--block-color': isBreak ? 'var(--muted-foreground)' : color,
    top: piece.start * pxPerMinute,
    height: Math.max(1, (piece.end - piece.start) * pxPerMinute),
    left: `${(piece.lane / piece.lanes) * 100}%`,
    width: `${100 / piece.lanes}%`,
    // Mixed with the card the grid is drawn on, in a share each theme sets (index.css), so the block stands out
    // from the column in light and dark; the edge keeps 3:1 against it (WCAG 1.4.11).
    ...(isBreak ? {} : { backgroundColor: `color-mix(in oklab, ${color} var(--session-tint), var(--card))` }),
    ...(isBreak || piece.running ? {} : edgeColors(color)),
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onSelect?.()
  }

  return (
    // The tooltip opens at once, without the 200 ms wait of the app tooltips.
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            aria-label={label}
            aria-pressed={selected}
            data-session-id={session.id}
            data-kind={session.kind}
            data-running={piece.running || undefined}
            data-joined={members ? true : undefined}
            className={cn(
              'absolute overflow-hidden rounded-md select-none transition-[background-color,outline-color]',
              // Hovered or focused, the fill takes more of the list colour and the outline shows.
              'outline-2 outline-transparent hover:z-20 hover:[--session-tint:var(--session-tint-hover)] hover:outline-(--block-color)',
              'focus-visible:[--session-tint:var(--session-tint-hover)] focus-visible:outline-(--block-color)',
              isBreak ? 'border-2 border-dotted border-muted-foreground bg-muted' : 'border border-l-4',
              piece.running && 'border-2 border-primary',
              movable && 'cursor-grab',
              selected && 'z-10 [--session-tint:var(--session-tint-hover)] ring-2 ring-ring ring-offset-1 ring-offset-background',
            )}
            style={style}
            onClick={onSelect}
            onKeyDown={onKeyDown}
            onPointerDown={onPointerDown}
          >
            {members && (
              <span
                data-slot="session-count"
                className="absolute top-0 right-0 rounded-bl-md bg-background/80 px-1 text-[10px] font-medium tabular-nums"
              >
                {members.length}
              </span>
            )}
            {children}
          </div>
        </TooltipTrigger>
        {members ? (
          <TooltipContent side="right" className="flex flex-col gap-1">
            <span className="font-medium break-words whitespace-normal">{`${session.list_name} · ${count} · ${duration}`}</span>
            <ul className="flex flex-col gap-0.5">
              {members.map((member) => (
                <li key={member.id} className="flex gap-2">
                  <span className="break-words whitespace-normal">{titleOf(member)}</span>
                  <span className="ml-auto tabular-nums opacity-80">{rangeOf(member.started_at, member.ended_at)}</span>
                </li>
              ))}
            </ul>
            <span className="opacity-80">{t('agenda.pickSession')}</span>
          </TooltipContent>
        ) : (
          <TooltipContent side="right" className="flex flex-col gap-0.5">
            <span className="flex items-baseline gap-2">
              <span className="font-medium break-words whitespace-normal">{title}</span>
              <span data-slot="session-duration" className="shrink-0 tabular-nums opacity-80">
                {duration}
              </span>
            </span>
            <span className="tabular-nums opacity-80">{range}</span>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
