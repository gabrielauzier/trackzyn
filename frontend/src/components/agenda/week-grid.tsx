import { useLayoutEffect, useMemo, useRef, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { SessionBlock } from '@/components/agenda/session-block'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES, assignLanes, dayLimit, dayOf, dayPieces, dayTotal, minuteOf, zonedInstant, type Piece } from '@/lib/agenda/layout'
import type { DragTarget, useGridDrag } from '@/lib/agenda/use-grid-drag'
import { cn } from '@/lib/utils'
import type { AgendaSession } from '@/types'

/** 144 px per hour. */
export const PX_PER_MINUTE = 2.4
/** The grid opens scrolled to this hour (AGENDA-02). */
const FIRST_HOUR = 7
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** Lines across the time after now, where nothing can be recorded (AGENDA-23). */
const HATCH = 'repeating-linear-gradient(135deg, var(--muted) 0 6px, transparent 6px 12px)'

export type GridDrag = ReturnType<typeof useGridDrag>

interface WeekGridProps {
  /** The days of the columns, Monday to Sunday (or a single day). */
  days: string[]
  sessions: AgendaSession[]
  /** The workspace timezone; days, times and midnight read in it. */
  timezone: string
  now: Date
  /** The gestures of the grid; absent for a user who cannot write (AGENDA-44). */
  drag?: GridDrag
  selectedId?: string | null
  onSelect?: (session: AgendaSession) => void
}

/** The whole session in minutes since the local midnight of the piece's day, which may run past either end of it. */
function targetOf(piece: Piece, timezone: string): DragTarget {
  const midnight = zonedInstant(piece.day, 0, timezone).getTime()
  const minutes = (instant: string) => Math.round((Date.parse(instant) - midnight) / 60_000)
  return { day: piece.day, start: minutes(piece.session.started_at), end: minutes(piece.session.ended_at!), sessionId: piece.session.id }
}

function weekdayLabel(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

/**
 * The week as a grid from 00:00 to 24:00 (AGENDA-01): a column per day with its weekday, its number and the
 * time of its task sessions; the sessions as blocks, side by side where they overlap (AGENDA-06); the now
 * line on today (AGENDA-05) and the time after now hatched, where no drag starts (AGENDA-23).
 */
export function WeekGrid({ days, sessions, timezone, now, drag, selectedId = null, onSelect }: WeekGridProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const scroller = useRef<HTMLDivElement>(null)
  const today = dayOf(now, timezone)
  const nowMinute = minuteOf(now, timezone)
  const draft = drag?.draft ?? null
  const newDraft = draft !== null && draft.sessionId === null ? draft : null
  const adjusting = draft !== null && draft.sessionId !== null ? draft : null
  // The session being adjusted follows the pointer until it is released.
  const shown = useMemo(
    () =>
      adjusting === null
        ? sessions
        : sessions.map((session) =>
            session.id === adjusting.sessionId
              ? {
                  ...session,
                  started_at: zonedInstant(adjusting.day, adjusting.start, timezone).toISOString(),
                  ended_at: zonedInstant(adjusting.day, adjusting.end, timezone).toISOString(),
                }
              : session,
          ),
    [sessions, adjusting, timezone],
  )
  const pieces = useMemo(() => dayPieces(shown, days, timezone, now), [shown, days, timezone, now])

  useLayoutEffect(() => {
    if (scroller.current) scroller.current.scrollTop = FIRST_HOUR * 60 * PX_PER_MINUTE
  }, [])

  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card">
      {/* Both reserve the scrollbar's width, so the day headers line up with the columns under them. */}
      <div data-agenda-header className="flex overflow-y-hidden border-b [scrollbar-gutter:stable]">
        <div className="w-14 shrink-0" />
        {days.map((day) => {
          const total = dayTotal(pieces.get(day) ?? [])
          return (
            <div
              key={day}
              data-day-header={day}
              className={cn('flex flex-1 flex-col items-center gap-0.5 border-l py-2', day === today && 'text-primary')}
            >
              <span className="text-xs uppercase text-muted-foreground">{weekdayLabel(day, locale)}</span>
              <span className="text-lg font-semibold leading-none">
                {Number(day.slice(8))}
              </span>
              <span className="h-4 text-xs tabular-nums text-muted-foreground">
                {total > 0 ? formatDuration(total, locale) : ''}
              </span>
            </div>
          )
        })}
      </div>
      <div ref={scroller} data-agenda-scroll className="relative max-h-[calc(100vh-14rem)] min-h-80 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="relative flex" style={{ height: DAY_MINUTES * PX_PER_MINUTE }}>
          <div className="relative w-14 shrink-0" aria-hidden>
            {HOURS.map((hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
                style={{ top: hour * 60 * PX_PER_MINUTE }}
              >
                {hour === 0 ? '' : minuteClock(hour * 60)}
              </span>
            ))}
          </div>
          {days.map((day) => {
            const limit = dayLimit(day, now, timezone)
            const laid = assignLanes(pieces.get(day) ?? [])
            return (
              <div
                key={day}
                data-agenda-column={day}
                className="relative flex-1 border-l"
                onPointerDown={drag ? (event: PointerEvent) => drag.startCreate(event, day) : undefined}
              >
                {HOURS.map((hour) => (
                  <div
                    key={hour}
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 border-t border-border/60"
                    style={{ top: hour * 60 * PX_PER_MINUTE }}
                  />
                ))}
                {limit < DAY_MINUTES && (
                  <div
                    aria-hidden
                    data-future
                    className="pointer-events-none absolute inset-x-0 bottom-0"
                    style={{ top: limit * PX_PER_MINUTE, backgroundImage: HATCH }}
                  />
                )}
                <div className="absolute inset-0 mx-0.5">
                  {laid.map((piece) => {
                    // The running session ends now: it has no handles and does not move (AGENDA-33).
                    const target = drag && piece.session.ended_at !== null ? targetOf(piece, timezone) : null
                    const selected = piece.session.id === selectedId
                    return (
                      <SessionBlock
                        key={piece.session.id}
                        piece={piece}
                        pxPerMinute={PX_PER_MINUTE}
                        timezone={timezone}
                        selected={selected}
                        onSelect={onSelect && (() => onSelect(piece.session))}
                        onPointerDown={(event) => (target ? drag!.startMove(event, target) : event.stopPropagation())}
                      >
                        {target &&
                          selected &&
                          (['top', 'bottom'] as const)
                            // Each handle sits on the day that holds its edge.
                            .filter((edge) => (edge === 'top' ? target.start >= 0 : target.end <= DAY_MINUTES))
                            .map((edge) => (
                              <div
                                key={edge}
                                aria-hidden
                                data-handle={edge}
                                className={cn(
                                  'absolute inset-x-0 flex h-2 cursor-ns-resize justify-center',
                                  edge === 'top' ? 'top-0' : 'bottom-0',
                                )}
                                onPointerDown={(event) => drag!.startResize(event, edge, target)}
                              >
                                <span className="mt-0.5 h-1 w-6 rounded-full bg-foreground/50" />
                              </div>
                            ))}
                      </SessionBlock>
                    )
                  })}
                  {newDraft && newDraft.day === day && (
                    <div
                      data-draft
                      className="absolute inset-x-0 z-20 rounded-md border-2 border-dashed border-primary bg-primary/15 px-1.5 text-xs font-medium tabular-nums"
                      style={{ top: newDraft.start * PX_PER_MINUTE, height: (newDraft.end - newDraft.start) * PX_PER_MINUTE }}
                    >
                      {t('agenda.range', { start: minuteClock(newDraft.start), end: minuteClock(newDraft.end) })}
                      {(['top', 'bottom'] as const).map((edge) => (
                        <div
                          key={edge}
                          aria-hidden
                          data-handle={edge}
                          className={cn(
                            'absolute inset-x-0 h-2 cursor-ns-resize',
                            edge === 'top' ? '-top-1' : '-bottom-1',
                          )}
                          onPointerDown={(event) => drag?.startResize(event, edge, newDraft)}
                        />
                      ))}
                    </div>
                  )}
                </div>
                {day === today && (
                  <div
                    aria-hidden
                    data-now-line
                    className="pointer-events-none absolute inset-x-0 z-30 h-0.5 bg-primary"
                    style={{ top: nowMinute * PX_PER_MINUTE }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
