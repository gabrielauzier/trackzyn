import { Area, AreaChart, ResponsiveContainer } from 'recharts'

export interface SparklineProps {
  values: number[]
  color?: string
  height?: number
  /** Accessible summary, e.g. "Up 12% over 30 days". */
  ariaLabel?: string
}

/** Word-sized trend line for stat tiles and table cells. No axes, no tooltip. */
export function Sparkline({ values, color = 'var(--chart-1)', height = 36, ariaLabel }: SparklineProps) {
  const data = values.map((value, index) => ({ index, value }))
  const gradientId = `spark-${values.length}-${values[0] ?? 0}-${values[values.length - 1] ?? 0}`
  return (
    <div style={{ height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
