import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Clock, Repeat } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { SchedulePicker } from '@/components/schedule/schedule-picker'
import { SeriesScopeDialog } from '@/components/schedule/series-scope-dialog'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { scheduledMinutes } from '@/lib/agenda/layout'
import { useScheduled } from '@/lib/agenda/use-scheduled'
import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { asksSeriesScope, dayDate, type ScheduleChangeFields } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import type { ProjectedOccurrence, ScheduledTask, SeriesScope } from '@/types'

const COLUMN_ORDER: Record<ScheduledTask['column'], number> = { today: 0, this_week: 1, backlog: 2 }

interface DayScheduledPanelProps {
  /** The day shown, YYYY-MM-DD in the workspace timezone. */
  day: string
  timeZone: string
  /** False for a `viewer`: the tasks show without `Definir hora` (US-14). */
  canWrite: boolean
  /** A click on a task opens the task dialog; a projection opens its open occurrence. */
  onOpenTask: (taskId: string) => void
  onClose: () => void
  now?: Date
}

/** `HH:MM – HH:MM` of a block that starts at `time` and lasts `minutes`. */
function rangeOf(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number)
  const end = (hours! * 60 + mins! + minutes) % (24 * 60)
  return `${time} – ${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}`
}

/**
 * Every scheduled task of a day, in the place of the side panel of the agenda (US-14): `<weekday>, <date>`,
 * `N tarefas agendadas · Est. <sum>`, the section `Sem hora` with every task of the day without a time, each with
 * the clock button `Definir hora` (not for a `viewer`), and the section `Com hora` with the tasks with a time in
 * time order, the next projected occurrence of a series among them, read only.
 */
export function DayScheduledPanel({ day, timeZone, canWrite, onOpenTask, onClose, now }: DayScheduledPanelProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const queryClient = useQueryClient()
  const { timed, untimed, projected } = useScheduled(day, day)
  const [editingId, setEditingId] = useState<string | null>(null)
  /** A time for an occurrence of a series, waiting for `Só esta` or `Esta e as próximas` (US-12). */
  const [scoping, setScoping] = useState<{ id: string; change: ScheduleChangeFields } | null>(null)

  const save = useMutation({
    mutationFn: ({ id, change, scope }: { id: string; change: ScheduleChangeFields; scope?: SeriesScope }) =>
      tasksApi.update(id, scope === undefined ? change : { ...change, scope }),
    onSuccess: () => {
      setEditingId(null)
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
    onError: (error) => toast.error(extractApiError(error, t('common.error'))),
  })

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Esc closes the time picker or the question first, not the panel under them.
      if (event.key === 'Escape' && editingId === null && scoping === null) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, editingId, scoping])

  const withoutTime = untimed
    .filter((task) => task.scheduled_on === day)
    .sort((a, b) => COLUMN_ORDER[a.column] - COLUMN_ORDER[b.column] || a.position - b.position)
  type Timed = { kind: 'task'; task: ScheduledTask; time: string } | { kind: 'projection'; occurrence: ProjectedOccurrence; time: string }
  const withTime: Timed[] = [
    ...timed.filter((task) => task.scheduled_on === day).map((task): Timed => ({ kind: 'task', task, time: task.scheduled_time! })),
    ...projected.filter((occurrence) => occurrence.on === day).map((occurrence): Timed => ({ kind: 'projection', occurrence, time: occurrence.time })),
  ].sort((a, b) => a.time.localeCompare(b.time))

  const tasksOfDay = [...withoutTime, ...withTime.flatMap((entry) => (entry.kind === 'task' ? [entry.task] : []))]
  const estimate = tasksOfDay.reduce((sum, task) => sum + (task.estimate_minutes ?? 0), 0)
  const date = format(dayDate(day), t('agenda.dayPanel.dateFormat'), { locale: resolveDateFnsLocale(language) })
  const title = date.charAt(0).toLocaleUpperCase() + date.slice(1)

  const setTime = (task: ScheduledTask, change: ScheduleChangeFields) => {
    const schedule = { scheduled_on: task.scheduled_on, scheduled_time: task.scheduled_time, series: task.series && { ...task.series, next_on: null } }
    if (asksSeriesScope(schedule, change)) {
      setEditingId(null)
      setScoping({ id: task.id, change })
    } else save.mutate({ id: task.id, change })
  }

  const listDot = (color: number) => <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `var(--chart-${color})` }} />
  const estimateOf = (minutes: number | null) =>
    minutes !== null && <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{formatDuration(minutes * 60, language)}</span>
  const rowClass = 'flex h-10 min-w-0 items-center gap-2 rounded-md border px-2 text-left text-sm'

  return (
    <aside aria-labelledby="day-panel-title" className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4 lg:w-80">
      <div className="flex flex-col gap-1">
        <h2 id="day-panel-title" className="text-base font-semibold">
          {title}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t('agenda.dayPanel.summary', { count: tasksOfDay.length, estimate: formatDuration(estimate * 60, language) })}
        </p>
      </div>

      <section aria-labelledby="day-panel-untimed" className="flex flex-col gap-1.5">
        <h3 id="day-panel-untimed" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('agenda.dayPanel.untimed', { count: withoutTime.length })}
        </h3>
        <ul className="flex flex-col gap-1">
          {withoutTime.map((task) => (
            <li key={task.id} data-day-task={task.id} className="flex items-center gap-1">
              <button type="button" className={cn(rowClass, 'flex-1 hover:bg-muted/60')} onClick={() => onOpenTask(task.id)}>
                {listDot(task.list.color)}
                <span className="min-w-0 flex-1 truncate">{task.title}</span>
                {task.series && <Repeat size={12} role="img" aria-label={t('schedule.repeatIcon')} className="shrink-0" />}
                {estimateOf(task.estimate_minutes)}
              </button>
              {canWrite && (
                <Popover open={editingId === task.id} onOpenChange={(open) => setEditingId(open ? task.id : null)}>
                  <PopoverTrigger asChild>
                    <Button type="button" variant="ghost" size="icon" aria-label={t('agenda.dayPanel.setTime', { title: task.title })} title={t('agenda.dayPanel.setTimeShort')}>
                      <Clock size={16} />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto">
                    <SchedulePicker
                      value={{ on: task.scheduled_on, time: null, recurrence: task.series?.rule ?? null }}
                      timeZone={timeZone}
                      now={now}
                      pending={save.isPending}
                      onCancel={() => setEditingId(null)}
                      onSubmit={(value) => {
                        const change: ScheduleChangeFields = { scheduled_on: value.on, scheduled_time: value.time }
                        if (JSON.stringify(value.recurrence) !== JSON.stringify(task.series?.rule ?? null)) change.recurrence = value.recurrence
                        setTime(task, change)
                      }}
                    />
                  </PopoverContent>
                </Popover>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="day-panel-timed" className="flex flex-col gap-1.5">
        <h3 id="day-panel-timed" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('agenda.dayPanel.timed', { count: withTime.filter((entry) => entry.kind === 'task').length })}
        </h3>
        <ul className="flex flex-col gap-1">
          {withTime.map((entry) =>
            entry.kind === 'task' ? (
              <li key={entry.task.id} data-day-task={entry.task.id}>
                <button type="button" className={cn(rowClass, 'w-full hover:bg-muted/60')} onClick={() => onOpenTask(entry.task.id)}>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                    {rangeOf(entry.time, scheduledMinutes(entry.task.estimate_minutes))}
                  </span>
                  {listDot(entry.task.list.color)}
                  <span className="min-w-0 flex-1 truncate">{entry.task.title}</span>
                  {entry.task.series && <Repeat size={12} role="img" aria-label={t('schedule.repeatIcon')} className="shrink-0" />}
                  {estimateOf(entry.task.estimate_minutes)}
                </button>
              </li>
            ) : (
              <li key={`${entry.occurrence.series_id}:${entry.occurrence.on}`} data-day-projection={entry.occurrence.task_id}>
                <button
                  type="button"
                  className={cn(rowClass, 'w-full border-dashed text-muted-foreground hover:bg-muted/60')}
                  onClick={() => onOpenTask(entry.occurrence.task_id)}
                >
                  <span className="shrink-0 text-xs tabular-nums">{rangeOf(entry.time, scheduledMinutes(entry.occurrence.estimate_minutes))}</span>
                  {listDot(entry.occurrence.list.color)}
                  <span className="min-w-0 flex-1 truncate">{entry.occurrence.title}</span>
                  <span className="shrink-0 text-xs">{t('agenda.dayPanel.next')}</span>
                  <Repeat size={12} aria-hidden className="shrink-0" />
                </button>
              </li>
            ),
          )}
        </ul>
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>

      <SeriesScopeDialog
        open={scoping !== null}
        variant="move"
        onCancel={() => setScoping(null)}
        onChoose={(scope) => {
          if (scoping) save.mutate({ ...scoping, scope })
          setScoping(null)
        }}
      />
    </aside>
  )
}
