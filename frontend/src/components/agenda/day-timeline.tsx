import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'

import { WeekGrid, type GridDrag } from '@/components/agenda/week-grid'
import { Button } from '@/components/ui/button'
import { dayOf, dayPieces, mondayOf, weekDays } from '@/lib/agenda/layout'
import { cn } from '@/lib/utils'
import type { AgendaSession, PlannedBlock, ProjectedOccurrence, ScheduledTask } from '@/types'

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
  /** Opens `Nova sessão` on the day with the round `+` button; absent for a viewer and on wide screens (ADJ-19). */
  onNew?: () => void
  /** The gestures of the grid, as in the week; absent for a viewer and on narrow screens (ADJ-19). */
  drag?: GridDrag
  selectedId?: string | null
  onSelect?: (session: AgendaSession) => void
  /** Pixels per minute, from the zoom; the default zoom's scale when absent. */
  pxPerMinute?: number
  /** Whether a session stays off the grid (HIDE-11); it still counts in the total and the empty message (HIDE-14). */
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
  /** A control drawn in the first cell of the header, above the hour column (ADJ-15). */
  corner?: ReactNode
  /** The scheduled tasks with a time and the projected occurrences of the week, as in the week view (US-5, US-11). */
  timed?: ScheduledTask[]
  projected?: ProjectedOccurrence[]
  /** A click on a scheduled block opens its task. */
  onOpenTask?: (taskId: string) => void
  /** The tasks scheduled without a time, for the `Sem hora` row (US-14). */
  untimed?: ScheduledTask[]
  onShowDay?: (day: string) => void
  /** The blocks of the user's saved plans, as in the week view (PLAN-24). */
  planned?: PlannedBlock[]
  onOpenPlanned?: (block: PlannedBlock) => void
  onStartPlanned?: (block: PlannedBlock) => void
  onPlanDay?: (day: string) => void
}

const utc = (day: string) => new Date(`${day}T00:00:00Z`)

/**
 * The agenda of one day (AGENDA-36 to AGENDA-38, AGENDA-42, AGENDA-43): the pills of the seven days from Monday, a dot
 * on the days with sessions, the week arrows, the messages of an empty or a future day, and the week grid with the day
 * alone, headed by its whole date (ADJ-15 to ADJ-18). The round `+` button shows when `onNew` is given.
 */
export function DayTimeline({
  day,
  sessions,
  timezone,
  now,
  onPickDay,
  onWeek,
  onNew,
  drag,
  selectedId = null,
  onSelect,
  pxPerMinute,
  hidden,
  joinGap = null,
  apartId = null,
  onSelectGroup,
  selectedGroup = null,
  previewId = null,
  corner,
  timed,
  projected,
  onOpenTask,
  untimed,
  onShowDay,
  planned,
  onOpenPlanned,
  onStartPlanned,
  onPlanDay,
}: DayTimelineProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const days = useMemo(() => weekDays(mondayOf(day)), [day])
  const pieces = useMemo(() => dayPieces(sessions, days, timezone, now), [sessions, days, timezone, now])
  const today = dayOf(now, timezone)
  const ofDay = pieces.get(day) ?? []
  const single = useMemo(() => [day], [day])

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

      {ofDay.length === 0 && (
        <p className="rounded-lg border border-dashed px-3 py-2 text-center text-sm text-muted-foreground">
          {day > today ? t('agenda.futureDay') : t('agenda.emptyDay')}
        </p>
      )}

      <WeekGrid
        days={single}
        longDate
        corner={corner}
        sessions={sessions}
        timezone={timezone}
        now={now}
        drag={drag}
        selectedId={selectedId}
        onSelect={onSelect}
        pxPerMinute={pxPerMinute}
        hidden={hidden}
        joinGap={joinGap}
        apartId={apartId}
        onSelectGroup={onSelectGroup}
        selectedGroup={selectedGroup}
        previewId={previewId}
        timed={timed}
        projected={projected}
        onOpenTask={onOpenTask}
        untimed={untimed}
        onShowDay={onShowDay}
        planned={planned}
        onOpenPlanned={onOpenPlanned}
        onStartPlanned={onStartPlanned}
        onPlanDay={onPlanDay}
      />

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
