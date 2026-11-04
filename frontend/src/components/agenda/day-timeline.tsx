import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { SessionBlock } from '@/components/agenda/session-block'
import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { Button } from '@/components/ui/button'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES, assignLanes, dayLimit, dayOf, dayPieces, dayTotal, minuteOf, mondayOf, weekDays } from '@/lib/agenda/layout'
import { useZoomScroll } from '@/lib/agenda/use-zoom-scroll'
import { cn } from '@/lib/utils'
import type { AgendaSession } from '@/types'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)
const HATCH = 'repeating-linear-gradient(135deg, var(--muted) 0 6px, transparent 6px 12px)'

interface DayTimelineProps {
  /** The day shown, YYYY-MM-DD in the workspace timezone. */
  day: string
  /** The sessions of the week of `day`. */
  sessions: AgendaSession[]
  timezone: string
  now: Date
  onPickDay: (day: string) => void
  /** Moves to the week before (-1) or after (1). */
  onWeek: (direction: -1 | 1) => void
  /** Opens `Nova sessão` on the day; absent for a user who cannot write (AGENDA-44). */
  onNew?: () => void
  selectedId?: string | null
  onSelect?: (session: AgendaSession) => void
  /** Pixels per minute, from the zoom; the default zoom's scale when absent. */
  pxPerMinute?: number
  /** Whether a session stays off the timeline (HIDE-11); it still counts in the total and the empty message (HIDE-14). */
  hidden?: (session: AgendaSession) => boolean
}

const utc = (day: string) => new Date(`${day}T00:00:00Z`)

/**
 * The agenda of one day, for narrow screens (AGENDA-36 to AGENDA-38, AGENDA-42, AGENDA-43): the pills of
 * the seven days from Monday, a dot on the days with sessions, the week arrows, the day and its total, a
 * single-column timeline, the messages of an empty or a future day, and the `+` button.
 */
export function DayTimeline({
  day,
  sessions,
  timezone,
  now,
  onPickDay,
  onWeek,
  onNew,
  selectedId = null,
  onSelect,
  pxPerMinute = PX_PER_MINUTE,
  hidden,
}: DayTimelineProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const scroller = useZoomScroll<HTMLDivElement>(pxPerMinute)
  const days = useMemo(() => weekDays(mondayOf(day)), [day])
  const pieces = useMemo(() => dayPieces(sessions, days, timezone, now), [sessions, days, timezone, now])
  const today = dayOf(now, timezone)
  const ofDay = pieces.get(day) ?? []
  const laid = assignLanes(hidden ? ofDay.filter((piece) => !hidden(piece.session)) : ofDay)
  const total = dayTotal(ofDay)
  const limit = dayLimit(day, now, timezone)


  const title = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(utc(day))

  return (
    <div className="relative flex flex-col gap-3">
      <div className="flex items-center gap-1">
        <Button type="button" variant="ghost" size="icon" aria-label={t('agenda.previousWeek')} onClick={() => onWeek(-1)}>
          <ChevronLeft size={16} />
        </Button>
        <div role="group" aria-label={t('agenda.days')} className="grid flex-1 grid-cols-7 gap-1">
          {days.map((option) => (
            <button
              key={option}
              type="button"
              data-day-pill={option}
              aria-pressed={option === day}
              className={cn(
                'flex flex-col items-center gap-0.5 rounded-lg py-1.5 text-xs',
                option === day ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted',
                option === today && option !== day && 'text-primary',
              )}
              onClick={() => onPickDay(option)}
            >
              <span>{new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(utc(option))}</span>
              <span className="text-sm font-semibold">{Number(option.slice(8))}</span>
              <span
                aria-hidden
                data-has-sessions={(pieces.get(option)?.length ?? 0) > 0 || undefined}
                className={cn('size-1 rounded-full', (pieces.get(option)?.length ?? 0) > 0 ? 'bg-current' : 'bg-transparent')}
              />
            </button>
          ))}
        </div>
        <Button type="button" variant="ghost" size="icon" aria-label={t('agenda.nextWeek')} onClick={() => onWeek(1)}>
          <ChevronRight size={16} />
        </Button>
      </div>

      <h2 className="text-base font-semibold first-letter:uppercase" aria-live="polite">
        {total > 0 ? `${title} · ${formatDuration(total, locale)}` : title}
      </h2>

      {ofDay.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-center text-sm text-muted-foreground">
          {day > today ? t('agenda.futureDay') : t('agenda.emptyDay')}
        </p>
      )}

      <div ref={scroller} data-agenda-scroll className="relative max-h-[calc(100vh-18rem)] min-h-80 overflow-y-auto rounded-xl border bg-card">
        <div className="relative flex" style={{ height: DAY_MINUTES * pxPerMinute }}>
          <div className="relative w-12 shrink-0" aria-hidden>
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: hour * 60 * pxPerMinute }}
              >
                {hour === 0 ? '' : minuteClock(hour * 60)}
              </span>
            ))}
          </div>
          <div data-agenda-column={day} className="relative flex-1 border-l">
            {HOURS.map((hour) => (
              <div
                key={hour}
                aria-hidden
                className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                style={{ top: hour * 60 * pxPerMinute }}
              />
            ))}
            {limit < DAY_MINUTES && (
              <div
                aria-hidden
                data-future
                className="pointer-events-none absolute inset-x-0 bottom-0"
                style={{ top: limit * pxPerMinute, backgroundImage: HATCH }}
              />
            )}
            <div className="absolute inset-0 mx-0.5">
              {laid.map((piece) => (
                <SessionBlock
                  key={piece.session.id}
                  piece={piece}
                  pxPerMinute={pxPerMinute}
                  timezone={timezone}
                  selected={piece.session.id === selectedId}
                  onSelect={onSelect && (() => onSelect(piece.session))}
                />
              ))}
            </div>
            {day === today && (
              <div
                aria-hidden
                data-now-line
                className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-primary"
                style={{ top: minuteOf(now, timezone) * pxPerMinute }}
              />
            )}
          </div>
        </div>
      </div>

      {/* A day that has not begun takes no session (AGENDA-23). */}
      {onNew && day <= today && (
        <Button
          type="button"
          size="icon"
          aria-label={t('agenda.newSession')}
          className="absolute right-3 bottom-3 z-40 size-12 rounded-full shadow-lg"
          onClick={onNew}
        >
          <Plus size={20} />
        </Button>
      )}
    </div>
  )
}
