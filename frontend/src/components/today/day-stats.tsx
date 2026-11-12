import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { adherence, sessionSeconds, switches } from '@/lib/today/rules'
import { cn } from '@/lib/utils'
import type { TodayDoneTask, TodayPlanBlock, TodaySession } from '@/types'

interface DayStatsProps {
  planSaved: boolean
  blocks: TodayPlanBlock[]
  /** The reader's sessions of today, cut to the day. */
  sessions: TodaySession[]
  /** What the reader completed today. */
  done: TodayDoneTask[]
  /** The task of the open task session, if any. */
  focusTaskId: string | null
  nowMinute: number
}

function Stat({ id, label, value, children }: { id: string; label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col gap-1 rounded-xl border bg-card p-4">
      <div id={id} className="text-xs text-muted-foreground">
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      {children}
    </div>
  )
}

/**
 * The four numbers of the day beside the Now card (HOJE-49 to HOJE-53), counted on the client every minute from the
 * raw sessions and plan of the day read; the open session counts until now.
 */
export function DayStats({ planSaved, blocks, sessions, done, focusTaskId, nowMinute }: DayStatsProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const untilNow = sessions.map((session) => (session.open ? { ...session, end_minute: Math.max(session.end_minute, nowMinute) } : session))
  const taskSessions = untilNow.filter((session) => session.kind === 'task').length
  const focused = sessionSeconds(sessions, 'task', nowMinute)

  // One segment per planned task, in the order of its first block (HOJE-50).
  const planned = [
    ...new Set(
      [...blocks]
        .filter((block) => block.kind === 'task' && block.task_id !== null)
        .sort((a, b) => a.start_minute - b.start_minute)
        .map((block) => block.task_id as string),
    ),
  ]
  const doneIds = new Set(done.map((task) => task.id))
  const states = planned.map((taskId) => (doneIds.has(taskId) ? 'done' : taskId === focusTaskId ? 'focus' : 'pending'))
  const share = adherence(blocks, untilNow, nowMinute)

  return (
    <div className="grid grid-cols-2 gap-3">
      <Stat id="today-stat-focused" label={t('today.stats.focused')} value={formatDuration(focused, language)}>
        <div className="text-xs text-muted-foreground">{t('today.stats.breaks', { duration: formatDuration(sessionSeconds(sessions, 'break', nowMinute), language) })}</div>
      </Stat>
      <Stat
        id="today-stat-completed"
        label={t('today.stats.completed')}
        value={
          <span className="flex items-baseline gap-1.5">
            <span>{planSaved ? states.filter((state) => state === 'done').length : done.length}</span>
            {planSaved && <span className="text-sm font-normal text-muted-foreground">{t('today.stats.ofPlanned', { count: planned.length })}</span>}
          </span>
        }
      >
        {planSaved ? (
          <div className="flex gap-0.5">
            {states.map((state, index) => (
              <span
                key={planned[index]}
                data-testid="plan-segment"
                data-state={state}
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  state === 'done' && 'bg-status-good',
                  state === 'focus' && 'bg-indigo-500',
                  state === 'pending' && 'bg-muted',
                )}
              />
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">{t('today.stats.noPlan')}</div>
        )}
      </Stat>
      <Stat id="today-stat-adherence" label={t('today.stats.adherence')} value={share === null ? '—' : `${share}%`}>
        <div className="text-xs text-muted-foreground">{share === null ? t('today.stats.noBlocks') : t('today.stats.adherenceHint')}</div>
      </Stat>
      <Stat id="today-stat-switches" label={t('today.stats.switches')} value={switches(untilNow)}>
        {taskSessions > 0 && (
          <div className="text-xs text-muted-foreground">
            {t('today.stats.average', { duration: formatDuration(Math.round(focused / 60 / taskSessions) * 60, language) })}
          </div>
        )}
      </Stat>
    </div>
  )
}
