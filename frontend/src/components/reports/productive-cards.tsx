import { useTranslation } from 'react-i18next'

import { Card } from '@/components/ui/card'
import { formatProductive } from '@/lib/reports'
import type { Overview } from '@/types'

/**
 * The most productive hour, weekday and month, every tie listed (REPORT-05); without activity each card
 * shows `—` and the row says `Sem atividade no período` (REPORT-12).
 */
export function ProductiveCards({ productive }: { productive: Overview['productive'] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const cards = [
    { label: t('reports.productive.hour'), value: formatProductive(productive.hours, 'hour', locale) },
    { label: t('reports.productive.weekday'), value: formatProductive(productive.weekdays, 'weekday', locale) },
    { label: t('reports.productive.month'), value: formatProductive(productive.months, 'month', locale) },
  ]
  const empty = productive.hours.length === 0 && productive.weekdays.length === 0 && productive.months.length === 0

  return (
    <div className="flex flex-col gap-2">
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map(({ label, value }) => (
          <Card key={label} role="group" aria-label={label} className="gap-1.5 p-4">
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="text-2xl font-semibold tracking-tight">{value}</p>
          </Card>
        ))}
      </div>
      {empty && <p className="text-sm text-muted-foreground">{t('reports.noActivity')}</p>}
    </div>
  )
}
