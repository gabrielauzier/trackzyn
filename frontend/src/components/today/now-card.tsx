import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'

import { formatDuration } from '@/components/board/format-duration'
import { taskKey } from '@/components/board/use-task'
import { BreakPicker } from '@/components/focus/break-picker'
import { Button } from '@/components/ui/button'
import { minuteClock } from '@/lib/agenda/format'
import { scheduledColors } from '@/lib/agenda/scheduled-colors'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { serverNow } from '@/lib/focus/clock'
import type { Display } from '@/lib/focus/display'
import type { FocusConflict } from '@/lib/focus/queue'
import type { useFocus } from '@/lib/focus/use-focus'
import { groupPending, suggestedBlock } from '@/lib/today/rules'
import { useSessionWorkspace } from '@/lib/today/use-session-workspace'
import type { FocusState, PlanListRef, TodayPendingTask, TodayPlanBlock, TodaySession } from '@/types'
import { TaskPicker } from './task-picker'

const DAY_MINUTES = 24 * 60

/** What the card reads of `useFocus()` without a list: the state, the timer, the actions and the refusals. */
export interface NowCardFocus {
  state: FocusState | null
  display: Display | null
  actions: ReturnType<typeof useFocus>['actions']
  conflicts: FocusConflict[]
}

interface NowCardProps {
  focus: NowCardFocus
  /** False for a `viewer`: no action at all (HOJE-21). */
  canWrite: boolean
  /** The current minute of the day in the workspace timezone. */
  nowMinute: number
  /** The workspace's active lists, to name the list of the session. */
  lists: PlanListRef[]
  /** The reader's sessions of today: the name of an open break and the last session of the day come from them. */
  sessions: TodaySession[]
  /** Today, `YYYY-MM-DD` in the workspace timezone, for `Planejar hoje` (HOJE-16). */
  day: string
  /** The blocks of today's plan: the one that holds now suggests a task (HOJE-11). */
  blocks: TodayPlanBlock[]
  /** The tasks of `Pendente`, for the picker and the count of HOJE-12. */
  pending: TodayPendingTask[]
}

/**
 * `Agora`: what the user is doing now (HOJE-07 to HOJE-10, HOJE-74), with `Abrir foco` to the list of the session
 * (HOJE-17, HOJE-19). It follows the focus of the user wherever it is open; a session of another workspace is only
 * named (HOJE-20). The actions are the focus screen's, and a refusal shows in a toast (HOJE-22). With nothing open,
 * it suggests the task the plan holds for now (HOJE-11) or offers to choose one (HOJE-12), over the time without
 * focus (HOJE-13).
 */
export function NowCard({ focus, canWrite, nowMinute, lists, sessions, day, blocks, pending }: NowCardProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const duration = (seconds: number) => formatDuration(Math.max(0, seconds), language)
  const { state, display, actions } = focus
  const session = state?.session ?? null
  const list = session ? lists.find((item) => item.id === session.list_id) : undefined
  const elsewhere = useSessionWorkspace(session?.list_id ?? null, list !== undefined)
  useRefusalToasts(focus.conflicts)

  let label: string
  let body: ReactNode = null
  let buttons: ReactNode = null
  const idle = useIdle({ focus, nowMinute, lists, blocks, pending })
  const focusPath = session ? `/focus/${session.list_id}` : idle.listId ? `/focus/${idle.listId}` : null

  if (session && elsewhere) {
    label = t('today.now.focusLabel')
    body = <p className="text-sm">{t('today.now.elsewhere', { name: elsewhere.name })}</p>
  } else if (session?.kind === 'break') {
    label = t('today.now.breakLabel')
    const name = sessions.find((item) => item.id === session.id)?.title ?? t('focus.break.open')
    body = (
      <div className="flex flex-col gap-1">
        <span className="text-lg font-semibold">{name}</span>
        <span className="text-sm text-muted-foreground tabular-nums">{t('today.now.breakLeft', { duration: duration(display?.seconds ?? 0) })}</span>
      </div>
    )
    if (canWrite) {
      buttons = (
        <Button variant="outline" onClick={() => void actions.endBreak()}>
          {t('focus.controls.endBreak')}
        </Button>
      )
    }
  } else if (session?.kind === 'task' && state?.task) {
    const task = state.task
    label = t('today.now.focusLabel')
    const title = (
      <span className="flex flex-col gap-0.5">
        <Link to={focusPath!} className="text-lg font-semibold hover:underline">
          {task.title}
        </Link>
        {list && <span className="text-xs text-muted-foreground">{list.name}</span>}
      </span>
    )
    if (display?.mode === 'awaiting_extend') {
      body = (
        <div className="flex flex-col gap-2">
          {title}
          <span className="text-sm font-medium text-amber-600 dark:text-amber-400">{t('today.now.extendLabel')}</span>
          <span className="text-sm text-muted-foreground tabular-nums">{t('today.now.spent', { duration: duration(task.spent_seconds) })}</span>
        </div>
      )
      if (canWrite) {
        buttons = (
          <>
            <Button onClick={() => void actions.extend(task.id)}>{t('focus.extend.extend')}</Button>
            <Button variant="outline" onClick={() => void actions.complete(task.id)}>
              {t('focus.controls.complete')}
            </Button>
          </>
        )
      }
    } else {
      const estimate = task.estimate_minutes === null ? null : task.estimate_minutes * 60
      const left = display?.mode === 'countdown' ? display.seconds : 0
      body = (
        <div className="flex flex-col gap-2">
          {title}
          {estimate === null ? (
            <span className="text-sm text-muted-foreground tabular-nums">
              {t('today.now.elapsed', { duration: duration((serverNow() - Date.parse(session.started_at)) / 1000) })}
            </span>
          ) : (
            <>
              <div
                role="progressbar"
                aria-label={t('today.now.progress')}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(((estimate - left) / estimate) * 100)}
                className="h-2 overflow-hidden rounded-full bg-muted"
              >
                <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, ((estimate - left) / estimate) * 100)}%` }} />
              </div>
              <span className="flex flex-wrap justify-between gap-2 text-sm tabular-nums">
                <span>{t('today.now.spentOf', { spent: duration(estimate - left), estimate: duration(estimate) })}</span>
                <span className="text-muted-foreground">
                  {t('today.now.left', {
                    duration: duration(left),
                    time: minuteClock((nowMinute + Math.round(left / 60)) % DAY_MINUTES),
                  })}
                </span>
              </span>
            </>
          )}
        </div>
      )
      if (canWrite) {
        buttons = (
          <>
            <Button onClick={() => void actions.complete(task.id)}>{t('focus.controls.complete')}</Button>
            <Button variant="outline" onClick={() => void actions.pause()}>
              {t('focus.controls.pause')}
            </Button>
            <BreakPicker onPick={(minutes) => void actions.takeBreak(minutes, undefined, session.list_id)} />
          </>
        )
      }
    }
  } else {
    label = t('today.now.idleLabel')
    const picker = (text: string) =>
      canWrite && <TaskPicker label={text} pending={pending} nowMinute={nowMinute} onPick={(task) => void idle.start(task.id)} />
    if (idle.block) {
      const block = idle.block
      body = (
        <div className="flex flex-col gap-2">
          <span className="text-sm text-muted-foreground">{t('today.now.byThePlan')}</span>
          <div
            data-slot="suggested-task"
            className="flex flex-col gap-0.5 rounded-md border-2 border-dashed px-3 py-2"
            style={block.list_color === null ? undefined : scheduledColors(block.list_color)}
          >
            <span className="text-lg font-semibold">{block.title}</span>
            {idle.listName && <span className="text-xs text-muted-foreground">{idle.listName}</span>}
          </div>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('today.now.blockTime', {
              start: minuteClock(block.start_minute),
              end: minuteClock((block.start_minute + block.minutes) % DAY_MINUTES),
              duration: duration((nowMinute - block.start_minute) * 60),
            })}
          </span>
        </div>
      )
      if (canWrite) {
        buttons = (
          <>
            <Button onClick={() => void idle.start(block.task_id!)}>{t('today.now.startFocus')}</Button>
            {picker(t('today.now.anotherTask'))}
            <BreakPicker onPick={(minutes) => void actions.takeBreak(minutes, undefined, idle.listId ?? undefined)} />
          </>
        )
      }
    } else {
      const estimated = pending.reduce((sum, task) => sum + (task.estimate_minutes ?? 0) * 60, 0)
      body = (
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">{t('today.now.nothingPlanned')}</span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {t('today.now.pendingCount', { count: pending.length, duration: duration(estimated) })}
          </span>
        </div>
      )
      buttons = (
        <>
          {picker(t('today.now.chooseTask'))}
          <Button variant="outline" asChild>
            <Link to={`/planejar/${day}`}>{t('today.now.planToday')}</Link>
          </Button>
        </>
      )
    }
  }

  return (
    <section aria-labelledby="today-now" className="flex flex-col gap-4 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="today-now" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </h2>
        {focusPath && !elsewhere && (
          <Link to={focusPath} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {t('today.now.openFocus')}
            <ArrowUpRight aria-hidden size={14} />
          </Link>
        )}
      </div>
      {body}
      {buttons && <div className="flex flex-wrap gap-2">{buttons}</div>}
      {!session && <IdleFooter sessions={sessions} nowMinute={nowMinute} />}
    </section>
  )
}

/**
 * With nothing open: the block of the plan that holds now and its task's list, the list `Abrir foco` goes to, and
 * `Começar foco`, which first brings a task of another column to the top of Today (HOJE-14).
 */
function useIdle({ focus, nowMinute, lists, blocks, pending }: Pick<NowCardProps, 'focus' | 'nowMinute' | 'lists' | 'blocks' | 'pending'>) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const open = focus.state?.session != null
  const block = open ? null : suggestedBlock(blocks, nowMinute)
  const inPending = block ? pending.find((task) => task.id === block.task_id) : undefined
  // A suggested task out of Today is not in `Pendente`: its list comes from the task itself.
  const outside = useQuery({
    queryKey: taskKey(block?.task_id ?? ''),
    queryFn: () => tasksApi.get(block!.task_id!),
    enabled: block !== null && block.task_id !== null && inPending === undefined,
  })
  const first = groupPending(pending, nowMinute)[0]?.tasks[0]
  const suggestedList = inPending?.list ?? lists.find((list) => list.id === outside.data?.list_id)
  const listId = open ? null : block ? (inPending?.list.id ?? outside.data?.list_id ?? null) : (first?.list.id ?? null)

  const start = async (taskId: string) => {
    if (!pending.some((task) => task.id === taskId)) {
      try {
        const task = await queryClient.fetchQuery({ queryKey: taskKey(taskId), queryFn: () => tasksApi.get(taskId) })
        // The focus only starts in Today: to the top of the Today of its own list.
        const top = pending
          .filter((item) => item.list.id === task.list_id)
          .sort((a, b) => a.position - b.position)[0]
        await tasksApi.move(taskId, { column: 'today', before_task_id: top?.id ?? null })
      } catch (error) {
        toast.error(extractApiError(error, t('common.error')))
        return
      }
    }
    await focus.actions.start(taskId)
  }

  return { block, listId, listName: suggestedList?.name, start }
}

/** `Sem foco há <tempo> · última sessão: <nome>, até <HH:MM>`, or `Nenhuma sessão hoje` (HOJE-13). */
function IdleFooter({ sessions, nowMinute }: { sessions: TodaySession[]; nowMinute: number }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const last = sessions.reduce<TodaySession | null>((latest, session) => (latest === null || session.end_minute > latest.end_minute ? session : latest), null)
  return (
    <p className="border-t pt-3 text-xs text-muted-foreground">
      {last === null
        ? t('today.now.noSession')
        : t('today.now.sinceLast', {
            duration: formatDuration(Math.max(0, nowMinute - last.end_minute) * 60, language),
            name: last.title ?? t('focus.break.open'),
            time: minuteClock(last.end_minute % DAY_MINUTES),
          })}
    </p>
  )
}

/**
 * A refusal of the server arrives as a conflict of the focus queue, which keeps the action and its code, not the
 * API's message. Each new one shows in a toast and the focus is read again, so the card goes back to the server's state.
 */
function useRefusalToasts(conflicts: FocusConflict[]) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  // The refusals already there when the card opened belong to the focus screen's list of conflicts.
  const seen = useRef(new Set(conflicts.map((conflict) => conflict.action_id)))
  useEffect(() => {
    const fresh = conflicts.filter((conflict) => !seen.current.has(conflict.action_id))
    if (fresh.length === 0) return
    for (const conflict of fresh) {
      seen.current.add(conflict.action_id)
      // The API's message (HOJE-22); a conflict without one names the refused action.
      toast.error(conflict.message ?? t('today.now.refused', { action: t(`focus.conflicts.types.${conflict.action.type.replace('/', '_')}`) }))
    }
    void queryClient.invalidateQueries({ queryKey: ['focus'] })
  }, [conflicts, queryClient, t])
}
