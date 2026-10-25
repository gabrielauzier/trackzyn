import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { SessionsReport } from '@/types'

function dayLabel(date: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`),
  )
}

interface SessionsTableProps {
  report: SessionsReport
  /** The day timezone of the report; start and end read in it. */
  timezone: string
}

/** Each session of the period by day, with start, end (or `em andamento`), task or `Intervalo`, list and duration (REPORT-20 to REPORT-22). */
export function SessionsTable({ report, timezone }: SessionsTableProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const time = (iso: string) =>
    new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: timezone }).format(new Date(iso))

  if (report.days.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('reports.noActivity')}</p>
  }

  return (
    <div className="flex flex-col gap-6">
      {report.days.map((day) => {
        const headingId = `sessions-${day.date}`
        return (
          <section key={day.date} className="flex flex-col gap-2">
            <h3 id={headingId} className="text-sm font-medium text-muted-foreground">
              {dayLabel(day.date, locale)}
            </h3>
            <Table aria-labelledby={headingId}>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('reports.sessions.start')}</TableHead>
                  <TableHead>{t('reports.sessions.end')}</TableHead>
                  <TableHead>{t('reports.sessions.task')}</TableHead>
                  <TableHead>{t('reports.sessions.list')}</TableHead>
                  <TableHead className="text-right">{t('reports.sessions.duration')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="tabular-nums">{time(session.started_at)}</TableCell>
                    <TableCell className="tabular-nums">
                      {session.ended_at === null ? t('reports.sessions.running') : time(session.ended_at)}
                    </TableCell>
                    <TableCell>{session.kind === 'break' ? t('reports.sessions.break') : session.task_title}</TableCell>
                    <TableCell>{session.list_name}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatDuration(session.seconds, locale)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </section>
        )
      })}
    </div>
  )
}
