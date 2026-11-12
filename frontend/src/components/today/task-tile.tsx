import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { cn } from '@/lib/utils'
import type { PlanListRef, TodayDoneTask } from '@/types'

export type TaskTileVariant = 'pending' | 'late' | 'done' | 'ghost'

interface TaskTileProps {
  variant: TaskTileVariant
  title: string
  /** The task's list: its name opens the meta line and its colour the dot. A ghost has none. */
  list?: PlanListRef
  /** What follows the list name on the meta line, joined by ` · `. */
  meta?: string[]
  /** Amber text after the meta line: the start of a late task and how long ago it passed (HOJE-27). */
  alert?: string
  /** A small label beside the title, such as `3 days ago` (HOJE-28). */
  tag?: string
  /** The estimate pill; `null` says there is none, absent hides the pill. */
  estimateMinutes?: number | null
  /** The badge of a done task against its estimate (HOJE-37); `null` draws none. */
  verdict?: Pick<TodayDoneTask, 'verdict' | 'diff_seconds'> | null
  /** Makes the tile a button that opens the task (HOJE-33). */
  onOpen?: () => void
}

/**
 * A task of the Hoje dashboard, drawn as the tasks of the plan side list (HOJE-24): 1px edge, 8px corners, list dot,
 * title, `<list> · <details>` and the estimate pill. `late` turns the edge and the start amber, `done` fills it gray
 * with the done icon and the badge of the reports, and `ghost` is a dashed line with no dot.
 */
export function TaskTile({ variant, title, list, meta = [], alert, tag, estimateMinutes, verdict, onOpen }: TaskTileProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const metaLine = [...(list ? [list.name] : []), ...meta].join(' · ')

  const body = (
    <>
      {variant === 'done' ? (
        <CheckCircle2 data-slot="tile-done-icon" aria-hidden size={14} className="shrink-0 text-status-good" />
      ) : (
        variant !== 'ghost' &&
        list && (
          <span
            data-slot="tile-dot"
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: `var(--chart-${list.color})` }}
          />
        )
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className={cn('truncate text-sm font-medium', variant === 'ghost' && 'font-normal text-muted-foreground')}>{title}</span>
          {tag && (
            <span className="shrink-0 rounded-full bg-muted px-1.5 text-[11px] whitespace-nowrap text-muted-foreground">{tag}</span>
          )}
        </span>
        {(metaLine || alert) && (
          <span className="text-[11px] text-muted-foreground">
            {metaLine}
            {metaLine && alert && ' · '}
            {alert && <span className="font-medium text-amber-600 dark:text-amber-400">{alert}</span>}
          </span>
        )}
      </span>
      {verdict && <VerdictBadge verdict={verdict} language={language} />}
      {estimateMinutes !== undefined && (
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] whitespace-nowrap tabular-nums text-muted-foreground">
          {estimateMinutes === null ? t('today.tile.noEstimate') : formatDuration(estimateMinutes * 60, language)}
        </span>
      )}
    </>
  )

  const className = cn(
    'flex w-full items-center gap-2.5 rounded-md border bg-card px-2.5 py-2',
    variant === 'late' && 'border-amber-500',
    variant === 'done' && 'bg-muted/50',
    variant === 'ghost' && 'border-dashed bg-transparent',
    onOpen && 'cursor-pointer outline-2 outline-transparent hover:border-primary focus-visible:outline-(--ring)',
  )

  return onOpen ? (
    <button type="button" data-task-tile data-variant={variant} className={className} onClick={onOpen}>
      {body}
    </button>
  ) : (
    <div data-task-tile data-variant={variant} className={className}>
      {body}
    </div>
  )
}

/** `On time` or `<diff> early` in green, `<diff> late` in red, as the reports' badge (verdictOf). */
function VerdictBadge({ verdict, language }: { verdict: Pick<TodayDoneTask, 'verdict' | 'diff_seconds'>; language: string }) {
  const { t } = useTranslation()
  if (verdict.verdict === null) return null
  const diff = formatDuration(Math.abs(verdict.diff_seconds), language)
  const late = verdict.verdict === 'late'
  const text =
    verdict.verdict === 'early' ? t('reports.done.early', { diff }) : late ? t('reports.done.late', { diff }) : t('reports.done.onTime')
  return (
    <span
      className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap',
        late ? 'bg-status-critical/15 text-status-critical' : 'bg-status-good/15 text-status-good',
      )}
    >
      {text}
    </span>
  )
}
