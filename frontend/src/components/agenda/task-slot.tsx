import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { scheduledColors } from '@/lib/agenda/scheduled-colors'
import { cn } from '@/lib/utils'

interface TaskSlotProps {
  /** Minutes since the column's midnight, cut at 24:00, and the lane among the blocks beside it. */
  piece: { start: number; end: number; lane: number; lanes: number }
  pxPerMinute: number
  /** The list colour (`--chart-<n>`). */
  color: number
  /** The icon of the top right corner, which says what kind of block it is. */
  icon: LucideIcon
  iconSlot: string
  /** The name a screen reader reads; the block itself shows no text. */
  label: string
  /** What hovering or focusing the block shows. */
  tooltip: ReactNode
  /** A click or Enter. */
  onOpen?: () => void
  /** A press on the block; absent, the press only keeps the column from starting a draft under it. */
  onPointerDown?: (event: PointerEvent) => void
  /** The edge turns solid on hover. */
  solidOnHover?: boolean
  className?: string
  /** `data-*` attributes of the block. */
  data?: Record<`data-${string}`, string | boolean | undefined>
}

/**
 * A task on the Agenda grid without text (US-5, PLAN-46, PLAN-47): a faint fill and a dashed edge in the colour of its
 * list, an icon in the top right corner and a tooltip with the rest. Scheduled and planned tasks share it.
 */
export function TaskSlot({
  piece,
  pxPerMinute,
  color,
  icon: Icon,
  iconSlot,
  label,
  tooltip,
  onOpen,
  onPointerDown,
  solidOnHover = false,
  className,
  data,
}: TaskSlotProps) {
  const style: CSSProperties = {
    top: piece.start * pxPerMinute,
    height: Math.max(1, (piece.end - piece.start) * pxPerMinute),
    left: `${(piece.lane / piece.lanes) * 100}%`,
    width: `${100 / piece.lanes}%`,
    ...scheduledColors(color),
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    onOpen?.()
  }

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            role="button"
            tabIndex={0}
            aria-label={label}
            {...data}
            className={cn(
              'absolute overflow-hidden rounded-md border-2 border-dashed select-none',
              'outline-2 outline-transparent hover:z-20 focus-visible:outline-(--ring)',
              solidOnHover && 'hover:border-solid',
              className,
            )}
            style={style}
            onClick={onOpen}
            onKeyDown={onKeyDown}
            // The block is not empty time: a press on it starts no draft on the column under it.
            onPointerDown={(event) => (onPointerDown ? onPointerDown(event) : event.stopPropagation())}
          >
            <span aria-hidden data-slot={iconSlot} className="absolute top-0 right-0 flex rounded-bl-md bg-background/80 p-0.5">
              <Icon size={10} />
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="flex flex-col gap-0.5">
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
