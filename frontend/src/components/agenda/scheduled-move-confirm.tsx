import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { minuteClock } from '@/lib/agenda/format'
import { longDay } from '@/lib/schedule'
import type { ScheduledTask } from '@/types'

interface ScheduledMoveConfirmProps {
  /** The task at its saved day and time. */
  task: ScheduledTask
  /** Where the drop put it, not saved yet; a null time is the `Sem hora` row. */
  to: { day: string; time: string | null }
  /** The minutes the block takes on the grid: the estimate, or 1h without one (D23). */
  minutes: number
  /** Puts the task back where it was (Esc too). */
  onCancel: () => void
  onSave: () => void
}

const minuteOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/**
 * The confirmation of a scheduled task dragged on the agenda, as the one of a session (ADJ-01): the task and its
 * list, `Novo horário — ainda não salvo` with the saved day and time struck through and the new ones, `Cancelar`
 * (or Esc) and `Salvar horário`. Nothing is saved before `Salvar horário` (D35).
 */
export function ScheduledMoveConfirm({ task, to, minutes, onCancel, onSave }: ScheduledMoveConfirmProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const when = (day: string, time: string | null) => {
    const shown = longDay(day, t, language)
    if (time === null) return `${shown} · ${t('agenda.moveConfirm.noTime')}`
    const start = minuteOf(time)
    return `${shown} · ${t('agenda.range', { start: minuteClock(start), end: minuteClock(Math.min(start + minutes, 1440) % 1440) })}`
  }

  return (
    <aside aria-labelledby="scheduled-move-title" className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4 lg:w-80">
      <div className="flex flex-col gap-1">
        <h2 id="scheduled-move-title" className="text-base font-semibold">
          {task.title}
        </h2>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(--chart-${task.list.color})` }} />
          {task.list.name}
        </p>
      </div>
      <div data-pending-time className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
        <p className="text-xs font-semibold text-primary">{t('agenda.moveConfirm.pending')}</p>
        <p className="flex flex-col gap-1 text-sm tabular-nums">
          <del className="text-muted-foreground first-letter:uppercase">{when(task.scheduled_on, task.scheduled_time)}</del>
          <span className="font-semibold first-letter:uppercase">{when(to.day, to.time)}</span>
        </p>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="button" onClick={onSave}>
          {t('agenda.moveConfirm.save')}
        </Button>
      </div>
    </aside>
  )
}
