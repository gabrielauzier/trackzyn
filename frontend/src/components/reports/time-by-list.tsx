import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { DonutChart } from '@/components/charts'
import type { Overview } from '@/types'

/** Whole percentages that add up to 100: floor each share, then give the leftover points to the largest remainders. */
function wholeShares(values: number[]): number[] {
  const total = values.reduce((sum, value) => sum + value, 0)
  const exact = values.map((value) => (value / total) * 100)
  const shares = exact.map(Math.floor)
  const order = exact.map((value, index) => ({ index, rest: value - Math.floor(value) })).sort((a, b) => b.rest - a.rest)
  for (let k = 0; k < 100 - shares.reduce((sum, value) => sum + value, 0); k++) shares[order[k]!.index]! += 1
  return shares
}

interface TimeByListProps {
  byList: Overview['by_list']
  breakSeconds: number
}

/** One slice per list and one of breaks, with the header `N listas, Tempo total: X` (REPORT-06, REPORT-12). */
export function TimeByList({ byList, breakSeconds }: TimeByListProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const slices = [
    ...byList.map((list) => ({ key: list.list_id, label: list.name, value: list.seconds, color: `var(--chart-${list.color})` })),
    { key: 'breaks', label: t('reports.byList.breaks'), value: breakSeconds, color: 'var(--muted-foreground)' },
  ]
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('reports.byList.title')}</h2>
        {total > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('reports.byList.summary', {
              lists: t('reports.byList.listCount', { count: byList.length }),
              total: formatDuration(total, locale),
            })}
          </p>
        )}
      </div>
      {total === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('reports.noActivity')}</p>
      ) : (
        <DonutChart
          data={slices}
          shares={wholeShares(slices.map((slice) => slice.value))}
          valueFormatter={(seconds) => formatDuration(seconds, locale)}
        />
      )}
    </div>
  )
}
