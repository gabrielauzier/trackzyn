import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { TaskDialog } from '@/components/board/task-dialog'
import type { TodayDoneTask, TodaySession } from '@/types'
import { TaskTile } from './task-tile'

interface DoneCardProps {
  /** The tasks the reader completed today, newest first (HOJE-35). */
  done: TodayDoneTask[]
  /** The reader's sessions of today, cut to the day. */
  sessions: TodaySession[]
  canWrite: boolean
  timeZone?: string
}

/**
 * `Feito hoje`: the tasks the reader completed today with the time of each and the badge of the reports (HOJE-37,
 * HOJE-38). The title sums the reader's sessions of today on these tasks (HOJE-36).
 */
export function DoneCard({ done, sessions, canWrite, timeZone }: DoneCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [openId, setOpenId] = useState<string | null>(null)
  const ids = new Set(done.map((task) => task.id))
  const minutes = sessions
    .filter((session) => session.kind === 'task' && session.task_id !== null && ids.has(session.task_id))
    .reduce((sum, session) => sum + session.end_minute - session.start_minute, 0)

  return (
    <section aria-labelledby="today-done" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-done" className="text-sm font-semibold">
          {t('today.done.title')}
        </h2>
        {done.length > 0 && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('today.done.summary', { count: done.length, duration: formatDuration(minutes * 60, language) })}
          </span>
        )}
      </div>
      {done.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('today.done.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {done.map((task) => {
            const spent = formatDuration(task.spent_seconds, language)
            const time =
              task.estimate_minutes === null ? spent : t('today.done.spentOf', { spent, estimate: formatDuration(task.estimate_minutes * 60, language) })
            return (
              <li key={task.id}>
                <TaskTile
                  variant="done"
                  title={task.title}
                  list={task.list}
                  meta={[time]}
                  verdict={task.estimate_minutes === null ? null : task}
                  onOpen={() => setOpenId(task.id)}
                />
              </li>
            )
          })}
        </ul>
      )}
      <TaskDialog taskId={openId} canWrite={canWrite} timeZone={timeZone} onClose={() => setOpenId(null)} />
    </section>
  )
}
