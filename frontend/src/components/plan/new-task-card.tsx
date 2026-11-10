import { useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, GripVertical } from 'lucide-react'

import { DURATION_ERROR_KEY, parseDuration } from '@/components/board/estimate'
import { formatDuration } from '@/components/board/format-duration'
import { DurationInput } from '@/components/ui/duration-input'
import { scheduledMinutes } from '@/lib/agenda/layout'
import type { DropItem } from '@/lib/plan/draft'
import { cn } from '@/lib/utils'
import type { PlanListRef } from '@/types'

interface NewTaskCardProps {
  /** The list the new task goes to; null, nothing can be dropped. */
  list: PlanListRef | null
  /** Starts dragging the new task onto the grid; absent, the card is not shown by the sidebar (PLAN-34). */
  onDragStart?: (event: PointerEvent, item: DropItem) => void
}

/**
 * `Nova tarefa` above the breaks (PLAN-48): a card in the dashed edge of a planned block that drops a new task on the
 * grid, with the `HH:MM` estimate of a board card. Empty, it says `Sem estimativa: 1h`; filled, how long the block
 * will take. A refused estimate shows why and drops nothing.
 */
export function NewTaskCard({ list, onDragStart }: NewTaskCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [estimate, setEstimate] = useState('')
  const parsed = parseDuration(estimate)
  const error = 'error' in parsed ? parsed.error : null
  const minutes = 'minutes' in parsed ? parsed.minutes : null
  const usable = Boolean(onDragStart && list && error === null)
  const hint = error
    ? t(DURATION_ERROR_KEY[error])
    : minutes === null
      ? t('plan.sidebar.newTaskNoEstimate')
      : t('plan.sidebar.newTaskTakes', { duration: formatDuration(scheduledMinutes(minutes) * 60, language) })

  return (
    <div data-new-task className="flex flex-col rounded-md border-2 border-dashed border-primary bg-primary/10">
      <button
        type="button"
        disabled={!usable}
        aria-label={t('plan.sidebar.newTaskDrag')}
        className={cn('flex items-center gap-2 px-3 pt-3 pb-2 text-left text-sm font-semibold select-none disabled:opacity-50', usable && 'cursor-grab')}
        onPointerDown={(event) => {
          if (onDragStart && list && error === null) onDragStart(event, { kind: 'new', estimate: minutes, list })
        }}
      >
        <GripVertical aria-hidden size={14} className="text-muted-foreground" />
        {t('plan.sidebar.newTask')}
      </button>
      <div className="flex items-center gap-2 px-3 pb-2.5">
        <span className="flex h-5 items-center gap-1.5 rounded-md bg-background/55 px-1.5 text-muted-foreground">
          <Clock aria-hidden size={12} />
          <DurationInput
            aria-label={t('board.estimate')}
            aria-invalid={error !== null || undefined}
            value={estimate}
            onChange={setEstimate}
            className="border-0 bg-transparent px-0 text-foreground"
          />
        </span>
        <span data-slot="new-task-hint" role={error ? 'alert' : undefined} className={cn('ml-auto text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>
          {hint}
        </span>
      </div>
    </div>
  )
}
