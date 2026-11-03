import type { ChartSeries, ValueFormatter } from './chart-types'

/**
 * Shared building blocks for every chart in `components/charts`.
 *
 * Colour rules (see index.css): series take `--chart-1..8` in fixed order and
 * a series keeps its slot even when others are filtered out — pass `color`
 * explicitly when the visible set can change. Never use the status colours
 * for a series, and never put a second y-axis on a chart.
 */
export const SERIES_COLORS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
  'var(--chart-6)',
  'var(--chart-7)',
  'var(--chart-8)',
] as const

export const defaultFormatter: ValueFormatter = (v) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v)

export function seriesColor(series: ChartSeries, index: number): string {
  return series.color ?? SERIES_COLORS[index % SERIES_COLORS.length]
}

/** Recessive axes: muted ink, no axis line, no ticks. */
export const xAxisProps = {
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
  axisLine: false,
  tickLine: false,
  tickMargin: 8,
} as const

export const yAxisProps = {
  tick: { fontSize: 11, fill: 'var(--muted-foreground)' },
  axisLine: false,
  tickLine: false,
  width: 52,
  tickCount: 5,
} as const

/** Horizontal gridlines only, barely there. */
export const gridProps = {
  vertical: false,
  stroke: 'var(--border)',
  strokeDasharray: '3 3',
} as const

/** Crosshair for line/area charts. */
export const cursorLine = { stroke: 'var(--muted-foreground)', strokeOpacity: 0.4, strokeWidth: 1 }
/** Column highlight for bar charts. */
export const cursorBand = { fill: 'var(--muted)', fillOpacity: 0.5 }
