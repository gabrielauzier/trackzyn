import { useTranslation } from 'react-i18next'
import { Play } from 'lucide-react'

import { PlanBlock } from '@/components/plan/plan-block'
import type { DraftBlock } from '@/lib/plan/draft'
import { clockMinutes } from '@/lib/plan/clock'
import type { PlannedBlock as Planned } from '@/types'

/** A saved block of the plan as a column of the Agenda lays it out: its drawn minutes, cut at 24:00, and its lane. */
export interface PlannedPiece {
  planned: Planned
  start: number
  end: number
  lane: number
  lanes: number
}

interface PlannedBlockProps {
  piece: PlannedPiece
  pxPerMinute: number
  /** Today in the workspace timezone: only a break of today's plan can start (PLAN-28). */
  today: string
  /** A click on the block: a task opens the plan of its day, a break its panel (PLAN-29). */
  onOpen?: (block: Planned) => void
  /** `Começar`: the break becomes an Intervalo (PLAN-26); absent, the button does not show. */
  onStart?: (block: Planned) => void
}

/** The saved block in the shape the plan draws, so the Agenda shows it as the plan does. */
function asDraftBlock(block: Planned): DraftBlock {
  const start = clockMinutes(block.start) ?? 0
  return block.kind === 'task'
    ? { key: block.id, kind: 'task', start, minutes: block.minutes, task: block.task }
    : { key: block.id, kind: 'break', start, minutes: block.minutes, name: block.name, list: block.list }
}

/**
 * A block of the user's saved plan on the Agenda (PLAN-24, PLAN-28, PLAN-39): a task dashed in the colour of its list,
 * crossed out once done, and a break gray and hatched. A break of today's plan carries `Começar`.
 */
export function PlannedBlock({ piece, pxPerMinute, today, onOpen, onStart }: PlannedBlockProps) {
  const { t } = useTranslation()
  const { planned } = piece
  const startable = planned.kind === 'break' && planned.day === today && onStart !== undefined
  return (
    <PlanBlock
      piece={{ block: asDraftBlock(planned), start: piece.start, end: piece.end, lane: piece.lane, lanes: piece.lanes }}
      day={planned.day}
      pxPerMinute={pxPerMinute}
      onOpen={onOpen && (() => onOpen(planned))}
    >
      {startable && (
        <button
          type="button"
          data-slot="planned-start"
          className="absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground"
          // The button starts the break; it neither opens the block nor starts a gesture on the grid.
          onPointerDown={(event) => event.stopPropagation()}
          onKeyDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            onStart(planned)
          }}
        >
          <Play aria-hidden size={9} fill="currentColor" />
          {t('plan.agenda.start')}
        </button>
      )}
    </PlanBlock>
  )
}
