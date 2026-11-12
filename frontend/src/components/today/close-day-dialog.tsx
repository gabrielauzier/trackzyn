import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Moon } from 'lucide-react'
import { toast } from 'sonner'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { minuteClock } from '@/lib/agenda/format'
import { today as todayApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { adherence, sessionSeconds } from '@/lib/today/rules'
import { type CloseDestination, summaryMarkdown } from '@/lib/today/summary'
import { todayKey } from '@/lib/today/use-today'
import { cn } from '@/lib/utils'
import type { PlanListRef, TodayRead } from '@/types'

const DESTINATIONS: readonly CloseDestination[] = ['tomorrow', 'this_week', 'backlog']
/** A task carried this many days or more says how long it has been put off (HOJE-60). */
const POSTPONED_FROM = 3
const NOTE_MAX = 2000

/** The task of the open task session, when its list is in this workspace. */
export interface CloseFocusTask {
  id: string
  title: string
  estimate_minutes: number | null
  list: PlanListRef
}

interface CloseDayDialogProps {
  onClose: () => void
  workspaceId: string | null
  workspaceName: string
  data: TodayRead
  nowMinute: number
  /** The active lists of the workspace, for the names of the time by list. */
  lists: PlanListRef[]
  focusTask: CloseFocusTask | null
}

interface OpenTask {
  id: string
  title: string
  list: PlanListRef
  estimate_minutes: number | null
  days_late: number | null
  /** An occurrence of a series only goes to tomorrow (HOJE-75). */
  series: boolean
}

/** `Quarta, 11 de novembro` / `Wednesday, November 11`. */
function longDay(day: string, language: string): string {
  const date = new Date(`${day}T12:00:00Z`)
  const weekday = new Intl.DateTimeFormat(language, { weekday: 'long', timeZone: 'UTC' }).format(date).replace(/-feira$/, '')
  const dayMonth = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
  return `${weekday.charAt(0).toLocaleUpperCase(language)}${weekday.slice(1)}, ${dayMonth}`
}

/**
 * `Fechar o dia` (HOJE-41 to HOJE-66): the numbers of the day, the focused time by list, where each pending task and
 * the task in focus goes (`Amanhã` by default), the note and the summary in Markdown. Confirming sends every move in
 * one write; a refusal keeps the dialog open with the choices, and a refused copy still closes the day.
 */
export function CloseDayDialog({ onClose, workspaceId, workspaceName, data, nowMinute, lists, focusTask }: CloseDayDialogProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const queryClient = useQueryClient()
  const [destinations, setDestinations] = useState<Record<string, CloseDestination>>({})
  const [note, setNote] = useState('')
  const [copy, setCopy] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const sessions = data.sessions.map((session) =>
    session.open ? { ...session, end_minute: Math.max(session.end_minute, nowMinute) } : session,
  )
  const taskSessions = sessions.filter((session) => session.kind === 'task')
  const focusedSeconds = sessionSeconds(data.sessions, 'task', nowMinute)
  const planned = data.plan.saved
    ? new Set(data.plan.blocks.filter((block) => block.kind === 'task' && block.task_id !== null).map((block) => block.task_id)).size
    : null
  const share = adherence(data.plan.blocks, sessions, nowMinute)
  const estimated = data.done.filter((task) => task.estimate_minutes !== null)
  const inTime = estimated.filter((task) => task.verdict === 'early' || task.verdict === 'on_time').length

  // The focused time of today by list, the largest first (HOJE-58).
  const byList = [
    ...taskSessions
      .reduce((all, session) => {
        const found = all.get(session.list_id) ?? { id: session.list_id, color: session.list_color, minutes: 0 }
        found.minutes += session.end_minute - session.start_minute
        return all.set(session.list_id, found)
      }, new Map<string, { id: string; color: number; minutes: number }>())
      .values(),
  ]
    .filter((item) => item.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
  const listName = (id: string) => lists.find((list) => list.id === id)?.name ?? ''

  const open: OpenTask[] = [
    ...(focusTask ? [{ ...focusTask, days_late: null, series: data.focus_task_series }] : []),
    ...data.pending.filter((task) => task.id !== focusTask?.id),
  ]
  const destinationOf = (id: string) => destinations[id] ?? 'tomorrow'

  const summary = summaryMarkdown(
    {
      workspace: workspaceName,
      day: data.day,
      focusedSeconds,
      doneCount: data.done.length,
      plannedCount: planned,
      adherence: share,
      done: data.done.map((task) => ({ ...task, list: task.list.name })),
      later: open.map((task) => ({ title: task.title, to: destinationOf(task.id) })),
      note,
    },
    t,
    language,
  )

  const copySummary = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('today.close.copied'))
    } catch {
      // The day is already closed: only the copy is offered again (HOJE-66).
      toast.error(t('today.close.copyFailed'), { action: { label: t('today.close.copyAgain'), onClick: () => void copySummary(text) } })
    }
  }

  const confirm = async () => {
    setSaving(true)
    setError(null)
    let read: TodayRead
    try {
      read = await todayApi.close(open.map((task) => ({ task_id: task.id, to: destinationOf(task.id) })))
    } catch (failure) {
      setError(extractApiError(failure, t('today.close.failed')))
      setSaving(false)
      return
    }
    queryClient.setQueryData(todayKey(workspaceId), read)
    // The open session was paused: the Now card reads the focus again.
    void queryClient.invalidateQueries({ queryKey: ['focus'] })
    onClose()
    if (copy) await copySummary(summary)
  }

  const stat = (label: string, value: string, of?: string) => (
    <div role="group" aria-label={label} className="flex-1 basis-28 rounded-lg border px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">
        {value} {of && <span className="text-sm font-normal text-muted-foreground">{of}</span>}
      </div>
    </div>
  )

  return (
    <Dialog open onOpenChange={(next) => !next && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('today.close.title')}</DialogTitle>
          <DialogDescription className="tabular-nums">
            {longDay(data.day, language)} · {minuteClock(nowMinute)}
          </DialogDescription>
        </DialogHeader>

        <section className="flex flex-wrap gap-2.5">
          {stat(t('today.close.focused'), formatDuration(focusedSeconds, language))}
          {stat(t('today.close.completed'), String(data.done.length), planned === null ? undefined : t('today.close.of', { count: planned }))}
          {stat(t('today.close.adherence'), share === null ? '—' : `${share}%`)}
          {stat(
            t('today.close.onTime'),
            estimated.length === 0 ? '—' : String(inTime),
            estimated.length === 0 ? undefined : t('today.close.of', { count: estimated.length }),
          )}
        </section>

        {byList.length > 0 && (
          <section aria-labelledby="close-by-list" className="flex flex-col gap-2">
            <h3 id="close-by-list" className="text-sm font-semibold">
              {t('today.close.byList')}
            </h3>
            <div className="flex h-3 gap-0.5 overflow-hidden rounded-full">
              {byList.map((item) => (
                <div
                  key={item.id}
                  data-testid="list-share"
                  style={{ flexGrow: item.minutes, backgroundColor: `var(--chart-${item.color})` }}
                />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {byList.map((item) => (
                <li key={item.id} className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(--chart-${item.color})` }} />
                  {listName(item.id)} <span className="tabular-nums">{formatDuration(item.minutes * 60, language)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="close-open" className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2">
            <h3 id="close-open" className="text-sm font-semibold">
              {t('today.close.open')}
            </h3>
            <span className="text-xs text-muted-foreground">{t('today.close.openHint')}</span>
          </div>
          {open.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">{t('today.close.nothingOpen')}</p>
          ) : (
            <ul className="flex flex-col">
              {open.map((task) => (
                <li key={task.id} className="flex flex-wrap items-center gap-3 border-t py-2.5 first:border-t-0">
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `var(--chart-${task.list.color})` }} />
                  <div className="min-w-0 flex-1 basis-52">
                    <div className="truncate text-sm font-medium">{task.title}</div>
                    {task.days_late !== null && task.days_late >= POSTPONED_FROM ? (
                      <div className="text-xs text-amber-700 dark:text-amber-400">{t('today.close.postponed', { count: task.days_late })}</div>
                    ) : (
                      <div className="text-xs text-muted-foreground">
                        {[...(task.estimate_minutes === null ? [] : [formatDuration(task.estimate_minutes * 60, language)]), task.list.name].join(' · ')}
                      </div>
                    )}
                  </div>
                  <div role="group" aria-label={t('today.close.destination', { title: task.title })} className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
                    {DESTINATIONS.map((to) => {
                      // Clearing the day of an occurrence would end its series (D29): it only goes to tomorrow.
                      const endsSeries = task.series && to !== 'tomorrow'
                      return (
                        <button
                          key={to}
                          type="button"
                          aria-pressed={destinationOf(task.id) === to}
                          disabled={endsSeries}
                          title={endsSeries ? t('today.close.endsSeries') : undefined}
                          onClick={() => setDestinations((all) => ({ ...all, [task.id]: to }))}
                          className={cn(
                            'h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50',
                            destinationOf(task.id) === to && 'bg-background text-foreground shadow-sm',
                          )}
                        >
                          {t(`today.close.to.${to}`)}
                        </button>
                      )
                    })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-1.5">
          <Label htmlFor="close-note">
            {t('today.close.note')} <span className="font-normal text-muted-foreground">{t('today.close.optional')}</span>
          </Label>
          <textarea
            id="close-note"
            rows={3}
            maxLength={NOTE_MAX}
            value={note}
            placeholder={t('today.close.notePlaceholder')}
            onChange={(event) => setNote(event.target.value)}
            className="w-full resize-y rounded-md border bg-transparent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">{t('today.close.summary')}</h3>
            <Label className="inline-flex items-center gap-2 font-normal">
              <Checkbox checked={copy} onCheckedChange={(checked) => setCopy(checked === true)} />
              {t('today.close.copy')}
            </Label>
          </div>
          <pre data-testid="close-summary" className="rounded-md border bg-muted/40 px-3 py-2.5 font-mono text-xs leading-relaxed whitespace-pre-wrap">
            {summary}
          </pre>
        </section>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            {t('today.close.back')}
          </Button>
          <Button onClick={() => void confirm()} disabled={saving}>
            <Moon size={14} />
            {t('today.close.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
