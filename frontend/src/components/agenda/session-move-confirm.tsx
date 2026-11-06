import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { type PanelTimes } from '@/components/agenda/session-panel'
import { Button } from '@/components/ui/button'
import { clockTime } from '@/lib/agenda/format'
import { dayOf, findOverlap, zonedInstant } from '@/lib/agenda/layout'
import { sessionErrorMessage } from '@/lib/agenda/use-agenda'
import type { AgendaSession } from '@/types'

interface SessionMoveConfirmProps {
  /** The saved session, at its saved times. */
  session: AgendaSession
  /** The new times, not saved yet. */
  times: PanelTimes
  timezone: string
  now: Date
  /** The sessions shown on the agenda, to warn about an overlap (ADJ-07). */
  sessions: AgendaSession[]
  /** Drops the new times (ADJ-05). */
  onCancel: () => void
  /** Saves the new times; a rejection is the API error, shown in the panel (ADJ-04). */
  onSave: () => Promise<unknown>
}

/** `Wed, Nov 4` of a day, in the reader's language. */
function shortDate(day: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
}

/**
 * The confirmation of a block dragged or pulled to a new time (ADJ-01 to ADJ-07): the task (or `Intervalo`), the list,
 * `Novo horário — ainda não salvo` with the saved time struck through and the new one with its duration, the overlap
 * warning, `Cancelar` (or Esc) and `Salvar horário`.
 */
export function SessionMoveConfirm({ session, times, timezone, now, sessions, onCancel, onSave }: SessionMoveConfirmProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const title = session.kind === 'break' ? t('agenda.break') : (session.task_title ?? '')

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const oldStart = new Date(session.started_at)
  const oldEnd = new Date(session.ended_at ?? session.started_at)
  const oldWhen = `${shortDate(dayOf(oldStart, timezone), locale)} · ${t('agenda.range', {
    start: clockTime(oldStart, timezone),
    end: clockTime(oldEnd, timezone),
  })}`
  const startAt = zonedInstant(times.day, times.start, timezone)
  const endAt = zonedInstant(times.day, times.end, timezone)
  const seconds = Math.max(0, (endAt.getTime() - startAt.getTime()) / 1000)
  const newWhen = `${shortDate(dayOf(startAt, timezone), locale)} · ${t('agenda.range', {
    start: clockTime(startAt, timezone),
    end: clockTime(endAt, timezone),
  })} · ${formatDuration(seconds, locale)}`
  const overlap = findOverlap(sessions, startAt, endAt, now, session.id)

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await onSave()
    } catch (failure) {
      setError(sessionErrorMessage(failure, t))
    } finally {
      setSaving(false)
    }
  }

  return (
    <aside aria-labelledby="session-move-title" className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4 lg:w-80">
      <div className="flex flex-col gap-1">
        <h2 id="session-move-title" className="text-base font-semibold">
          {title}
        </h2>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(--chart-${session.list_color})` }} />
          {session.list_name}
        </p>
      </div>
      <div data-pending-time className="flex flex-col gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
        <p className="text-xs font-semibold text-primary">{t('agenda.moveConfirm.pending')}</p>
        <p className="flex flex-col gap-1 text-sm tabular-nums">
          <del className="text-muted-foreground">{oldWhen}</del>
          <span className="font-semibold">{newWhen}</span>
        </p>
      </div>
      {overlap && (
        <p role="status" className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {t('agenda.panel.overlap', {
            title: overlap.kind === 'break' ? t('agenda.break') : overlap.task_title,
            start: clockTime(overlap.started_at, timezone),
            end: overlap.ended_at === null ? t('agenda.now') : clockTime(overlap.ended_at, timezone),
          })}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        <Button type="button" disabled={saving} onClick={() => void save()}>
          {t('agenda.moveConfirm.save')}
        </Button>
      </div>
    </aside>
  )
}
