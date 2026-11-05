import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { clockTime } from '@/lib/agenda/format'
import { dayOf } from '@/lib/agenda/layout'
import type { AgendaSession } from '@/types'

interface SessionGroupListProps {
  /** The sessions of the joined block; they read in start order whatever order they come in. */
  sessions: AgendaSession[]
  timezone: string
  /** A session was chosen: its details open (MERGE-28). */
  onPick: (session: AgendaSession) => void
  /** A session hovered or focused in the list, to draw it out of its block on the grid; null when it leaves. */
  onPreview?: (session: AgendaSession | null) => void
  onClose: () => void
}

/**
 * The panel of a joined block (MERGE-27): `<lista> · N sessões`, the day and the span of the block, how to pick a
 * session, and one button per session with its title (or `Intervalo`), where it was recorded, `HH:MM – HH:MM` and
 * its duration. Hovering or focusing a session draws it out of its block on the grid.
 */
export function SessionGroupList({ sessions, timezone, onPick, onPreview, onClose }: SessionGroupListProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const ordered = [...sessions].sort((a, b) => Date.parse(a.started_at) - Date.parse(b.started_at))
  const first = ordered[0]

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!first) return null
  // The members of a joined block are closed sessions, so each has an end.
  const lastEnd = Math.max(...ordered.map((session) => Date.parse(session.ended_at!)))
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${dayOf(new Date(first.started_at), timezone)}T00:00:00Z`),
  )
  const range = (start: string | number, end: string | number) =>
    t('agenda.range', { start: clockTime(new Date(start), timezone), end: clockTime(new Date(end), timezone) })

  return (
    <aside aria-labelledby="session-group-title" className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 lg:w-80">
      <div className="flex flex-col gap-1">
        <h2 id="session-group-title" className="flex items-center gap-1.5 text-base font-semibold">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(--chart-${first.list_color})` }} />
          {`${first.list_name} · ${t('agenda.sessionCount', { count: ordered.length })}`}
        </h2>
        <p className="text-sm tabular-nums">{`${date} · ${range(first.started_at, lastEnd)}`}</p>
      </div>
      <p className="text-sm text-muted-foreground">{t('agenda.panel.pickHint')}</p>
      <ul className="flex flex-col gap-1.5">
        {ordered.map((session) => {
          const seconds = Math.max(0, Math.floor((Date.parse(session.ended_at!) - Date.parse(session.started_at)) / 1000))
          return (
            <li key={session.id}>
              <button
                type="button"
                className="flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => onPick(session)}
                // Only the grid changes: the session is drawn alone, without opening it.
                onMouseEnter={() => onPreview?.(session)}
                onMouseLeave={() => onPreview?.(null)}
                onFocus={() => onPreview?.(session)}
                onBlur={() => onPreview?.(null)}
              >
                <span className="text-sm font-medium">{session.kind === 'break' ? t('agenda.break') : (session.task_title ?? '')}</span>
                <span className="text-xs text-muted-foreground">{t(`agenda.panel.origin.${session.origin}`)}</span>
                <span className="text-xs tabular-nums">{`${range(session.started_at, session.ended_at!)} · ${formatDuration(seconds, locale)}`}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <div className="flex justify-end">
        <Button type="button" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </aside>
  )
}
