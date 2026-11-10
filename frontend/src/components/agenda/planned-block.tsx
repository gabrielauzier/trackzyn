import { useTranslation } from 'react-i18next'
import { CalendarCheck } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { TaskSlot } from '@/components/agenda/task-slot'
import { PlanBlock } from '@/components/plan/plan-block'
import { minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES } from '@/lib/agenda/layout'
import type { DraftBlock } from '@/lib/plan/draft'
import { longDay } from '@/lib/schedule'
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
  const elsewhere = block.task.scheduled_on !== null && block.task.scheduled_on !== block.day ? block.task.scheduled_on : null
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
      {elsewhere && <span className="opacity-80">{t('schedule.scheduledFor', { day: longDay(elsewhere, t, language) })}</span>}
      <span className="opacity-80">{t('plan.agenda.openPlanHint')}</span>
    </>
  )
}

/** The tooltip of a planned break (PLAN-46): its name, `Pausa planejada · HH:MM – HH:MM · <duração>`, its list and the click. */
function PlannedBreakTip({ block }: { block: Extract<Planned, { kind: 'break' }> }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const start = clockMinutes(block.start) ?? 0
  return (
    <>
      <span className="font-medium break-words whitespace-normal">{block.name}</span>
      <span className="tabular-nums opacity-80">
        {t('plan.agenda.breakRange', {
          start: minuteClock(start),
          end: minuteClock((start + block.minutes) % DAY_MINUTES),
          duration: formatDuration(block.minutes * 60, language),
        })}
      </span>
      <span className="opacity-80">{t('plan.agenda.breakList', { list: block.list.name })}</span>
      <span className="opacity-80">{t('plan.agenda.openBreakHint')}</span>
    </>
  )
}

/**
 * A block of the user's saved plan on the Agenda (PLAN-24, PLAN-39, PLAN-46, PLAN-47). A task looks like a scheduled
 * task, without text, with a dashed edge and a tooltip, but with the plan's icon; a done task never reaches it (PLAN-39). A break is
 * gray and hatched, as on the plan, with its own tooltip. A break starts from the focus of its list, not from here (PLAN-28).
 */
export function PlannedBlock({ piece, pxPerMinute, onOpen }: PlannedBlockProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const { planned } = piece
  const open = onOpen && (() => onOpen(planned))
  if (planned.kind === 'break') {
    return (
      <PlanBlock
        piece={{ block: asDraftBlock(planned), start: piece.start, end: piece.end, lane: piece.lane, lanes: piece.lanes }}
        day={planned.day}
        pxPerMinute={pxPerMinute}
        onOpen={open}
        tooltip={<PlannedBreakTip block={planned} />}
        onAgenda
      />
    )
  }
  const start = clockMinutes(planned.start) ?? 0
  const range = t('plan.block.range', { start: minuteClock(start), end: minuteClock((start + planned.minutes) % DAY_MINUTES) })
  return (
    <TaskSlot
      piece={piece}
      pxPerMinute={pxPerMinute}
      color={planned.task.list.color}
      icon={CalendarCheck}
      iconSlot="plan-icon"
      label={`${planned.task.title}, ${range} · ${formatDuration(planned.minutes * 60, language)}`}
      tooltip={<PlannedTaskTip block={planned} />}
      onOpen={open}
      solidOnHover
      data={{ 'data-plan-block': planned.id, 'data-kind': 'task' }}
    />
  )
}
