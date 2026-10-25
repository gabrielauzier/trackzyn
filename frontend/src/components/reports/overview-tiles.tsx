import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { StatTile } from '@/components/charts'
import type { Overview } from '@/types'

/** Work days, tasks done, time worked and the average per task (REPORT-01 to REPORT-03, REPORT-12). */
export function OverviewTiles({ tiles }: { tiles: Overview['tiles'] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const items = [
    { label: t('reports.tiles.workDays'), value: String(tiles.work_days) },
    { label: t('reports.tiles.tasksDone'), value: String(tiles.tasks_done) },
    { label: t('reports.tiles.timeWorked'), value: formatDuration(tiles.task_seconds, locale) },
    {
      label: t('reports.tiles.avgPerTask'),
      value: tiles.avg_seconds_per_task === null ? '—' : formatDuration(tiles.avg_seconds_per_task, locale),
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value }) => (
        <div key={label} role="group" aria-label={label}>
          <StatTile label={label} value={value} className="h-full" />
        </div>
      ))}
    </div>
  )
}
