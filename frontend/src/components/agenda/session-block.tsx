import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { clockTime } from '@/lib/agenda/format'
import type { LaidOutPiece } from '@/lib/agenda/layout'
import { cn } from '@/lib/utils'
import type { AgendaSession } from '@/types'

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
 * A joined block (`piece.members`) carries only the count of its sessions in its top right corner, and its
 * tooltip lists each session (MERGE-25, MERGE-26, MERGE-32).
 */
export function SessionBlock({ piece, pxPerMinute, timezone, selected = false, onSelect, onPointerDown, children }: SessionBlockProps) {
  const { t } = useTranslation()
  const { session } = piece
  const isBreak = session.kind === 'break'
  const members = piece.members
  const titleOf = (member: AgendaSession) => (member.kind === 'break' ? t('agenda.break') : (member.task_title ?? ''))
  const rangeOf = (start: string, end: string | null) =>
    t('agenda.range', { start: clockTime(start, timezone), end: end === null ? t('agenda.now') : clockTime(end, timezone) })
  const title = titleOf(session)
  const range = rangeOf(session.started_at, session.ended_at)
  const count = members ? t('agenda.sessionCount', { count: members.length }) : ''
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
            aria-label={label}
            aria-pressed={selected}
            data-session-id={session.id}
            data-kind={session.kind}
            data-running={piece.running || undefined}
            data-joined={members ? true : undefined}
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
            <span className="font-medium break-words whitespace-normal">{`${session.list_name} · ${count}`}</span>
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
            <span className="font-medium break-words whitespace-normal">{title}</span>
            <span className="tabular-nums opacity-80">{range}</span>
          </TooltipContent>
        )}
      </Tooltip>
    </TooltipProvider>
  )
}
