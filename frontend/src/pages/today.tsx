import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarCheck } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { greetingFor } from '@/components/lists/greeting'
import { PageHeader } from '@/components/page-header'
import { DayStats } from '@/components/today/day-stats'
import { DoneCard } from '@/components/today/done-card'
import { NowCard } from '@/components/today/now-card'
import { PendingCard } from '@/components/today/pending-card'
import { PlanVsReal } from '@/components/today/plan-vs-real'
import { TomorrowCard } from '@/components/today/tomorrow-card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/contexts/auth-context'
import { useWorkspace } from '@/contexts/workspace-context'
import { minuteClock } from '@/lib/agenda/format'
import { lists as listsApi } from '@/lib/api'
import { useFocus } from '@/lib/focus/use-focus'
import { clockMinutes } from '@/lib/plan/clock'
import { useNowMinute } from '@/lib/today/use-now-minute'
import { todayKey, useToday } from '@/lib/today/use-today'

/** `Quarta, 11 de novembro` / `Wednesday, November 11`: the day of `YYYY-MM-DD` in the user's language. */
function longDay(day: string, language: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(date).replace(/-feira$/, '')
  const dayMonth = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
  return `${weekday.charAt(0).toLocaleUpperCase(language)}${weekday.slice(1)}, ${dayMonth}`
}

/**
 * The Hoje dashboard at `/` (HOJE-01): where the user is now, what is pending and whether it fits, and what is done,
 * in the current workspace (HOJE-06). The day is read every 60 s and on window focus (HOJE-71), again when the focus
 * moves on (a session opens or closes, the task changes) and when the day turns (HOJE-70); a failed read keeps the
 * last day on screen (HOJE-73).
 */
export default function TodayPage() {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const { user } = useAuth()
  const { current, canWrite } = useWorkspace()
  const queryClient = useQueryClient()
  const { data, isError, refetch } = useToday()
  const listsQuery = useQuery({ queryKey: ['lists', { archived: false }], queryFn: () => listsApi.list({ archived: false }) })
  const focus = useFocus()

  const timeZone = data?.timezone ?? current?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const now = useNowMinute(timeZone, () => void refetch())

  // A session that opens or closes, or another task in focus, changes the day: read it now, not in 60 s.
  const focusKey = `${focus.state?.session?.id ?? ''}:${focus.state?.task?.id ?? ''}`
  const lastFocusKey = useRef<string | null>(null)
  useEffect(() => {
    if (focus.state === null) return
    if (lastFocusKey.current !== null && lastFocusKey.current !== focusKey) {
      void queryClient.invalidateQueries({ queryKey: todayKey(current?.id ?? null) })
    }
    lastFocusKey.current = focusKey
  }, [focusKey, focus.state, queryClient, current?.id])

  const name = user?.preferences?.display_name || user?.email?.split('@')[0] || ''
  const period = greetingFor(Math.floor(now.minute / 60))
  const workdayEnd = data ? (clockMinutes(data.workday.end) ?? 0) : 0
  const lists = (listsQuery.data?.lists ?? []).map(({ id, name: listName, color }) => ({ id, name: listName, color }))
  const focusLeftSeconds = focus.state?.session?.kind === 'task' && focus.display?.mode === 'countdown' ? focus.display.seconds : 0

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        section={current?.name ?? ''}
        title={t(`home.greeting.${period}`, { name })}
        action={
          data && (
            <Button variant="outline" size="sm" asChild>
              <Link to={`/planejar/${data.tomorrow}`}>
                <CalendarCheck size={14} />
                {t('plan.agenda.planTomorrow')}
              </Link>
            </Button>
          )
        }
      />
      {data && (
        <p className="-mt-8 mb-2 text-sm text-muted-foreground tabular-nums">
          {[
            longDay(now.day, language),
            minuteClock(now.minute),
            now.minute >= workdayEnd
              ? t('today.header.ended', { time: data.workday.end })
              : t('today.header.left', { duration: formatDuration((workdayEnd - now.minute) * 60, language), time: data.workday.end }),
          ].join(' · ')}
        </p>
      )}

      {isError && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
          <span>{t('today.header.readFailed')}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            {t('today.header.retry')}
          </Button>
        </div>
      )}

      {data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <NowCard
              focus={focus}
              canWrite={canWrite}
              nowMinute={now.minute}
              day={data.day}
              lists={lists}
              sessions={data.sessions}
              blocks={data.plan.blocks}
              pending={data.pending}
            />
            <DayStats
              planSaved={data.plan.saved}
              blocks={data.plan.blocks}
              sessions={data.sessions}
              done={data.done}
              focusTaskId={focus.state?.session?.kind === 'task' ? focus.state.session.task_id : null}
              nowMinute={now.minute}
            />
          </div>
          <PlanVsReal
            day={data.day}
            workday={data.workday}
            planSaved={data.plan.saved}
            blocks={data.plan.blocks}
            sessions={data.sessions}
            nowMinute={now.minute}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <PendingCard
              pending={data.pending}
              nowMinute={now.minute}
              workdayEnd={workdayEnd}
              focusLeftSeconds={focusLeftSeconds}
              canWrite={canWrite}
              timeZone={data.timezone}
              noLists={listsQuery.data !== undefined && listsQuery.data.lists.length === 0}
            />
            <div className="flex flex-col gap-4">
              <DoneCard done={data.done} sessions={data.sessions} canWrite={canWrite} timeZone={data.timezone} />
              <TomorrowCard
                tomorrow={data.tomorrow}
                tasks={data.tomorrow_tasks}
                weekUnscheduled={data.week_unscheduled}
                planBlocks={data.tomorrow_plan_blocks}
                canWrite={canWrite}
                timeZone={data.timezone}
              />
            </div>
          </div>
        </>
      ) : (
        !isError && <Skeleton className="h-64 w-full" />
      )}
    </div>
  )
}
