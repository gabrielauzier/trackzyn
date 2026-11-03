import type { ReactNode } from 'react'
import { ChartTooltip, type ChartTooltipProps, type TooltipEntry } from './chart-parts'

type TooltipOptions = Omit<ChartTooltipProps, 'active' | 'label' | 'payload'>

/**
 * Build a Recharts `<Tooltip content>` renderer that draws `ChartTooltip`.
 * Only the hover state is taken from Recharts, so its own `formatter`
 * typing never leaks into ours.
 */
export function tooltipContent(options: TooltipOptions = {}) {
  return function TooltipContent(props: { active?: boolean; label?: unknown; payload?: readonly unknown[] }) {
    return (
      <ChartTooltip
        active={props.active}
        label={props.label as ReactNode}
        payload={props.payload as readonly TooltipEntry[] | undefined}
        {...options}
      />
    )
  }
}
