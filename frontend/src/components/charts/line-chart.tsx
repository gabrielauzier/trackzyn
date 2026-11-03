import { CartesianGrid, Line, LineChart as RLineChart, ReferenceLine, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame, ChartLegend } from './chart-parts'
import { tooltipContent } from './chart-tooltip-content'
import { cursorLine, defaultFormatter, gridProps, seriesColor, xAxisProps, yAxisProps } from './chart-theme'
import { type ChartSeries, type ValueFormatter } from './chart-types'

export interface LineChartProps<T extends object> {
  data: T[]
  xKey: keyof T & string
  series: ChartSeries[]
  height?: number
  valueFormatter?: ValueFormatter
  /** Draw a dashed horizontal reference (target, threshold, average). */
  reference?: { value: number; label: string }
  /** Series keys drawn dashed (forecast, previous period). */
  dashed?: string[]
}

/** Trends and comparisons between a handful of series. */
export function LineChart<T extends object>({
  data,
  xKey,
  series,
  height,
  valueFormatter = defaultFormatter,
  reference,
  dashed = [],
}: LineChartProps<T>) {
  return (
    <div className="space-y-3">
      <ChartLegend series={series} />
      <ChartFrame height={height}>
        <RLineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} {...xAxisProps} minTickGap={24} />
          <YAxis {...yAxisProps} tickFormatter={valueFormatter} />
          <Tooltip cursor={cursorLine} content={tooltipContent({ formatter: valueFormatter })} />
          {reference && (
            <ReferenceLine
              y={reference.value}
              stroke="var(--muted-foreground)"
              strokeDasharray="4 4"
              strokeOpacity={0.6}
              label={{ value: reference.label, position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
          )}
          {series.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(s, i)}
              strokeWidth={2}
              strokeDasharray={dashed.includes(s.key) ? '6 4' : undefined}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
              isAnimationActive={false}
            />
          ))}
        </RLineChart>
      </ChartFrame>
    </div>
  )
}
