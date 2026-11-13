import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { CalendarCheck } from 'lucide-react'

import { TaskDialog } from '@/components/board/task-dialog'
import { Button } from '@/components/ui/button'
import { minuteClock } from '@/lib/agenda/format'
import type { TodayTomorrowTask } from '@/types'
import { TaskTile } from './task-tile'

interface TomorrowCardProps {
  /** Tomorrow in the workspace timezone, `YYYY-MM-DD`. */
  tomorrow: string
  /** Not done, scheduled for tomorrow, the ones with a time first (HOJE-54). */
  tasks: TodayTomorrowTask[]
  /** `This week` tasks without a day (HOJE-55). */
  weekUnscheduled: number
  /** The blocks of the plan of tomorrow; 0 without a plan (HOJE-56). */
  planBlocks: number
  canWrite: boolean
  timeZone?: string
}

/** `quinta, 12 de novembro` / `Thursday, November 12`. */
function longDay(day: string, language: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(date).replace(/-feira$/, '')
  const dayMonth = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
  return `${weekday}, ${dayMonth}`
}

/**
 * `Amanhã`: what is already set for tomorrow (HOJE-54), the `This week` tasks without a day as a dashed line
 * (HOJE-55), and whether tomorrow has a plan, with `Planejar amanhã` (HOJE-56).
 */
export function TomorrowCard({ tomorrow, tasks, weekUnscheduled, planBlocks, canWrite, timeZone }: TomorrowCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const navigate = useNavigate()
  const [openId, setOpenId] = useState<string | null>(null)
  const empty = tasks.length === 0 && weekUnscheduled === 0

  return (
    <section aria-labelledby="today-tomorrow" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-tomorrow" className="text-sm font-semibold">
          {t('today.tomorrow.title')}
        </h2>
        <span className="text-xs text-muted-foreground">{longDay(tomorrow, language)}</span>
      </div>
      {empty ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{t('today.tomorrow.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {tasks.map((task) => (
            <li key={task.id}>
              <TaskTile
                variant="pending"
                title={task.title}
                list={task.list}
                meta={[
                  ...(task.scheduled_minute === null ? [] : [minuteClock(task.scheduled_minute)]),
                  task.series ? t('today.tomorrow.recurring') : t('today.tomorrow.scheduled'),
                ]}
                estimateMinutes={task.estimate_minutes}
                onOpen={() => setOpenId(task.id)}
              />
            </li>
          ))}
          {weekUnscheduled > 0 && (
            <li>
              <TaskTile variant="ghost" title={t('today.tomorrow.weekUnscheduled', { count: weekUnscheduled })} />
            </li>
          )}
        </ul>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <span className="text-xs text-muted-foreground">
          {planBlocks === 0 ? t('today.tomorrow.noPlan') : t('today.tomorrow.planBlocks', { count: planBlocks })}
        </span>
        <Button variant="outline" size="sm" onClick={() => navigate(`/planejar/${tomorrow}`)}>
          <CalendarCheck size={14} />
          {t('plan.agenda.planTomorrow')}
        </Button>
      </div>
      <TaskDialog taskId={openId} canWrite={canWrite} timeZone={timeZone} onClose={() => setOpenId(null)} />
    </section>
  )
}
