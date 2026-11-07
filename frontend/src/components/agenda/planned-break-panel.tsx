import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Play, X } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES } from '@/lib/agenda/layout'
import { clockMinutes } from '@/lib/plan/clock'
import { longDay } from '@/lib/schedule'
import type { PlannedBlock } from '@/types'

type PlannedBreak = Extract<PlannedBlock, { kind: 'break' }>

interface PlannedBreakPanelProps {
  block: PlannedBreak
  /** Today in the workspace timezone: only a break of today's plan starts (PLAN-28). */
  today: string
  /** `Começar`; absent for a viewer, and the button does not show (PLAN-26). */
  onStart?: () => void
  /** The Intervalo is on its way. */
  starting?: boolean
  onClose: () => void
}

/**
 * The panel of a planned break on the Agenda (PLAN-26, PLAN-28): its name, time and the list of its Intervalo, the way
 * to the plan of its day and, on today's plan, `Começar`, which opens the Intervalo for the break's length.
 */
export function PlannedBreakPanel({ block, today, onStart, starting = false, onClose }: PlannedBreakPanelProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const start = clockMinutes(block.start) ?? 0
  const duration = formatDuration(block.minutes * 60, language)
  const isToday = block.day === today

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <aside aria-labelledby="planned-break-title" className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 lg:w-80">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            {t('plan.agenda.breakOf', { day: isToday ? t('plan.agenda.today') : longDay(block.day, t, language) })}
          </span>
          <h2 id="planned-break-title" className="text-base font-semibold">
            {block.name}
          </h2>
        </div>
        <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={t('common.close')} onClick={onClose}>
          <X size={15} />
        </Button>
      </div>
      <p className="text-sm tabular-nums">
        {`${t('plan.block.range', { start: minuteClock(start), end: minuteClock((start + block.minutes) % DAY_MINUTES) })} · ${duration}`}
      </p>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(--chart-${block.list.color})` }} />
        {t('plan.agenda.breakList', { list: block.list.name })}
      </p>
      {isToday && onStart && <p className="text-xs text-muted-foreground">{t('plan.agenda.startHint', { duration })}</p>}
      <div className="flex items-center justify-between gap-2">
        <Link to={`/planejar/${block.day}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t('plan.agenda.openPlan')}
        </Link>
        {isToday && onStart && (
          <Button type="button" disabled={starting} onClick={onStart}>
            <Play aria-hidden size={13} fill="currentColor" />
            {t('plan.agenda.start')}
          </Button>
        )}
      </div>
    </aside>
  )
}
