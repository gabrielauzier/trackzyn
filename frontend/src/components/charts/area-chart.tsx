import { Area, AreaChart as RAreaChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame, ChartLegend } from './chart-parts'
import { tooltipContent } from './chart-tooltip-content'
import { cursorLine, defaultFormatter, gridProps, seriesColor, xAxisProps, yAxisProps } from './chart-theme'
import { type ChartSeries, type ValueFormatter } from './chart-types'

export interface AreaChartProps<T extends object> {
  data: T[]
  /** Field holding the x value (usually a date label). */
  xKey: keyof T & string
  series: ChartSeries[]
  /** Stack the series (part-to-whole over time). Default: overlaid. */
  stacked?: boolean
  height?: number
  valueFormatter?: ValueFormatter
  xTickFormatter?: (value: string) => string
}

/** Change over time with a soft gradient fill. */
export function AreaChart<T extends object>({
  data,
  xKey,
  series,
  stacked = false,
  height,
  valueFormatter = defaultFormatter,
  xTickFormatter,
}: AreaChartProps<T>) {
  return (
    <div className="space-y-3">
      <ChartLegend series={series} />
      <ChartFrame height={height}>
        <RAreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {series.map((s, i) => (
              <linearGradient key={s.key} id={`area-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={seriesColor(s, i)} stopOpacity={stacked ? 0.55 : 0.25} />
                <stop offset="100%" stopColor={seriesColor(s, i)} stopOpacity={stacked ? 0.35 : 0.02} />
              </linearGradient>
            ))}
          </defs>
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} {...xAxisProps} tickFormatter={xTickFormatter} minTickGap={24} />
          <YAxis {...yAxisProps} tickFormatter={valueFormatter} />
          <Tooltip
            cursor={cursorLine}
            content={tooltipContent({ formatter: valueFormatter, showTotal: stacked })}
          />
          {series.map((s, i) => (
            <Area
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? 'stack' : undefined}
              stroke={seriesColor(s, i)}
              strokeWidth={2}
              fill={`url(#area-${s.key})`}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--card)' }}
              isAnimationActive={false}
            />
          ))}
        </RAreaChart>
      </ChartFrame>
    </div>
  )
}
