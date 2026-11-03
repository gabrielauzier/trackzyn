import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { BarChart } from '@/components/charts'
import type { Overview } from '@/types'

const HOUR = 3600

/** `seg., 19 de out.` / `Mon, Oct 19` for a YYYY-MM-DD day. */
function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

/**
 * One group of bars per day of the period: tasks, breaks and their total (REPORT-04); without any
 * session, `Sem atividade no período` (REPORT-12). A visually hidden table carries the same numbers.
 */
export function DailyChart({ daily }: { daily: Overview['daily'] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const rows = daily.map((day) => ({
    day: dayLabel(day.date, locale),
    tasks: day.task_seconds,
    breaks: day.break_seconds,
    total: day.task_seconds + day.break_seconds,
  }))

  if (rows.every((row) => row.total === 0)) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('reports.noActivity')}</p>
  }

  const series = [
    { key: 'tasks', label: t('reports.daily.tasks') },
    { key: 'breaks', label: t('reports.daily.breaks') },
    { key: 'total', label: t('reports.daily.total') },
  ]

  return (
    <>
      <BarChart
        data={rows.map((row) => ({ day: row.day, tasks: row.tasks / HOUR, breaks: row.breaks / HOUR, total: row.total / HOUR }))}
        xKey="day"
        series={series}
        valueFormatter={(hours) => formatDuration(Math.round(hours * HOUR), locale)}
      />
      <table className="sr-only">
        <caption>{t('reports.daily.title')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('reports.daily.day')}</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.day}>
              <th scope="row">{row.day}</th>
              <td>{formatDuration(row.tasks, locale)}</td>
              <td>{formatDuration(row.breaks, locale)}</td>
              <td>{formatDuration(row.total, locale)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}
