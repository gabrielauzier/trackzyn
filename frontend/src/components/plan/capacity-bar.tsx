import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import type { Capacity } from '@/lib/plan/capacity'
import { cn } from '@/lib/utils'
import type { Workday } from '@/types'

interface CapacityBarProps {
  capacity: Capacity
  workday: Workday
  /** Opens the editor of the workday (PLAN-22); absent, the workday only shows. */
  onEditWorkday?: () => void
}

/**
 * Does the day fit (PLAN-19, PLAN-20)? `<planejado> planejadas de <livre> livres · <pausas> em pausas`, then
 * `· <agendadas> agendadas` when there is scheduled time, over a bar of the free time. Past the free time the bar
 * turns red and says `<excesso> além do expediente`.
 */
export function CapacityBar({ capacity, workday, onEditWorkday }: CapacityBarProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const duration = (minutes: number) => formatDuration(Math.max(0, minutes) * 60, language)
  const { planned, breaks, scheduled, free, over } = capacity
  const isOver = over > 0

  const parts = [
    t('plan.capacity.planned', { planned: duration(planned), free: duration(free) }),
    t('plan.capacity.breaks', { duration: duration(breaks) }),
  ]
  if (scheduled > 0) parts.push(t('plan.capacity.scheduled', { duration: duration(scheduled) }))

  const percent = free > 0 ? Math.round((planned / free) * 100) : planned > 0 ? 100 : 0
  // Past the free time, the bar is the planned time: the free part solid, the excess hatched.
  const fill = isOver ? (planned > 0 ? Math.max(0, free) / planned : 0) : Math.min(1, percent / 100)
  const workdayLabel = t('plan.capacity.workday', { start: workday.start, end: workday.end })

  return (
    <div data-over={isOver || undefined} className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
        <span data-slot="capacity-text" className={cn('font-medium', isOver && 'text-destructive')}>
          {parts.join(' · ')}
        </span>
        {onEditWorkday ? (
          <button type="button" className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={onEditWorkday}>
            <Clock aria-hidden size={13} />
            {workdayLabel}
          </button>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Clock aria-hidden size={13} />
            {workdayLabel}
          </span>
        )}
      </div>
      <div role="img" aria-label={t('plan.capacity.bar', { percent })} className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div data-slot="capacity-fill" className={cn(isOver ? 'bg-destructive' : 'rounded-full bg-primary')} style={{ width: `${fill * 100}%` }} />
        {isOver && (
          <div
            data-slot="capacity-over"
            className="flex-1"
            style={{ backgroundImage: 'repeating-linear-gradient(135deg, var(--destructive) 0 4px, color-mix(in oklab, var(--destructive) 40%, transparent) 4px 7px)' }}
          />
        )}
      </div>
      {isOver && (
        <span data-slot="capacity-over-text" className="text-sm font-semibold text-destructive">
          {t('plan.capacity.over', { duration: duration(over) })}
        </span>
      )}
    </div>
  )
}
