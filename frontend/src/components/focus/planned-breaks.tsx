import { useTranslation } from 'react-i18next'
import { Coffee, Play } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES } from '@/lib/agenda/layout'
import { clockMinutes } from '@/lib/plan/clock'
import type { PlannedBlock } from '@/types'

export type PlannedBreak = Extract<PlannedBlock, { kind: 'break' }>

interface PlannedBreaksProps {
  /** The breaks of today's plan in this list. */
  breaks: PlannedBreak[]
  /** Minutes since today's midnight in the workspace timezone: a break that already ended is left out. */
  nowMinute: number
  /** `Começar`: an Intervalo of the break's length in its list (PLAN-26). */
  onStart: (block: PlannedBreak) => void
}

/**
 * `Pausas do plano de hoje` on the focus page (PLAN-28): each break of today's plan in this list that has not ended yet,
 * with its time and length and `Começar`, which opens an Intervalo of that length. Nothing shows without such a break.
 */
export function PlannedBreaks({ breaks, nowMinute, onStart }: PlannedBreaksProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const ahead = breaks
    .map((block) => ({ block, start: clockMinutes(block.start) ?? 0 }))
    .filter(({ block, start }) => start + block.minutes > nowMinute)
    .sort((a, b) => a.start - b.start)
  if (ahead.length === 0) return null

  return (
    <section className="space-y-2" aria-labelledby="focus-planned-breaks">
      <h2 id="focus-planned-breaks" className="text-xs font-semibold text-muted-foreground">
        {t('plan.focus.title')}
      </h2>
      <ul className="space-y-2">
        {ahead.map(({ block, start }) => (
          <li key={block.id} className="flex items-center gap-3 rounded-lg border border-dashed bg-card px-3 py-2">
            <Coffee aria-hidden size={16} className="shrink-0 text-muted-foreground" />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{block.name}</span>
              <span className="text-xs tabular-nums text-muted-foreground">
                {`${t('plan.block.range', { start: minuteClock(start), end: minuteClock((start + block.minutes) % DAY_MINUTES) })} · ${formatDuration(block.minutes * 60, language)}`}
              </span>
            </span>
            <Button type="button" variant="outline" size="sm" aria-label={t('plan.focus.startAria', { name: block.name })} onClick={() => onStart(block)}>
              <Play aria-hidden fill="currentColor" />
              {t('plan.focus.start')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
