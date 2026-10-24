import { Bar, CartesianGrid, ComposedChart as RComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame, ChartLegend } from './chart-parts'
import { tooltipContent } from './chart-tooltip-content'
import { cursorBand, defaultFormatter, gridProps, seriesColor, xAxisProps, yAxisProps } from './chart-theme'
import { type ChartSeries, type ValueFormatter } from './chart-types'

export interface ComposedChartProps<T extends object> {
  data: T[]
  xKey: keyof T & string
  /** Drawn as bars (actual values per period). */
  bars: ChartSeries[]
  /** Drawn as lines on the SAME axis (target, average, running total). */
  lines: ChartSeries[]
  height?: number
  valueFormatter?: ValueFormatter
}

/**
 * Bars plus lines sharing one y-axis — e.g. monthly actuals against a target.
 * Deliberately single-axis: two measures on different scales belong in two
 * charts, not on a second axis.
 */
export function ComposedChart<T extends object>({
  data,
  xKey,
  bars,
  lines,
  height,
  valueFormatter = defaultFormatter,
}: ComposedChartProps<T>) {
  const all = [...bars, ...lines]
  return (
    <div className="space-y-3">
      <ChartLegend series={all} />
      <ChartFrame height={height}>
        <RComposedChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
          <CartesianGrid {...gridProps} />
          <XAxis dataKey={xKey} {...xAxisProps} />
          <YAxis {...yAxisProps} tickFormatter={valueFormatter} />
          <Tooltip cursor={cursorBand} content={tooltipContent({ formatter: valueFormatter })} />
          {bars.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={seriesColor(s, i)}
              radius={[4, 4, 0, 0]}
              maxBarSize={40}
              isAnimationActive={false}
            />
          ))}
          {lines.map((s, i) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={seriesColor(s, bars.length + i)}
              strokeWidth={2}
              dot={{ r: 3, strokeWidth: 2, stroke: 'var(--card)', fill: seriesColor(s, bars.length + i) }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
              isAnimationActive={false}
            />
          ))}
        </RComposedChart>
      </ChartFrame>
    </div>
  )
}
