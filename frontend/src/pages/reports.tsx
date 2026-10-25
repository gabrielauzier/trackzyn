import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Download } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { DailyChart } from '@/components/reports/daily-chart'
import { DoneVsEstimate } from '@/components/reports/done-vs-estimate'
import { OverviewTiles } from '@/components/reports/overview-tiles'
import { PrintHeader } from '@/components/reports/print-header'
import { ProductiveCards } from '@/components/reports/productive-cards'
import { ReportFilters } from '@/components/reports/report-filters'
import { SessionsTable } from '@/components/reports/sessions-table'
import { TimeByList } from '@/components/reports/time-by-list'
import { useReportFilter } from '@/components/reports/use-report-filter'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useWorkspace } from '@/contexts/workspace-context'
import { lists, reports } from '@/lib/api'

type ReportTab = 'overview' | 'sessions'

function Loading() {
  return <Skeleton className="h-64 w-full rounded-xl" />
}

function LoadError() {
  const { t } = useTranslation()
  return <p className="py-12 text-center text-sm text-destructive">{t('reports.loadError')}</p>
}

/** The filters, the tabs and their content, once the day timezone is known. */
function Reports({ timezone }: { timezone: string }) {
  const { t } = useTranslation()
  const { filter, notice, change, run } = useReportFilter(timezone)
  const [tab, setTab] = useState<ReportTab>('overview')
  const active = useQuery({ queryKey: ['lists', { archived: false }], queryFn: () => lists.list({ archived: false }) })
  const archived = useQuery({ queryKey: ['lists', { archived: true }], queryFn: () => lists.list({ archived: true }) })
  const listName =
    filter.listId === null
      ? t('reports.filters.allLists')
      : ([...(active.data?.lists ?? []), ...(archived.data?.lists ?? [])].find((list) => list.id === filter.listId)?.name ?? '')

  const overview = useQuery({
    queryKey: ['reports', 'overview', filter],
    queryFn: () => run(reports.overview, filter),
    enabled: tab === 'overview',
    placeholderData: keepPreviousData,
    retry: false,
  })
  const sessions = useQuery({
    queryKey: ['reports', 'sessions', filter],
    queryFn: () => run(reports.sessions, filter),
    enabled: tab === 'sessions',
    placeholderData: keepPreviousData,
    retry: false,
  })

  return (
    <Tabs value={tab} onValueChange={(value) => setTab(value as ReportTab)} className="gap-4">
      <div className="print-hidden flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          <TabsTrigger value="overview">{t('reports.tabs.overview')}</TabsTrigger>
          <TabsTrigger value="sessions">{t('reports.tabs.sessions')}</TabsTrigger>
        </TabsList>
        {tab === 'overview' && (
          <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
            <Download size={14} />
            {t('reports.exportPdf')}
          </Button>
        )}
      </div>
      <div className="print-hidden">
        <ReportFilters filter={filter} onChange={change} notice={notice} />
      </div>
      <TabsContent value="overview" className="flex flex-col gap-4">
        {overview.data ? (
          <>
            <PrintHeader from={filter.from} to={filter.to} listName={listName} />
            <OverviewTiles tiles={overview.data.tiles} />
            <Card className="p-4">
              <DailyChart daily={overview.data.daily} />
            </Card>
            <ProductiveCards productive={overview.data.productive} />
            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="p-4">
                <TimeByList byList={overview.data.by_list} breakSeconds={overview.data.break_seconds} />
              </Card>
              <Card className="p-4">
                <DoneVsEstimate done={overview.data.done} />
              </Card>
            </div>
          </>
        ) : overview.isError ? (
          <LoadError />
        ) : (
          <Loading />
        )}
      </TabsContent>
      <TabsContent value="sessions">
        {sessions.data ? (
          <SessionsTable report={sessions.data} timezone={timezone} />
        ) : sessions.isError ? (
          <LoadError />
        ) : (
          <Loading />
        )}
      </TabsContent>
    </Tabs>
  )
}

/** `/reports`: the logged-in user's own time, as an overview or session by session. */
export default function ReportsPage() {
  const { t } = useTranslation()
  const { current } = useWorkspace()
  // The lists answer carries the workspace day timezone, which decides the default week (REPORT-01).
  const active = useQuery({ queryKey: ['lists', { archived: false }], queryFn: () => lists.list({ archived: false }) })

  return (
    <div>
      <div className="print-hidden">
        <PageHeader section={current?.name ?? ''} title={t('nav.reports')} />
      </div>
      {active.data ? <Reports timezone={active.data.timezone} /> : active.isError ? <LoadError /> : <Loading />}
    </div>
  )
}
