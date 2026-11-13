import type { CSSProperties, ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { minuteClock } from '@/lib/agenda/format'
import { scheduledColors } from '@/lib/agenda/scheduled-colors'
import { timelineRange } from '@/lib/today/rules'
import { cn } from '@/lib/utils'
import type { TodayPlanBlock, TodaySession, Workday } from '@/types'

interface PlanVsRealProps {
  /** Today, `YYYY-MM-DD`, for the link to plan it. */
  day: string
  workday: Workday
  planSaved: boolean
  blocks: TodayPlanBlock[]
  sessions: TodaySession[]
  nowMinute: number
}

interface Piece {
  key: string
  title: string
  start: number
  end: number
  look: 'planned' | 'logged' | 'break'
  color: number | null
}

/**
 * `Plano × real`: today's plan above the reader's sessions on one scale of full hours (HOJE-42, HOJE-43). A task block
 * is dashed in the faint colour of its list, a task session solid with white text, a break gray (HOJE-44); the open
 * session runs until now and a line marks now across both rows (HOJE-45). A narrow window scrolls the timeline inside
 * the card (HOJE-48).
 */
export function PlanVsReal({ day, workday, planSaved, blocks, sessions, nowMinute }: PlanVsRealProps) {
  const { t } = useTranslation()
  // The open session goes until now, whatever its last read said.
  const drawn = sessions.map((session) => (session.open ? { ...session, end_minute: Math.max(session.end_minute, nowMinute) } : session))
  const { from, to } = timelineRange(workday, blocks, drawn)
  const span = Math.max(1, to - from)
  const pct = (minute: number) => ((minute - from) / span) * 100

  const planned: Piece[] = blocks.map((block) => ({
    key: block.id,
    title: block.title,
    start: block.start_minute,
    end: block.start_minute + block.minutes,
    look: block.kind === 'task' ? 'planned' : 'break',
    color: block.list_color,
  }))
  const logged: Piece[] = drawn.map((session) => ({
    key: session.id,
    title: session.title ?? t('today.timeline.breakTitle'),
    start: session.start_minute,
    end: session.end_minute,
    look: session.kind === 'task' ? 'logged' : 'break',
    color: session.list_color,
  }))
  const hours = Array.from({ length: (to - from) / 60 + 1 }, (_, index) => from / 60 + index)

  const strip = (label: string, pieces: Piece[], empty?: ReactNode) => (
    <>
      <div className="text-xs text-muted-foreground">{label}</div>
      <ul aria-label={label} className="relative h-8">
        {pieces.map((piece) => {
          const style: CSSProperties = { left: `${pct(piece.start)}%`, width: `${pct(piece.end) - pct(piece.start)}%` }
          if (piece.look === 'planned' && piece.color !== null) Object.assign(style, scheduledColors(piece.color))
          if (piece.look === 'logged') style.backgroundColor = `var(--chart-${piece.color})`
          return (
            <li
              key={piece.key}
              title={t('today.timeline.item', { title: piece.title, start: minuteClock(piece.start), end: minuteClock(piece.end) })}
              className={cn(
                'absolute inset-y-0 flex items-center overflow-hidden rounded-md px-1.5 text-[11px] whitespace-nowrap',
                piece.look === 'planned' && 'border-[1.5px] border-dashed text-foreground',
                piece.look === 'logged' && 'text-white',
                piece.look === 'break' && 'border bg-muted text-muted-foreground',
              )}
              style={style}
            >
              <span className="truncate">{piece.title}</span>
            </li>
          )
        })}
        {empty}
      </ul>
    </>
  )

  return (
    <section aria-labelledby="today-timeline" className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="today-timeline" className="text-sm font-semibold">
          {t('today.timeline.title')}
        </h2>
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm border border-dashed border-foreground/50" />
            {t('today.timeline.planned')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm bg-foreground/70" />
            {t('today.timeline.logged')}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-sm border bg-muted" />
            {t('today.timeline.break')}
          </span>
        </div>
      </div>
      <div data-testid="timeline-scroll" className="overflow-x-auto">
        <div className="relative grid min-w-[720px] grid-cols-[3.5rem_1fr] items-center gap-x-2 gap-y-1.5">
          <div />
          <div className="relative h-4">
            {hours.map((hour) => (
              <span
                key={hour}
                data-testid="timeline-tick"
                className="absolute -translate-x-1/2 text-[11px] text-muted-foreground tabular-nums"
                style={{ left: `${pct(hour * 60)}%` }}
              >
                {t('today.timeline.hour', { hour: String(hour).padStart(2, '0') })}
              </span>
            ))}
          </div>
          {strip(
            t('today.timeline.plan'),
            planned,
            !planSaved && (
              <li className="absolute inset-0 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                {t('today.timeline.noPlan')}
                <Link to={`/planejar/${day}`} className="font-medium text-primary underline-offset-2 hover:underline">
                  {t('today.timeline.planToday')}
                </Link>
              </li>
            ),
          )}
          {strip(t('today.timeline.real'), logged)}
          {nowMinute >= from && nowMinute <= to && (
            <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 left-[calc(3.5rem+0.5rem)]">
              <div
                data-testid="timeline-now"
                className="absolute inset-y-0 w-px bg-rose-600"
                style={{ left: `${pct(nowMinute)}%` }}
              >
                <span className="absolute -bottom-4 -translate-x-1/2 text-[10px] font-medium text-rose-600">{t('today.timeline.now')}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
