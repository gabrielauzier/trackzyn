import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'
import { cn } from '@/lib/utils'
import { defaultFormatter, seriesColor } from './chart-theme'
import type { ChartSeries, ValueFormatter } from './chart-types'

export function ChartFrame({ height = 260, className, children }: { height?: number; className?: string; children: ReactNode }) {
  return (
    <div className={cn('w-full', className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children as React.ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

export interface TooltipEntry {
  dataKey?: string | number
  name?: string | number
  value?: number | string | Array<number | string>
  color?: string
  payload?: { fill?: string }
}

export interface ChartTooltipProps {
  active?: boolean
  label?: ReactNode
  payload?: readonly TooltipEntry[]
  formatter?: ValueFormatter
  labelFormatter?: (label: ReactNode) => ReactNode
  /** Show a total row (stacked charts). */
  showTotal?: boolean
  totalLabel?: string
  /** Omit the heading row (pie/donut slices carry their own name). */
  hideLabel?: boolean
}

/** Card-styled tooltip. Values use text ink; only the swatch carries colour. */
export function ChartTooltip({
  active,
  label,
  payload,
  formatter = defaultFormatter,
  labelFormatter,
  showTotal,
  totalLabel = 'Total',
  hideLabel = false,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, p) => sum + (typeof p.value === 'number' ? p.value : 0), 0)
  return (
    <div className="min-w-36 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md">
      {!hideLabel && label !== undefined && label !== '' && (
        <p className="mb-1.5 font-medium">{labelFormatter ? labelFormatter(label) : label}</p>
      )}
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: entry.color ?? entry.payload?.fill }}
              aria-hidden
            />
            <span className="flex-1 text-muted-foreground">{entry.name}</span>
            <span className="tabular-nums font-medium">
              {typeof entry.value === 'number' ? formatter(entry.value) : String(entry.value ?? '')}
            </span>
          </div>
        ))}
        {showTotal && payload.length > 1 && (
          <div className="mt-1 flex items-center gap-2 border-t border-border pt-1">
            <span className="flex-1 text-muted-foreground">{totalLabel}</span>
            <span className="tabular-nums font-semibold">{formatter(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/** HTML legend above the plot. Always rendered for two or more series. */
export function ChartLegend({ series, className }: { series: ChartSeries[]; className?: string }) {
  if (series.length < 2) return null
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground', className)}>
      {series.map((s, i) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: seriesColor(s, i) }} aria-hidden />
          {s.label}
        </li>
      ))}
    </ul>
  )
}
