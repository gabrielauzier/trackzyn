import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { formatDuration } from '@/components/board/format-duration'
import { TaskDialog } from '@/components/board/task-dialog'
import { minuteClock } from '@/lib/agenda/format'
import { capacity, groupPending, startToday, type PendingGroupKey } from '@/lib/today/rules'
import { cn } from '@/lib/utils'
import type { TodayPendingTask } from '@/types'
import { TaskTile } from './task-tile'

interface PendingCardProps {
  pending: TodayPendingTask[]
  /** The current minute of the day in the workspace timezone. */
  nowMinute: number
  /** The end of the user's workday, in minutes of the day. */
  workdayEnd: number
  /** What is left of the estimate of the task in focus, 0 without one (HOJE-29). */
  focusLeftSeconds: number
  canWrite: boolean
  timeZone?: string
  /** The workspace has no active list: the empty state links to creating one (HOJE-72). */
  noLists?: boolean
}

/**
 * `Pendente`: the Today column of the workspace minus the task in focus (HOJE-23), whether it fits what is left of the
 * workday (HOJE-29 to HOJE-32), and the tasks by group of urgency (HOJE-25 to HOJE-28). A click opens the task (HOJE-33).
 */
export function PendingCard({ pending, nowMinute, workdayEnd, focusLeftSeconds, canWrite, timeZone, noLists }: PendingCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [openId, setOpenId] = useState<string | null>(null)
  const duration = (seconds: number) => formatDuration(seconds, language)
  const estimated = pending.reduce((sum, task) => sum + (task.estimate_minutes ?? 0) * 60, 0)

  return (
    <section aria-labelledby="today-pending" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-pending" className="text-sm font-semibold">
          {t('today.pending.title')}
        </h2>
        {pending.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('today.pending.summary', { count: pending.length, duration: duration(estimated) })}
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
          <p>{t('today.pending.empty')}</p>
          {noLists && (
            <Link to="/lists?new=1" className="font-medium text-primary hover:underline">
              {t('home.createList')}
            </Link>
          )}
        </div>
      ) : (
        <>
          <CapacityMeter pending={pending} nowMinute={nowMinute} workdayEnd={workdayEnd} focusLeftSeconds={focusLeftSeconds} />
          {groupPending(pending, nowMinute).map((group) => (
            <section key={group.key} aria-labelledby={`today-group-${group.key}`} className="flex flex-col gap-1.5">
              <h3
                id={`today-group-${group.key}`}
                className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
              >
                {t(`today.pending.groups.${group.key}`)} <span className="font-medium">{group.tasks.length}</span>
              </h3>
              <ul className="flex flex-col gap-1.5">
                {group.tasks.map((task) => (
                  <li key={task.id}>
                    <PendingTile task={task} group={group.key} nowMinute={nowMinute} onOpen={() => setOpenId(task.id)} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      )}
      <TaskDialog taskId={openId} canWrite={canWrite} timeZone={timeZone} onClose={() => setOpenId(null)} />
    </section>
  )
}

function PendingTile({ task, group, nowMinute, onOpen }: { task: TodayPendingTask; group: PendingGroupKey; nowMinute: number; onOpen: () => void }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const start = startToday(task)
  const meta: string[] = []
  // A late task says its start in amber; the others say it on the meta line.
  if (group !== 'late' && start !== null) meta.push(minuteClock(start))
  if (task.subtasks.total > 0) meta.push(t('today.pending.subtasks', { done: task.subtasks.done, total: task.subtasks.total }))
  const alert =
    group === 'late' && start !== null
      ? t('today.pending.passed', { time: minuteClock(start), duration: formatDuration((nowMinute - start) * 60, language) })
      : undefined
  const tag = group === 'carried' && task.days_late !== null ? t('today.pending.daysAgo', { count: task.days_late }) : undefined
  return (
    <TaskTile
      variant={group === 'late' ? 'late' : 'pending'}
      title={task.title}
      list={task.list}
      meta={meta}
      alert={alert}
      tag={tag}
      estimateMinutes={task.estimate_minutes}
      onOpen={onOpen}
    />
  )
}

/** The pending work against what is left of the workday; past it, amber with the excess hatched at the end (HOJE-30). */
function CapacityMeter({ pending, nowMinute, workdayEnd, focusLeftSeconds }: Omit<PendingCardProps, 'canWrite' | 'timeZone' | 'noLists'>) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const { needSeconds, leftSeconds, overSeconds, freeSeconds, withoutEstimate } = capacity(pending, focusLeftSeconds, nowMinute, workdayEnd)
  const over = overSeconds > 0
  // Over, the bar is the need: what fits solid, the excess hatched; under, the share of the time left.
  const fill = over ? leftSeconds / needSeconds : leftSeconds > 0 ? needSeconds / leftSeconds : 0

  return (
    <div data-over={over || undefined} className="flex flex-col gap-1.5">
      <span className={cn('text-sm font-medium', over && 'text-amber-600 dark:text-amber-400')}>
        {over
          ? t('today.capacity.over', { duration: formatDuration(overSeconds, language) })
          : t('today.capacity.fits', { duration: formatDuration(freeSeconds, language) })}
      </span>
      <div aria-hidden className="flex h-2 overflow-hidden rounded-full bg-muted">
        <div className={over ? 'bg-amber-500' : 'rounded-full bg-primary'} style={{ width: `${fill * 100}%` }} />
        {over && (
          <div
            data-slot="capacity-over"
            className="flex-1"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, var(--color-amber-500) 0 4px, color-mix(in oklab, var(--color-amber-500) 40%, transparent) 4px 7px)',
            }}
          />
        )}
      </div>
      {withoutEstimate > 0 && (
        <span className="text-xs text-muted-foreground">{t('today.capacity.withoutEstimate', { count: withoutEstimate })}</span>
      )}
    </div>
  )
}
