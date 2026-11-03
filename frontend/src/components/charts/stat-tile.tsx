import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Sparkline } from './sparkline'

export interface StatTileProps {
  label: string
  value: ReactNode
  /** Relative change, e.g. 0.124 for +12.4%. */
  delta?: number
  /** Text after the delta, e.g. "vs last month". */
  deltaLabel?: string
  /** Is an increase good news? Flip for metrics like churn or latency. */
  higherIsBetter?: boolean
  trend?: number[]
  icon?: ReactNode
  className?: string
}

/** The headline number. Often the right answer instead of a chart. */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  higherIsBetter = true,
  trend,
  icon,
  className,
}: StatTileProps) {
  const direction = delta === undefined || delta === 0 ? 0 : delta > 0 ? 1 : -1
  const good = direction === 0 ? null : (direction > 0) === higherIsBetter
  const DeltaIcon = direction > 0 ? ArrowUpRight : direction < 0 ? ArrowDownRight : Minus

  return (
    <div className={cn('rounded-xl border border-border/60 bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {delta !== undefined && (
        <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-medium tabular-nums',
              good === true && 'text-status-good',
              good === false && 'text-status-critical',
            )}
          >
            <DeltaIcon size={13} aria-hidden />
            {direction > 0 ? '+' : ''}
            {(delta * 100).toFixed(1)}%
          </span>
          {deltaLabel}
        </p>
      )}
      {trend && trend.length > 1 && (
        <div className="mt-3">
          <Sparkline values={trend} />
        </div>
      )}
    </div>
  )
}
