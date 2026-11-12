import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'

import { formatDuration } from '@/components/board/format-duration'
import { BreakPicker } from '@/components/focus/break-picker'
import { Button } from '@/components/ui/button'
import { minuteClock } from '@/lib/agenda/format'
import { serverNow } from '@/lib/focus/clock'
import type { Display } from '@/lib/focus/display'
import type { FocusConflict } from '@/lib/focus/queue'
import type { useFocus } from '@/lib/focus/use-focus'
import { useSessionWorkspace } from '@/lib/today/use-session-workspace'
import type { FocusState, PlanListRef, TodaySession } from '@/types'

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
  /** The reader's sessions of today: the name of an open break comes from them. */
  sessions: TodaySession[]
}

/**
 * `Agora`: what the user is doing now (HOJE-07 to HOJE-10, HOJE-74), with `Abrir foco` to the list of the session
 * (HOJE-17, HOJE-19). It follows the focus of the user wherever it is open; a session of another workspace is only
 * named (HOJE-20). The actions are the focus screen's, and a refusal shows in a toast (HOJE-22).
 */
export function NowCard({ focus, canWrite, nowMinute, lists, sessions }: NowCardProps) {
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
  const focusPath = session ? `/focus/${session.list_id}` : null

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
    </section>
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
      // SPEC_DEVIATION: HOJE-22 asks for the API's error message; the toast names the refused action instead.
      // Reason: the focus queue (AD-002) keeps a refusal's status and code only, not the message of the answer.
      toast.error(t('today.now.refused', { action: t(`focus.conflicts.types.${conflict.action.type.replace('/', '_')}`) }))
    }
    void queryClient.invalidateQueries({ queryKey: ['focus'] })
  }, [conflicts, queryClient, t])
}
