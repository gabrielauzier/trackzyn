import { useLayoutEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'

import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES, assignLanes, scheduledMinutes } from '@/lib/agenda/layout'
import { scheduledColors } from '@/lib/agenda/scheduled-colors'
import type { DraftBlock } from '@/lib/plan/draft'
import type { usePlanDrag } from '@/lib/plan/use-plan-drag'
import { cn } from '@/lib/utils'
import type { Workday } from '@/types'
import { PlanBlock, type LaidPlanBlock } from './plan-block'

const HOURS = Array.from({ length: 24 }, (_, hour) => hour)

/** Where the plan's list and grid sit side by side (Tailwind's `lg`). */
const WIDE = '(min-width: 1024px)'

/** What the day already holds and the plan does not move: a task scheduled with a time (PLAN-03). */
export interface FixedBlock {
  id: string
  kind: 'timed'
  title: string
  /** Minutes since midnight. */
  start: number
  minutes: number
  /** The colour of the list, 1..N. */
  color: number
}

export type PlanDrag = ReturnType<typeof usePlanDrag>

interface PlanGridProps {
  /** The day of the plan, `AAAA-MM-DD`. */
  day: string
  blocks: DraftBlock[]
  fixed: FixedBlock[]
  workday: Workday
  pxPerMinute?: number
  /** The gestures of the grid; absent, nothing moves (a past day, PLAN-34). */
  drag?: PlanDrag
  /** The block open in the editor. */
  selectedKey?: string | null
  /** A click on a block of the draft opens it (PLAN-06). */
  onOpen?: (key: string) => void
  /** How much of the window's top is pinned over the page (the plan's header): the workday start opens below it. */
  scrollInset?: () => number
}

type LaidFixed = { fixed: FixedBlock; start: number; end: number; lane: number; lanes: number }

const minuteOfClock = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

/** The drawn end of a block: it stops at 24:00, whatever its length (PLAN-44). */
const cut = (start: number, minutes: number) => Math.min(DAY_MINUTES, start + minutes)

function FixedPiece({ piece, pxPerMinute }: { piece: LaidFixed; pxPerMinute: number }) {
  const { t } = useTranslation()
  const { fixed } = piece
  const range = t('plan.block.range', { start: minuteClock(fixed.start), end: minuteClock((fixed.start + fixed.minutes) % DAY_MINUTES) })
  return (
    <div
      aria-label={`${fixed.title}, ${range}`}
      data-fixed={fixed.kind}
      // A fixed block is not empty time: a press on it starts nothing.
      onPointerDown={(event) => event.stopPropagation()}
      className={cn(
        'absolute flex flex-col gap-0.5 overflow-hidden rounded-md px-2 py-1 text-xs select-none',
        'border-2 border-dashed',
      )}
      style={{
        top: piece.start * pxPerMinute,
        height: Math.max(1, (piece.end - piece.start) * pxPerMinute),
        left: `${(piece.lane / piece.lanes) * 100}%`,
        width: `${100 / piece.lanes}%`,
        ...scheduledColors(fixed.color),
      }}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-semibold">{fixed.title}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-[11px] whitespace-nowrap text-muted-foreground">
          <Lock aria-hidden size={11} />
          {t('plan.grid.timed')}
        </span>
      </span>
      <span className="tabular-nums text-muted-foreground">{range}</span>
    </div>
  )
}

/**
 * The grid of one day, 00:00 to 24:00 (PLAN-03, PLAN-21, PLAN-44): it opens at the start of the workday, whose start
 * and end are marked and whose hours outside are shaded. The timed tasks are fixed; the blocks of
 * the draft move and stretch, and overlapping blocks share the width. A block that runs past 24:00 ends at the edge.
 */
export function PlanGrid({ day, blocks, fixed, workday, pxPerMinute = PX_PER_MINUTE, drag, selectedKey = null, onOpen, scrollInset }: PlanGridProps) {
  const { t } = useTranslation()
  const grid = useRef<HTMLDivElement>(null)
  const workStart = minuteOfClock(workday.start)
  const workEnd = minuteOfClock(workday.end)

  // The grid has no scroll of its own: the page scrolls it (PLAN-03). Side by side with the list (wide screens), the page
  // opens with the start of the workday just under what is pinned over it, and a new workday or zoom scrolls there again;
  // stacked, it opens at the top.
  useLayoutEffect(() => {
    if (!grid.current || !window.matchMedia(WIDE).matches) return
    window.scrollTo({ top: grid.current.getBoundingClientRect().top + window.scrollY + workStart * pxPerMinute - (scrollInset?.() ?? 0) })
    // The inset is read when the page scrolls, not a reason to scroll again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workStart, pxPerMinute])

  const preview = drag?.preview ?? null
  // The block under a gesture follows the pointer until it is released.
  const shown = useMemo(
    () =>
      preview && preview.mode !== 'drop'
        ? blocks.map((block) => (block.key === preview.key ? { ...block, start: preview.start, minutes: preview.minutes } : block))
        : blocks,
    [blocks, preview],
  )
  const laid = useMemo(
    () =>
      assignLanes<{ start: number; end: number; fixed?: FixedBlock; block?: DraftBlock }>([
        ...fixed.map((item) => ({ fixed: item, start: item.start, end: cut(item.start, item.minutes) })),
        ...shown.map((block) => ({ block, start: block.start, end: cut(block.start, block.minutes) })),
      ]),
    [fixed, shown],
  )
  const dropping = preview?.mode === 'drop' ? preview : null
  const dropMinutes = dropping
    ? dropping.item.kind === 'task'
      ? scheduledMinutes(dropping.item.task.estimate_minutes)
      : dropping.item.kind === 'new'
        ? scheduledMinutes(dropping.item.estimate)
        : dropping.item.minutes
    : 0

  return (
    <div ref={grid} data-plan-grid className="relative">
      <div className="relative flex" style={{ height: DAY_MINUTES * pxPerMinute }}>
        <div className="relative w-14 shrink-0" aria-hidden>
          {HOURS.map((hour) => (
            <span
              key={hour}
              className="absolute right-2 -translate-y-1/2 text-[10px] tabular-nums text-muted-foreground"
              style={{ top: hour * 60 * pxPerMinute }}
            >
              {hour === 0 ? '' : minuteClock(hour * 60)}
            </span>
          ))}
        </div>
        <div data-plan-column={day} aria-label={t('plan.grid.label')} role="group" className="relative flex-1 border-l">
          {HOURS.map((hour) => (
            <div
              key={hour}
              aria-hidden
              className="pointer-events-none absolute inset-x-0 border-t border-border/60"
              style={{ top: hour * 60 * pxPerMinute }}
            />
          ))}
          <div aria-hidden data-off-hours="before" className="pointer-events-none absolute inset-x-0 top-0 bg-muted/60" style={{ height: workStart * pxPerMinute }} />
          <div
            aria-hidden
            data-off-hours="after"
            className="pointer-events-none absolute inset-x-0 bg-muted/60"
            style={{ top: workEnd * pxPerMinute, height: (DAY_MINUTES - workEnd) * pxPerMinute }}
          />
          {(['start', 'end'] as const).map((edge) => (
            <div
              key={edge}
              data-workday-edge={edge}
              className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-primary/50"
              style={{ top: (edge === 'start' ? workStart : workEnd) * pxPerMinute }}
            >
              <span className={cn('absolute right-1 text-[11px] font-semibold text-primary', edge === 'start' ? '-top-5' : 'top-1')}>
                {t(edge === 'start' ? 'plan.grid.workdayStart' : 'plan.grid.workdayEnd')}
              </span>
            </div>
          ))}
          <div className="absolute inset-0 mx-0.5">
            {laid.map((piece) => {
              if (piece.fixed) return <FixedPiece key={`fixed:${piece.fixed.id}`} piece={piece as LaidFixed} pxPerMinute={pxPerMinute} />
              const block = piece.block!
              const target = { key: block.key, start: block.start, minutes: block.minutes }
              return (
                <PlanBlock
                  key={block.key}
                  piece={piece as LaidPlanBlock}
                  day={day}
                  pxPerMinute={pxPerMinute}
                  selected={block.key === selectedKey}
                  onOpen={onOpen && (() => onOpen(block.key))}
                  onPointerDown={drag && ((event) => drag.startMove(event, target))}
                >
                  {drag && (
                    <div
                      aria-hidden
                      data-handle="bottom"
                      className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize justify-center"
                      onPointerDown={(event) => drag.startResize(event, target)}
                    >
                      <span className="mt-0.5 h-1 w-6 rounded-full bg-foreground/50" />
                    </div>
                  )}
                </PlanBlock>
              )
            })}
            {dropping && dropping.start !== null && (
              <div
                aria-hidden
                data-drop-preview
                className="pointer-events-none absolute inset-x-0 z-20 rounded-md border-2 border-dashed border-primary bg-primary/15"
                style={{ top: dropping.start * pxPerMinute, height: (cut(dropping.start, dropMinutes) - dropping.start) * pxPerMinute }}
              />
            )}
          </div>
        </div>
      </div>
      {dropping && (
        // The copy of the item that follows the pointer while it is dragged.
        <div
          aria-hidden
          data-drag-ghost
          className="pointer-events-none fixed z-50 max-w-48 truncate rounded-md border bg-popover px-1.5 py-0.5 text-xs shadow-lg"
          style={{ left: dropping.x + 8, top: dropping.y + 8 }}
        >
          {dropping.item.kind === 'task' ? dropping.item.task.title : dropping.item.kind === 'new' ? t('plan.sidebar.newTask') : dropping.item.name}
        </div>
      )}
    </div>
  )
}
