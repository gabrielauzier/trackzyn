import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { tooltipContent } from './chart-tooltip-content'
import { SERIES_COLORS, defaultFormatter } from './chart-theme'
import { type ValueFormatter } from './chart-types'

export interface DonutSlice {
  key: string
  label: string
  value: number
  color?: string
}

export interface DonutChartProps {
  data: DonutSlice[]
  /** Big number in the hole; defaults to the formatted total. */
  centerValue?: string
  centerLabel?: string
  size?: number
  valueFormatter?: ValueFormatter
  /** Whole percentages per slice, in order, when they must add up to 100; by default each slice is rounded on its own. */
  shares?: number[]
}

/**
 * Part-to-whole for a few slices (≤ 6; fold the tail into "Other"). The
 * legend lists every slice with its share, so the reading never depends on
 * telling arcs apart by colour.
 */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  size = 200,
  valueFormatter = defaultFormatter,
  shares,
}: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  const colorOf = (d: DonutSlice, i: number) => d.color ?? SERIES_COLORS[i % SERIES_COLORS.length]

  return (
    // Side by side only when the container (not the viewport) has room.
    <div className="@container">
      <div className="flex flex-col items-center gap-5 @md:flex-row">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="68%"
                outerRadius="100%"
                paddingAngle={0}
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((d, i) => (
                  <Cell key={d.key} fill={colorOf(d, i)} />
                ))}
              </Pie>
              <Tooltip content={tooltipContent({ formatter: valueFormatter, hideLabel: true })} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tabular-nums">{centerValue ?? valueFormatter(total)}</span>
            {centerLabel && <span className="text-xs text-muted-foreground">{centerLabel}</span>}
          </div>
        </div>
        <ul className="w-full min-w-0 flex-1 space-y-2 text-sm">
          {data.map((d, i) => (
            <li key={d.key} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: colorOf(d, i) }} aria-hidden />
              <span className="flex-1 truncate text-muted-foreground">{d.label}</span>
              <span className="tabular-nums font-medium">{valueFormatter(d.value)}</span>
              <span className="w-12 text-right tabular-nums text-xs text-muted-foreground">
                {shares ? `${shares[i]}%` : total > 0 ? `${((d.value / total) * 100).toFixed(0)}%` : '—'}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
