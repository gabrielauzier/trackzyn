import { Bar, BarChart as RBarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts'
import { ChartFrame, ChartLegend } from './chart-parts'
import { tooltipContent } from './chart-tooltip-content'
import { cursorBand, defaultFormatter, gridProps, seriesColor, xAxisProps, yAxisProps } from './chart-theme'
import { type ChartSeries, type ValueFormatter } from './chart-types'

export interface BarChartProps<T extends object> {
  data: T[]
  /** Field holding the category label. */
  xKey: keyof T & string
  series: ChartSeries[]
  /** Stack series into one bar per category. Default: grouped side by side. */
  stacked?: boolean
  /** Bars grow left→right; better for long category names or ranking. */
  horizontal?: boolean
  /** Width reserved for category labels in horizontal mode. */
  categoryWidth?: number
  height?: number
  valueFormatter?: ValueFormatter
}

const RADIUS = 4

/** Magnitude comparison across categories (grouped, stacked or horizontal). */
export function BarChart<T extends object>({
  data,
  xKey,
  series,
  stacked = false,
  horizontal = false,
  categoryWidth = 140,
  height,
  valueFormatter = defaultFormatter,
}: BarChartProps<T>) {
  // Only the data-end of a bar is rounded; in a stack that is the last series.
  const radiusFor = (index: number): [number, number, number, number] => {
    const isEnd = !stacked || index === series.length - 1
    if (!isEnd) return [0, 0, 0, 0]
    return horizontal ? [0, RADIUS, RADIUS, 0] : [RADIUS, RADIUS, 0, 0]
  }

  return (
    <div className="space-y-3">
      <ChartLegend series={series} />
      <ChartFrame height={height}>
        <RBarChart
          data={data}
          layout={horizontal ? 'vertical' : 'horizontal'}
          margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          barGap={2}
          barCategoryGap={horizontal ? '24%' : '28%'}
        >
          <CartesianGrid {...gridProps} vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" {...xAxisProps} tickFormatter={valueFormatter} />
              <YAxis type="category" dataKey={xKey} {...yAxisProps} width={categoryWidth} />
            </>
          ) : (
            <>
              <XAxis dataKey={xKey} {...xAxisProps} />
              <YAxis {...yAxisProps} tickFormatter={valueFormatter} />
            </>
          )}
          <Tooltip
            cursor={cursorBand}
            content={tooltipContent({ formatter: valueFormatter, showTotal: stacked })}
          />
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              stackId={stacked ? 'stack' : undefined}
              fill={seriesColor(s, i)}
              radius={radiusFor(i)}
              // 2px surface gap between stacked segments.
              stroke={stacked ? 'var(--card)' : undefined}
              strokeWidth={stacked ? 2 : 0}
              maxBarSize={48}
              isAnimationActive={false}
            />
          ))}
        </RBarChart>
      </ChartFrame>
    </div>
  )
}
