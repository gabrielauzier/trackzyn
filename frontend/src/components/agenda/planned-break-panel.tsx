import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { X } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import type { FocusRouteState } from '@/lib/desktop/focus-window'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES } from '@/lib/agenda/layout'
import { clockMinutes } from '@/lib/plan/clock'
import { longDay } from '@/lib/schedule'
import type { PlannedBlock } from '@/types'

type PlannedBreak = Extract<PlannedBlock, { kind: 'break' }>

interface PlannedBreakPanelProps {
  block: PlannedBreak
  /** Today in the workspace timezone: a break of today's plan leads to the focus of its list (PLAN-28). */
  today: string
  onClose: () => void
}

/** The focus of the break's list, opened without starting a task: `Começar` waits there (PLAN-28). */
const OPEN_ONLY: FocusRouteState = { start: false }

/**
 * The panel of a planned break on the Agenda (PLAN-28): its name, time and the list of its Intervalo, the way to the
 * plan of its day and, on today's plan, the way to the focus of its list, where `Começar` opens the Intervalo.
 */
export function PlannedBreakPanel({ block, today, onClose }: PlannedBreakPanelProps) {
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
      {isToday && <p className="text-xs text-muted-foreground">{t('plan.agenda.startInFocus', { list: block.list.name })}</p>}
      <div className="flex items-center justify-between gap-2">
        <Link to={`/planejar/${block.day}`} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {t('plan.agenda.openPlan')}
        </Link>
        {isToday && (
          <Button asChild variant="outline" size="sm">
            <Link to={`/focus/${block.list.id}`} state={OPEN_ONLY}>
              {t('plan.agenda.openFocus')}
            </Link>
          </Button>
        )}
      </div>
    </aside>
  )
}
