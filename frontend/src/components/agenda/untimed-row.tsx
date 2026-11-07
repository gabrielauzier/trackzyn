import { useTranslation } from 'react-i18next'
import { AlarmClockOff, Repeat } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { scheduledColors } from '@/lib/agenda/scheduled-colors'
import { longDay } from '@/lib/schedule'
import type { ScheduledTask } from '@/types'

/** Tasks a cell shows before `+X` (US-14, D20). */
const UNTIMED_SHOWN = 3
/** Room for 3 tasks of 26 px and the `+X` button on every day, so the columns stay aligned (US-14). */
const UNTIMED_ROW_HEIGHT = 112

const COLUMN_ORDER: Record<ScheduledTask['column'], number> = { today: 0, this_week: 1, backlog: 2 }

interface UntimedRowProps {
  /** The days of the grid's columns. */
  days: string[]
  /** The pending tasks of the period scheduled without a time. */
  untimed: ScheduledTask[]
  /** A click on a task opens the task dialog. */
  onOpenTask?: (taskId: string) => void
  /** `+X` shows every scheduled task of the day. */
  onShowDay?: (day: string) => void
}

/**
 * The `Sem hora` row between the day headers and the timeline (US-14, D20): the crossed-out clock with the
 * tooltip `Agendadas sem hora definida` over the hour column, and a cell per day with up to 3 tasks in the
 * order of the board (Today, This week, Backlog, then position), each in the style of a scheduled block with its
 * title and its estimate, and `+X` for the rest. Every cell keeps the height of 3 tasks and `+X`.
 */
export function UntimedRow({ days, untimed, onOpenTask, onShowDay }: UntimedRowProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const label = t('agenda.untimed.label')

  return (
    <div data-untimed-row className="flex overflow-y-hidden border-b [scrollbar-gutter:stable]">
      <div className="flex w-14 shrink-0 items-start justify-center pt-2 text-muted-foreground">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span role="img" aria-label={label} tabIndex={0} className="rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <AlarmClockOff size={14} aria-hidden />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      {days.map((day) => {
        const tasks = untimed
          .filter((task) => task.scheduled_on === day)
          .sort((a, b) => COLUMN_ORDER[a.column] - COLUMN_ORDER[b.column] || a.position - b.position)
        const rest = tasks.length - UNTIMED_SHOWN
        return (
          <div
            key={day}
            data-untimed-day={day}
            className="flex min-w-0 flex-1 flex-col gap-0.5 border-l p-1"
            style={{ height: UNTIMED_ROW_HEIGHT }}
          >
            {tasks.slice(0, UNTIMED_SHOWN).map((task) => (
              <button
                key={task.id}
                type="button"
                data-untimed-task={task.id}
                className="flex h-[26px] w-full min-w-0 shrink-0 items-center gap-1 rounded-md border-2 border-dotted px-1.5 text-left text-xs"
                style={scheduledColors(task.list.color)}
                onClick={() => onOpenTask?.(task.id)}
              >
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {task.series && <Repeat size={10} role="img" aria-label={t('schedule.repeatIcon')} className="shrink-0" />}
                {task.estimate_minutes !== null && (
                  <span className="shrink-0 tabular-nums text-muted-foreground">{formatDuration(task.estimate_minutes * 60, language)}</span>
                )}
              </button>
            ))}
            {rest > 0 && (
              <button
                type="button"
                aria-label={t('agenda.untimed.showAll', { count: tasks.length, day: longDay(day, t, language) })}
                className="self-start rounded px-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20"
                onClick={() => onShowDay?.(day)}
              >
                {t('agenda.untimed.more', { count: rest })}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
