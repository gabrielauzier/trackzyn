import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { DoneTaskView, Overview } from '@/types'

function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

function VerdictBadge({ task, locale }: { task: DoneTaskView; locale: string }) {
  const { t } = useTranslation()
  if (task.verdict === null) return null
  const diff = formatDuration(Math.abs(task.diff_seconds), locale)
  const late = task.verdict === 'late'
  const text =
    task.verdict === 'early' ? t('reports.done.early', { diff }) : late ? t('reports.done.late', { diff }) : t('reports.done.onTime')
  return (
    <Badge
      variant="outline"
      className={cn('border-transparent', late ? 'bg-status-critical/15 text-status-critical' : 'bg-status-good/15 text-status-good')}
    >
      {text}
    </Badge>
  )
}

/**
 * The done tasks of the period by day, each with its badge against the estimate, and the share of green
 * and red badges with a split bar (REPORT-14 to REPORT-19).
 */
export function DoneVsEstimate({ done }: { done: Overview['done'] }) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const percent = (value: number) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)}%`
  const green = done.early_or_on_time_pct
  const red = done.late_pct

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{t('reports.done.title')}</h2>
        {green !== null && red !== null && (
          <div className="flex items-center gap-4 text-sm font-medium tabular-nums">
            <span className="flex items-center gap-1.5" title={t('reports.done.greenShare')}>
              <span className="size-2.5 rounded-full bg-status-good" aria-hidden />
              {percent(green)}
            </span>
            <span className="flex items-center gap-1.5" title={t('reports.done.redShare')}>
              <span className="size-2.5 rounded-full bg-status-critical" aria-hidden />
              {percent(red)}
            </span>
          </div>
        )}
      </div>
      {green !== null && red !== null && (
        <div
          role="img"
          aria-label={t('reports.done.bar', { green: percent(green), red: percent(red) })}
          className="flex h-1.5 gap-0.5 overflow-hidden rounded-full"
        >
          <div className="rounded-full bg-status-good" style={{ width: `${green}%` }} />
          <div className="rounded-full bg-status-critical" style={{ width: `${red}%` }} />
        </div>
      )}
      {done.days.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('reports.done.empty')}</p>
      ) : (
        done.days.map((day) => (
          <section key={day.date} className="flex flex-col">
            <div className="flex items-center justify-between border-b border-border/60 pb-2 text-sm text-muted-foreground">
              <h3>{dayLabel(day.date, locale)}</h3>
              <span>{t('reports.done.taskCount', { count: day.tasks.length })}</span>
            </div>
            <ul className="divide-y divide-border/60">
              {day.tasks.map((task) => (
                <li key={task.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  <VerdictBadge task={task} locale={locale} />
                  <span className="tabular-nums text-muted-foreground">{formatDuration(task.spent_seconds, locale)}</span>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
