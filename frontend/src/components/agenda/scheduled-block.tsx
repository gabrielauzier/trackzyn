import type { PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, Repeat } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { TaskSlot } from '@/components/agenda/task-slot'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES, type LaidOutScheduled } from '@/lib/agenda/layout'
import { longDay, repeatsLabel } from '@/lib/schedule'
import { cn } from '@/lib/utils'

interface ScheduledBlockProps {
  piece: LaidOutScheduled
  pxPerMinute: number
  /** False for a `viewer`: the tooltip offers no drag (US-5). */
  canWrite: boolean
  /** A click opens the task: the task itself, or the open occurrence of a projection (US-5, US-11). */
  onOpen?: (taskId: string) => void
  /** Starts dragging the block to another day or time; absent, the block does not move (US-6, D14). */
  onDragStart?: (event: PointerEvent) => void
  /** The block is being dragged: its place fades while a copy follows the pointer (US-14). */
  dragging?: boolean
}

/**
 * A scheduled task on the grid (US-5): no text, a faint fill and a dashed edge in the colour of its list, and a
 * clock in the top right corner, where a joined session block shows its count. The open occurrence of a series
 * shows the repeat icon instead, and a projected occurrence is fainter still (US-11). The tooltip says the title
 * and the estimate, `Agendada · HH:MM – HH:MM` (`(1h)` without an estimate), the list and the column, and what a
 * click and a drag do; for a projection, `Próxima ocorrência · <dia> · HH:MM – HH:MM` and the rule.
 */
export function ScheduledBlock({ piece, pxPerMinute, canWrite, onOpen, onDragStart, dragging = false }: ScheduledBlockProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const { scheduled } = piece
  const projection = scheduled.kind === 'projection'
  const source = projection ? scheduled.occurrence : scheduled.task
  const taskId = projection ? scheduled.occurrence.task_id : scheduled.task.id
  const repeats = projection || scheduled.task.series !== null
  const estimate = source.estimate_minutes

  const [hours, minutes] = piece.time.split(':').map(Number)
  const start = minuteClock(hours! * 60 + minutes!)
  const end = minuteClock((hours! * 60 + minutes! + piece.minutes) % DAY_MINUTES)
  const defaultHour = estimate === null ? ` ${t('agenda.scheduled.defaultHour')}` : ''
  const when = projection
    ? t('agenda.scheduled.next', { day: longDay(scheduled.occurrence.on, t, language), start, end }) + defaultHour
    : t('agenda.scheduled.range', { start, end }) + defaultHour
  const where = projection ? repeatsLabel(scheduled.occurrence.rule, t, language) : `${scheduled.task.list.name} · ${t(`board.columns.${scheduled.task.column}`)}`
  // A projection does not move (D14); a viewer moves nothing (US-6).
  const action = canWrite && !projection ? t('agenda.scheduled.openOrDrag') : t('agenda.scheduled.open')

  const Icon = repeats ? Repeat : Clock

  return (
    <TaskSlot
      piece={piece}
      pxPerMinute={pxPerMinute}
      color={source.list.color}
      icon={Icon}
      iconSlot={repeats ? 'repeat-icon' : 'clock-icon'}
      label={`${source.title}, ${when}`}
      onOpen={() => onOpen?.(taskId)}
      onPointerDown={onDragStart}
      // The open hand of a block that moves.
      className={cn(onDragStart && 'cursor-grab', projection && 'opacity-50', dragging && 'opacity-30')}
      data={{
        'data-scheduled-id': taskId,
        'data-projected': projection || undefined,
        'data-draggable': onDragStart ? true : undefined,
        'data-dragging': dragging || undefined,
      }}
      tooltip={
        <>
          <span className="flex items-baseline gap-2">
            <span className="font-medium break-words whitespace-normal">{source.title}</span>
            <span data-slot="scheduled-estimate" className="ml-auto shrink-0 tabular-nums opacity-80">
              {estimate === null ? t('agenda.scheduled.noEstimate') : t('agenda.scheduled.estimate', { duration: formatDuration(estimate * 60, language) })}
            </span>
          </span>
          <span className="tabular-nums opacity-80">{when}</span>
          <span className="opacity-80">{where}</span>
          <span className="opacity-80">{action}</span>
        </>
      }
    />
  )
}
