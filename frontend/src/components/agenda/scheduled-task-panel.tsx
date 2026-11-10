import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Repeat, X } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES, scheduledMinutes } from '@/lib/agenda/layout'
import { clockMinutes } from '@/lib/plan/clock'
import { longDay, repeatsLabel } from '@/lib/schedule'
import type { ScheduledTask } from '@/types'

interface ScheduledTaskPanelProps {
  task: ScheduledTask
  /** `Abrir tarefa`: the task dialog, where the task and its schedule are edited. */
  onOpen: () => void
  onClose: () => void
}

/**
 * The panel of a scheduled task on the Agenda (US-5, US-14), as a session's: its day and time (or `Sem hora`), its
 * estimate, its list and column, the repetition of its series, and `Abrir tarefa`. A drag on the block reschedules it.
 */
export function ScheduledTaskPanel({ task, onOpen, onClose }: ScheduledTaskPanelProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const start = task.scheduled_time === null ? null : clockMinutes(task.scheduled_time)
  const minutes = scheduledMinutes(task.estimate_minutes)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const when =
    start === null
      ? `${longDay(task.scheduled_on, t, language)} · ${t('agenda.scheduledPanel.noTime')}`
      : `${longDay(task.scheduled_on, t, language)} · ${minuteClock(start)} – ${minuteClock((start + minutes) % DAY_MINUTES)}`

  return (
    <aside aria-labelledby="scheduled-task-title" data-scheduled-panel={task.id} className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 lg:w-80">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{t('agenda.scheduledPanel.eyebrow')}</span>
          <h2 id="scheduled-task-title" className="text-base font-semibold break-words">
            {task.title}
          </h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" aria-label={t('common.close')} onClick={onClose}>
          <X size={15} />
        </Button>
      </div>
      <p className="text-sm tabular-nums">{when}</p>
      <p className="text-sm text-muted-foreground">
        {task.estimate_minutes === null
          ? t('agenda.scheduled.noEstimate')
          : t('agenda.scheduled.estimate', { duration: formatDuration(task.estimate_minutes * 60, language) })}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `var(--chart-${task.list.color})` }} />
        {`${task.list.name} · ${t(`board.columns.${task.column}`)}`}
      </p>
      {task.series && (
        <p className="flex items-center gap-1.5 text-sm text-primary">
          <Repeat aria-hidden size={14} />
          {repeatsLabel(task.series.rule, t, language)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t('agenda.scheduledPanel.dragHint')}</p>
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onOpen}>
          {t('agenda.scheduledPanel.open')}
        </Button>
      </div>
    </aside>
  )
}
