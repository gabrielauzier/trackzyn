import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { PlanBlock } from '@/components/plan/plan-block'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES } from '@/lib/agenda/layout'
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
  /** A click on the block: a task opens the plan of its day, a break its panel (PLAN-29). */
  onOpen?: (block: Planned) => void
}

/** The saved block in the shape the plan draws, so the Agenda shows it as the plan does. */
function asDraftBlock(block: Planned): DraftBlock {
  const start = clockMinutes(block.start) ?? 0
  return block.kind === 'task'
    ? { key: block.id, kind: 'task', start, minutes: block.minutes, task: block.task }
    : { key: block.id, kind: 'break', start, minutes: block.minutes, name: block.name, list: block.list }
}

/** The tooltip of a planned task (PLAN-46): the title and estimate, `Planejada · HH:MM – HH:MM · <duração>`, the list and the click. */
function PlannedTaskTip({ block }: { block: Extract<Planned, { kind: 'task' }> }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const start = clockMinutes(block.start) ?? 0
  const estimate = block.task.estimate_minutes
  return (
    <>
      <span className="flex items-baseline gap-2">
        <span className="font-medium break-words whitespace-normal">{block.task.title}</span>
        <span data-slot="planned-estimate" className="ml-auto shrink-0 tabular-nums opacity-80">
          {estimate === null ? t('agenda.scheduled.noEstimate') : t('agenda.scheduled.estimate', { duration: formatDuration(estimate * 60, language) })}
        </span>
      </span>
      <span className="tabular-nums opacity-80">
        {t('plan.agenda.plannedRange', {
          start: minuteClock(start),
          end: minuteClock((start + block.minutes) % DAY_MINUTES),
          duration: formatDuration(block.minutes * 60, language),
        })}
      </span>
      <span className="opacity-80">{block.task.list.name}</span>
      <span className="opacity-80">{t('plan.agenda.openPlanHint')}</span>
    </>
  )
}

/**
 * A block of the user's saved plan on the Agenda (PLAN-24, PLAN-39, PLAN-46, PLAN-47): a task dashed in the colour of
 * its list, crossed out once done, with a tooltip and a solid edge on hover; a break gray and hatched. A break starts
 * from the focus of its list, not from here (PLAN-28).
 */
export function PlannedBlock({ piece, pxPerMinute, onOpen }: PlannedBlockProps) {
  const { planned } = piece
  return (
    <PlanBlock
      piece={{ block: asDraftBlock(planned), start: piece.start, end: piece.end, lane: piece.lane, lanes: piece.lanes }}
      day={planned.day}
      pxPerMinute={pxPerMinute}
      onOpen={onOpen && (() => onOpen(planned))}
      tooltip={planned.kind === 'task' ? <PlannedTaskTip block={planned} /> : undefined}
    />
  )
}
