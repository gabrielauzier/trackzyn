import { useMemo, type PointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { PlannedBlock, type PlannedPiece } from '@/components/agenda/planned-block'
import { ScheduledBlock } from '@/components/agenda/scheduled-block'
import { SessionBlock } from '@/components/agenda/session-block'
import { UntimedRow } from '@/components/agenda/untimed-row'
import { minuteClock } from '@/lib/agenda/format'
import { scheduledColors } from '@/lib/agenda/scheduled-colors'
import { longDay } from '@/lib/schedule'
import { joinPieces } from '@/lib/agenda/join'
import {
  DAY_MINUTES,
  assignLanes,
  dayOf,
  dayPieces,
  dayTotal,
  minuteOf,
  scheduledMinutes,
  scheduledPieces,
  zonedInstant,
  type Piece,
  type ScheduledPiece,
} from '@/lib/agenda/layout'
import type { DragTarget, useGridDrag } from '@/lib/agenda/use-grid-drag'
import { useZoomScroll } from '@/lib/agenda/use-zoom-scroll'
import { clockMinutes } from '@/lib/plan/clock'
import { cn } from '@/lib/utils'
import type { AgendaSession, PlannedBlock as Planned, ProjectedOccurrence, ScheduledTask } from '@/types'

/** 144 px per hour: the scale at the default zoom (3x). */
export const PX_PER_MINUTE = 2.4
const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

const NONE: never[] = []

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
  /** Pixels per minute, from the zoom; the default zoom's scale when absent. */
  pxPerMinute?: number
  /** A control drawn in the top left corner of the header, above the hour column (DAYS-01). */
  corner?: ReactNode
  /** Whether a saved session stays off the grid (HIDE-11); it still counts in the day total (HIDE-14). */
  hidden?: (session: AgendaSession) => boolean
  /** Sessions of one list and kind this many minutes apart or less are drawn as one block (MERGE-11); null keeps them apart. */
  joinGap?: number | null
  /** The session chosen from a joined block, drawn on its own (MERGE-29). */
  apartId?: string | null
  /** A click on a joined block, with its sessions in start order (MERGE-27). */
  onSelectGroup?: (members: AgendaSession[]) => void
  /** The ids of the sessions of the chosen joined block; the block shows selected. */
  selectedGroup?: string[] | null
  /** The session hovered in the list of a joined block: it shows selected, without handles. */
  previewId?: string | null
  /** Heads each day with its whole date, `4 de Novembro de 2026`, in place of the day number: the day view (ADJ-16). */
  longDate?: boolean
  /** The pending tasks scheduled with a time, drawn as scheduled blocks (US-5). */
  timed?: ScheduledTask[]
  /** The future occurrences of the series, drawn fainter (US-11). */
  projected?: ProjectedOccurrence[]
  /** A click on a scheduled block opens its task: the task itself, or the open occurrence of a projection. */
  onOpenTask?: (taskId: string) => void
  /** The tasks scheduled without a time; given, the `Sem hora` row shows under the day headers (US-14). */
  untimed?: ScheduledTask[]
  /** `+X` of the `Sem hora` row: every scheduled task of the day. */
  onShowDay?: (day: string) => void
  /** The blocks of the user's saved plans, drawn beside the sessions; nothing drags them (PLAN-24). */
  planned?: Planned[]
  /** A click on a planned block: a task opens the plan of its day, a break its panel (PLAN-29). */
  onOpenPlanned?: (block: Planned) => void
  /** `Começar` on a break of today's plan (PLAN-26, PLAN-28). */
  onStartPlanned?: (block: Planned) => void
  /** `Planejar dia` in the header of today and the days after it: opens the plan of the day (PLAN-31). */
  onPlanDay?: (day: string) => void
}

/** The planned blocks of each day, in minutes since its midnight and cut at 24:00 (PLAN-44). */
function plannedPieces(planned: Planned[], days: string[]): Map<string, Omit<PlannedPiece, 'lane' | 'lanes'>[]> {
  const pieces = new Map<string, Omit<PlannedPiece, 'lane' | 'lanes'>[]>(days.map((day) => [day, []]))
  for (const block of planned) {
    const start = clockMinutes(block.start) ?? 0
    pieces.get(block.day)?.push({ planned: block, start, end: Math.min(DAY_MINUTES, start + block.minutes) })
  }
  return pieces
}

/** The whole session in minutes since the local midnight of the piece's day, which may run past either end of it. */
function targetOf(piece: Piece, timezone: string): DragTarget {
  const midnight = zonedInstant(piece.day, 0, timezone).getTime()
  const minutes = (instant: string) => Math.round((Date.parse(instant) - midnight) / 60_000)
  return { day: piece.day, start: minutes(piece.session.started_at), end: minutes(piece.session.ended_at!), sessionId: piece.session.id }
}

/** `4 de Novembro de 2026`: the day, the month name with a capital letter and the year (ADJ-16). */
function longDateLabel(day: string, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatToParts(
    new Date(`${day}T00:00:00Z`),
  )
  return parts.map((part) => (part.type === 'month' ? part.value.charAt(0).toLocaleUpperCase(locale) + part.value.slice(1) : part.value)).join('')
}

function weekdayLabel(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

/**
 * The week as a grid from 00:00 to 24:00 (AGENDA-01): a column per day with its weekday, its number and the
 * time of its task sessions; the sessions and the scheduled tasks as blocks, side by side where they overlap
 * (AGENDA-06, US-5); the now line on today (AGENDA-05). The time after now looks like the time before (D10).
 */
export function WeekGrid({
  days,
  sessions,
  timezone,
  now,
  drag,
  selectedId = null,
  onSelect,
  pxPerMinute = PX_PER_MINUTE,
  hidden,
  joinGap = null,
  apartId = null,
  onSelectGroup,
  selectedGroup = null,
  corner,
  longDate = false,
  previewId = null,
  timed = NONE,
  projected = NONE,
  onOpenTask,
  untimed,
  onShowDay,
  planned = NONE,
  onOpenPlanned,
  onStartPlanned,
  onPlanDay,
}: WeekGridProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const scroller = useZoomScroll<HTMLDivElement>(pxPerMinute)
  const today = dayOf(now, timezone)
  const nowMinute = minuteOf(now, timezone)
  const draft = drag?.draft ?? null
  const newDraft = draft !== null && draft.sessionId === null ? draft : null
  const adjusting = draft !== null && draft.sessionId !== null ? draft : null
  const scheduledDraft = drag?.scheduledDraft ?? null
  // While a block moves, the closed hand shows wherever the pointer goes (ADJ-14).
  const grabbing = (Boolean(drag?.dragging) && draft?.mode === 'move') || scheduledDraft !== null
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
  const laidPlanned = useMemo(() => plannedPieces(planned, days), [planned, days])
  // A task with a block in the user's plan of its scheduled day shows only as the planned block (PLAN-25).
  const shownTimed = useMemo(() => {
    if (planned.length === 0) return timed
    const plannedOn = new Set(planned.flatMap((block) => (block.kind === 'task' ? [`${block.day}:${block.task.id}`] : [])))
    return timed.filter((task) => !plannedOn.has(`${task.scheduled_on}:${task.id}`))
  }, [timed, planned])
  const scheduled = useMemo(() => scheduledPieces(shownTimed, projected, days), [shownTimed, projected, days])
  // Decided on the saved sessions, so a block dragged shorter than the minimum stays until it is saved.
  const hiddenIds = useMemo(() => new Set(hidden ? sessions.filter(hidden).map((session) => session.id) : []), [sessions, hidden])


  return (
    <div
      data-grabbing={grabbing || undefined}
      className={cn('flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card', grabbing && 'cursor-grabbing [&_*]:cursor-grabbing')}
    >
      {/* Both reserve the scrollbar's width, so the day headers line up with the columns under them. */}
      <div data-agenda-header className="flex overflow-y-hidden border-b [scrollbar-gutter:stable]">
        <div className="flex w-14 shrink-0 items-center justify-center">{corner}</div>
        {days.map((day) => {
          const total = dayTotal(pieces.get(day) ?? [])
          return (
            <div
              key={day}
              data-day-header={day}
              className={cn('flex flex-1 flex-col items-center gap-0.5 border-l py-2', day === today && 'text-primary')}
            >
              <span className="text-xs uppercase text-muted-foreground">{weekdayLabel(day, locale)}</span>
              {longDate ? (
                <span data-long-date className="text-base font-semibold leading-tight">
                  {longDateLabel(day, locale)}
                </span>
              ) : (
                <span className="text-lg font-semibold leading-none">{Number(day.slice(8))}</span>
              )}
              <span className="h-4 text-xs tabular-nums text-muted-foreground">
                {total > 0 ? formatDuration(total, locale) : ''}
              </span>
              {onPlanDay && day >= today && (
                <button
                  type="button"
                  data-plan-day={day}
                  className="text-[11px] font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => onPlanDay(day)}
                >
                  {t('plan.agenda.planDay')}
                </button>
              )}
            </div>
          )
        })}
      </div>
      {untimed && <UntimedRow days={days} untimed={untimed} onOpenTask={onOpenTask} onShowDay={onShowDay} drag={drag} />}
      <div ref={scroller} data-agenda-scroll className="relative max-h-[calc(100vh-14rem)] min-h-80 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="relative flex" style={{ height: DAY_MINUTES * pxPerMinute }}>
          <div className="relative w-14 shrink-0" aria-hidden>
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
          {days.map((day) => {
            const visible = (pieces.get(day) ?? []).filter((piece) => !hiddenIds.has(piece.session.id))
            // The session being adjusted follows the pointer on its own, outside any joined block.
            const moving = visible.filter((piece) => piece.session.id === adjusting?.sessionId)
            const resting = visible.filter((piece) => piece.session.id !== adjusting?.sessionId)
            // The planned blocks share the width with the sessions, so they never cover one (PLAN-24).
            const laid = assignLanes<Piece | ScheduledPiece | Omit<PlannedPiece, 'lane' | 'lanes'>>([
              ...joinPieces(resting, joinGap, apartId),
              ...moving,
              ...(scheduled.get(day) ?? []),
              ...(laidPlanned.get(day) ?? []),
            ])
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
                    style={{ top: hour * 60 * pxPerMinute }}
                  />
                ))}
                <div className="absolute inset-0 mx-0.5">
                  {laid.map((laidPiece) => {
                    if ('planned' in laidPiece) {
                      return (
                        <PlannedBlock
                          key={`planned:${laidPiece.planned.id}`}
                          piece={laidPiece}
                          pxPerMinute={pxPerMinute}
                          today={today}
                          onOpen={onOpenPlanned}
                          onStart={onStartPlanned}
                        />
                      )
                    }
                    if ('scheduled' in laidPiece) {
                      const entry = laidPiece.scheduled
                      const id = entry.kind === 'task' ? entry.task.id : `${entry.occurrence.series_id}:${entry.occurrence.on}`
                      // Only the open occurrence moves, never a projection (US-6, D14).
                      const task = entry.kind === 'task' && drag?.schedulable ? entry.task : null
                      return (
                        <ScheduledBlock
                          key={`scheduled:${id}`}
                          piece={laidPiece}
                          pxPerMinute={pxPerMinute}
                          canWrite={drag !== undefined}
                          onOpen={onOpenTask}
                          dragging={task !== null && scheduledDraft?.taskId === task.id}
                          onDragStart={
                            task
                              ? (event) =>
                                  drag!.startMoveScheduled(event, {
                                    taskId: task.id,
                                    title: task.title,
                                    color: task.list.color,
                                    day: task.scheduled_on,
                                    time: task.scheduled_time!,
                                    length: scheduledMinutes(task.estimate_minutes),
                                  })
                              : undefined
                          }
                        />
                      )
                    }
                    const piece = laidPiece
                    const members = piece.members
                    // The running session ends now: it has no handles and does not move (AGENDA-33); nor does a joined block (MERGE-30).
                    const target = drag && !members && piece.session.ended_at !== null ? targetOf(piece, timezone) : null
                    const chosen = !members && piece.session.id === selectedId
                    const selected = members
                      ? members.some((member) => selectedGroup?.includes(member.id))
                      : chosen || piece.session.id === previewId
                    return (
                      <SessionBlock
                        key={members ? `group:${piece.session.id}` : piece.session.id}
                        piece={piece}
                        pxPerMinute={pxPerMinute}
                        timezone={timezone}
                        selected={selected}
                        movable={target !== null}
                        onSelect={members ? onSelectGroup && (() => onSelectGroup(members)) : onSelect && (() => onSelect(piece.session))}
                        onPointerDown={(event) => (target ? drag!.startMove(event, target) : event.stopPropagation())}
                      >
                        {target &&
                          chosen &&
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
                  {scheduledDraft && !scheduledDraft.nowhere && scheduledDraft.start !== null && scheduledDraft.day === day && (
                    <div
                      data-scheduled-draft
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 z-20 rounded-md border-2 border-dashed border-primary bg-primary/15"
                      style={{ top: scheduledDraft.start * pxPerMinute, height: scheduledDraft.length * pxPerMinute }}
                    >
                      <span className="absolute top-1 left-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-medium whitespace-nowrap text-background tabular-nums">
                        {`${longDay(day, t, locale)} · ${t('agenda.range', {
                          start: minuteClock(scheduledDraft.start),
                          end: minuteClock((scheduledDraft.start + scheduledDraft.length) % DAY_MINUTES),
                        })}`}
                      </span>
                    </div>
                  )}
                  {newDraft && newDraft.day === day && (
                    <div
                      data-draft
                      className="absolute inset-x-0 z-20 cursor-grab rounded-md border-2 border-dashed border-primary bg-primary/15 px-1.5 text-xs font-medium tabular-nums"
                      style={{ top: newDraft.start * pxPerMinute, height: (newDraft.end - newDraft.start) * pxPerMinute }}
                      // The middle moves the new session; the edges below pull it (ADJ-12, ADJ-13).
                      onPointerDown={(event) => drag?.startMove(event, { day: newDraft.day, start: newDraft.start, end: newDraft.end, sessionId: null })}
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
                    style={{ top: nowMinute * pxPerMinute }}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>
      {scheduledDraft && (
        // The copy of the task that follows the pointer while it is dragged (US-14).
        <div
          data-drag-ghost
          aria-hidden
          className="pointer-events-none fixed z-50 max-w-48 truncate rounded-md border-2 border-dotted px-1.5 py-0.5 text-xs shadow-lg"
          style={{ left: scheduledDraft.x + 8, top: scheduledDraft.y + 8, ...scheduledColors(scheduledDraft.color) }}
        >
          {scheduledDraft.title}
        </div>
      )}
    </div>
  )
}
