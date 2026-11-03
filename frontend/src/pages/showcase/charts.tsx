import { useTranslation } from 'react-i18next'
import { Activity, DollarSign, Timer, Users } from 'lucide-react'
import {
  AreaChart,
  BarChart,
  ComposedChart,
  DonutChart,
  LineChart,
  SankeyChart,
  StatTile,
  type ChartSeries,
} from '@/components/charts'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useDisplayLocale } from '@/hooks/use-display-locale'
import { ShowcaseSection, Specimen, SpecimenGrid } from './layout'
import {
  funnelLinks,
  funnelNodes,
  kpis,
  latency,
  monthlyRevenue,
  planMix,
  revenueVsTarget,
  signupsByChannel,
  topPages,
  usersByRegion,
} from './mock-data'

const KPI_ICONS = [DollarSign, Users, Activity, Timer]

const regionSeries: ChartSeries[] = [
  { key: 'americas', label: 'Americas' },
  { key: 'europe', label: 'Europe' },
  { key: 'asia', label: 'Asia-Pacific' },
]

export function ChartsSection() {
  const { t } = useTranslation()
  const locale = useDisplayLocale()
  const money = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v)
  const compact = (v: number) => new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(v)
  const ms = (v: number) => `${Math.round(v)} ms`
  const kpiValue = [money, compact, (v: number) => `${(v * 100).toFixed(1)}%`, ms]

  return (
    <ShowcaseSection id="charts" title={t('showcase.charts.title')} description={t('showcase.charts.description')}>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((kpi, i) => {
          const Icon = KPI_ICONS[i]
          return (
            <StatTile
              key={kpi.label}
              label={kpi.label}
              value={kpiValue[i](kpi.value)}
              delta={kpi.delta}
              deltaLabel="vs last month"
              higherIsBetter={kpi.higherIsBetter ?? true}
              trend={kpi.trend}
              icon={<Icon size={15} />}
            />
          )
        })}
      </div>

      <SpecimenGrid>
        <Specimen name="AreaChart — stacked, with table view" importFrom="@/components/charts" wide>
          <Tabs defaultValue="chart">
            <TabsList className="mb-3">
              <TabsTrigger value="chart">Chart</TabsTrigger>
              <TabsTrigger value="table">Table</TabsTrigger>
            </TabsList>
            <TabsContent value="chart">
              <AreaChart data={usersByRegion} xKey="date" series={regionSeries} stacked valueFormatter={compact} />
            </TabsContent>
            <TabsContent value="table">
              <div className="max-h-[300px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      {regionSeries.map((s) => <TableHead key={s.key} className="text-right">{s.label}</TableHead>)}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersByRegion.map((row) => (
                      <TableRow key={row.date}>
                        <TableCell>{row.date}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.americas.toLocaleString(locale)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.europe.toLocaleString(locale)}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.asia.toLocaleString(locale)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </Specimen>

        <Specimen name="AreaChart — overlaid" importFrom="@/components/charts">
          <AreaChart
            data={monthlyRevenue}
            xKey="month"
            series={[{ key: 'revenue', label: 'Revenue' }, { key: 'costs', label: 'Costs' }]}
            valueFormatter={money}
          />
        </Specimen>

        <Specimen name="LineChart — with reference line" importFrom="@/components/charts">
          <LineChart
            data={latency}
            xKey="hour"
            series={[{ key: 'p50', label: 'p50' }, { key: 'p95', label: 'p95' }]}
            reference={{ value: 350, label: 'SLA 350 ms' }}
            valueFormatter={ms}
          />
        </Specimen>

        <Specimen name="BarChart — grouped" importFrom="@/components/charts">
          <BarChart
            data={signupsByChannel}
            xKey="quarter"
            series={[
              { key: 'organic', label: 'Organic' },
              { key: 'paid', label: 'Paid' },
              { key: 'referral', label: 'Referral' },
            ]}
            valueFormatter={compact}
          />
        </Specimen>

        <Specimen name="BarChart — stacked" importFrom="@/components/charts">
          <BarChart
            data={signupsByChannel}
            xKey="quarter"
            stacked
            series={[
              { key: 'organic', label: 'Organic' },
              { key: 'paid', label: 'Paid' },
              { key: 'referral', label: 'Referral' },
            ]}
            valueFormatter={compact}
          />
        </Specimen>

        <Specimen name="BarChart — horizontal ranking" importFrom="@/components/charts">
          <BarChart
            data={topPages}
            xKey="page"
            horizontal
            series={[{ key: 'views', label: 'Views' }]}
            valueFormatter={compact}
          />
        </Specimen>

        <Specimen name="ComposedChart — actual vs target (one axis)" importFrom="@/components/charts">
          <ComposedChart
            data={revenueVsTarget}
            xKey="month"
            bars={[{ key: 'actual', label: 'Actual (k$)' }]}
            lines={[{ key: 'target', label: 'Target (k$)' }]}
          />
        </Specimen>

        <Specimen name="DonutChart" importFrom="@/components/charts">
          <DonutChart data={planMix} centerLabel="accounts" valueFormatter={compact} />
        </Specimen>

        <Specimen name="SankeyChart — acquisition funnel" importFrom="@/components/charts">
          <SankeyChart nodes={funnelNodes} links={funnelLinks} valueFormatter={compact} />
        </Specimen>
      </SpecimenGrid>
    </ShowcaseSection>
  )
}
