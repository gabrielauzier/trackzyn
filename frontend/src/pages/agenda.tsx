import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Plus, ZoomIn } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { DatePickerChip } from '@/components/agenda/date-picker-chip'
import { DayTimeline } from '@/components/agenda/day-timeline'
import { SessionGroupList } from '@/components/agenda/session-group-list'
import { SessionDetails, SessionPanel, type PanelTimes } from '@/components/agenda/session-panel'
import { WeekGrid } from '@/components/agenda/week-grid'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/contexts/workspace-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { lists, sessions as sessionsApi } from '@/lib/api'
import { isHiddenSession } from '@/lib/agenda/hide'
import { addDays, dayLimit, dayOf, minuteOf, mondayOf, newSessionTimes, weekDays, zonedInstant } from '@/lib/agenda/layout'
import { agendaKey, useAgenda } from '@/lib/agenda/use-agenda'
import { useGridDrag, type Draft } from '@/lib/agenda/use-grid-drag'
import { ZOOMS, type Zoom, pxPerMinuteAt, readZoom, saveZoom } from '@/lib/agenda/zoom'
import { cn } from '@/lib/utils'
import type { AgendaSession, AgendaSessionChanges, ListCard } from '@/types'

const ALL_LISTS = 'all'

/** The clock of the grid: the open session, the now line and the hatched time move with it. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}

/** `2 – 8 de novembro de 2026`, or `26 de outubro – 1 de novembro de 2026` across months (AGENDA-08). */
function weekLabel(monday: string, locale: string): string {
  const at = (day: string) => new Date(`${day}T00:00:00Z`)
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).formatRange(
    at(monday),
    at(addDays(monday, 6)),
  )
}

/** The day of the grid column under `clientX`, so a block can move to another day (AGENDA-30). */
function columnDayAt(clientX: number): string | null {
  for (const column of document.querySelectorAll<HTMLElement>('[data-agenda-column]')) {
    const rect = column.getBoundingClientRect()
    if (rect.width > 0 && clientX >= rect.left && clientX < rect.right) return column.dataset.agendaColumn ?? null
  }
  return null
}

/** The day and times of a session, as the panel edits them. */
function sessionTimes(session: AgendaSession, timezone: string): PanelTimes {
  const start = new Date(session.started_at)
  const minute = minuteOf(start, timezone)
  const length = Math.round((Date.parse(session.ended_at ?? session.started_at) - start.getTime()) / 60_000)
  return { day: dayOf(start, timezone), start: minute, end: minute + length }
}

function Agenda({ timezone, activeLists }: { timezone: string; activeLists: ListCard[] }) {
  const { t, i18n } = useTranslation()
  const { canWrite, current } = useWorkspace()
  // The workspace minimum hides short sessions from the grid and the panel, not from the totals (HIDE-11, HIDE-14).
  const minSessionMinutes = current?.min_session_minutes ?? null
  const hidden = useCallback((session: AgendaSession) => isHiddenSession(session, minSessionMinutes), [minSessionMinutes])
  // Near sessions of one list and kind are drawn as one block (MERGE-11, MERGE-24).
  const joinGap = current?.merge_gap_minutes ?? null
  const now = useNow()
  const today = dayOf(now, timezone)
  /** The day the agenda is on; the week shown is the one that holds it. */
  const [day, setDay] = useState(today)
  const monday = mondayOf(day)
  const [listId, setListId] = useState<string | null>(null)
  const [chosenView, setView] = useState<'week' | 'day'>('week')
  // The last zoom picked on this device, 3x the first time.
  const [zoom, setZoom] = useState<Zoom>(readZoom)
  const pickZoom = (next: Zoom) => {
    setZoom(next)
    saveZoom(next)
  }
  const pxPerMinute = pxPerMinuteAt(zoom)
  // Below 768 px the agenda shows one day at a time (AGENDA-36).
  const narrow = useIsMobile()
  const view = narrow ? 'day' : chosenView
  const days = useMemo(() => weekDays(monday), [monday])
  const sunday = addDays(monday, 6)
  const { query, create, update, remove } = useAgenda({ from: monday, to: sunday, listId })
  const sessions = useMemo(() => query.data?.sessions ?? [], [query.data])
  // An overlap is with any other session of the user, whatever the list filter (AGENDA-19).
  const everyList = useQuery({
    queryKey: agendaKey({ from: monday, to: sunday, listId: null }),
    queryFn: () => sessionsApi.list({ from: monday, to: sunday }),
    retry: false,
  })
  // The overlap warning only names sessions the agenda shows (HIDE-15).
  const overlapping = (everyList.data?.sessions ?? sessions).filter((session) => !hidden(session))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  /** The times of the selected session while it is edited; null shows its details. */
  const [editTimes, setEditTimes] = useState<PanelTimes | null>(null)
  // A deleted session leaves the agenda, and its panel closes with it (AGENDA-32), as does one saved shorter
  // than the workspace minimum (HIDE-17).
  const selected = sessions.find((session) => session.id === selectedId && !hidden(session)) ?? null
  /** The sessions of the joined block clicked last (MERGE-27); a session chosen from it keeps it for the way back. */
  const [groupIds, setGroupIds] = useState<string[] | null>(null)
  const group = groupIds ? sessions.filter((session) => groupIds.includes(session.id) && !hidden(session)) : []

  const closeSelected = () => {
    setSelectedId(null)
    setEditTimes(null)
    setGroupIds(null)
  }

  /** A released handle or block saves its new times (AGENDA-29, AGENDA-30); a new draft waits for the panel. */
  const commit = (final: Draft) => {
    if (final.sessionId === null) return
    const at = (minute: number) => zonedInstant(final.day, minute, timezone).toISOString()
    const changes: AgendaSessionChanges =
      final.mode === 'top'
        ? { started_at: at(final.start) }
        : final.mode === 'bottom'
          ? { ended_at: at(final.end) }
          : { started_at: at(final.start), ended_at: at(final.end) }
    update.mutate({ id: final.sessionId, changes })
  }
  const drag = useGridDrag({
    pxPerMinute,
    limit: (day) => dayLimit(day, now, timezone),
    dayAt: columnDayAt,
    onCommit: commit,
  })
  const draft = drag.draft !== null && drag.draft.sessionId === null ? drag.draft : null

  /** Another week closes the panel without recording (AGENDA-47). */
  const goTo = (next: string) => {
    if (mondayOf(next) !== monday) {
      drag.setDraft(null)
      closeSelected()
    }
    setDay(next)
  }

  /** `Nova sessão` on `on`, with the times of now (AGENDA-15, AGENDA-43). */
  const openNew = (on: string = today) => {
    closeSelected()
    const { start, end } = newSessionTimes(now, timezone)
    setDay(on)
    drag.setDraft({ mode: 'create', day: on, start, end, sessionId: null })
  }

  const changeTimes = (times: PanelTimes) => {
    setDay(times.day)
    drag.setDraft({ mode: 'create', ...times, sessionId: null })
  }

  const select = (session: AgendaSession) => {
    drag.setDraft(null)
    setEditTimes(null)
    setGroupIds(null)
    setSelectedId(session.id)
  }

  /** A click on a joined block lists its sessions (MERGE-27). */
  const selectGroup = (members: AgendaSession[]) => {
    drag.setDraft(null)
    setEditTimes(null)
    setSelectedId(null)
    setGroupIds(members.map((member) => member.id))
  }

  /** A session chosen from the list opens alone, out of the block, with its handles (MERGE-28, MERGE-29). */
  const pickFromGroup = (session: AgendaSession) => {
    setEditTimes(null)
    setSelectedId(session.id)
  }

  // While a session is chosen the selection is that session; the block is selected only while its list shows.
  const joining = { joinGap, apartId: selected?.id ?? null, onSelectGroup: selectGroup, selectedGroup: selected ? null : groupIds }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {/* The week opens on the chosen day's week, the day view on the day itself (AGENDA-40, AGENDA-41). */}
        <DatePickerChip today={today} shown={day} onPick={goTo} />
        {view === 'week' && (
          <>
            <div className="flex items-center">
              <Button type="button" variant="ghost" size="icon" aria-label={t('agenda.previousWeek')} onClick={() => goTo(addDays(monday, -7))}>
                <ChevronLeft size={16} />
              </Button>
              <Button type="button" variant="ghost" size="icon" aria-label={t('agenda.nextWeek')} onClick={() => goTo(addDays(monday, 7))}>
                <ChevronRight size={16} />
              </Button>
            </div>
            <h2 className="text-base font-semibold" aria-live="polite">
              {weekLabel(monday, i18n.language)}
            </h2>
          </>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Select value={listId ?? ALL_LISTS} onValueChange={(value) => setListId(value === ALL_LISTS ? null : value)}>
            <SelectTrigger size="sm" aria-label={t('agenda.list')} className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_LISTS}>{t('agenda.allLists')}</SelectItem>
              {activeLists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!narrow && (
            <div role="group" aria-label={t('agenda.view')} className="flex rounded-lg bg-muted p-0.5">
              {(['day', 'week'] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={view === option}
                  className={cn(
                    'rounded-md px-3 py-1 text-sm font-medium',
                    view === option ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                  onClick={() => setView(option)}
                >
                  {t(`agenda.${option}`)}
                </button>
              ))}
            </div>
          )}
          <div role="group" aria-label={t('agenda.zoom')} className="flex items-center rounded-lg bg-muted p-0.5">
            <ZoomIn size={14} className="mx-1.5 text-muted-foreground" aria-hidden />
            {ZOOMS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={zoom === option}
                className={cn(
                  'rounded-md px-2.5 py-1 text-sm font-medium tabular-nums',
                  zoom === option ? 'bg-background shadow-sm' : 'text-muted-foreground',
                )}
                onClick={() => pickZoom(option)}
              >
                {t('agenda.zoomLevel', { level: option })}
              </button>
            ))}
          </div>
          {/* The day view has its own + button. */}
          {canWrite && view === 'week' && (
            <Button type="button" size="sm" onClick={() => openNew()}>
              <Plus size={14} />
              {t('agenda.newSession')}
            </Button>
          )}
        </div>
      </div>

      {query.isError ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border py-16 text-center">
          <p className="text-sm text-destructive">{t('agenda.loadError')}</p>
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('agenda.retry')}
          </Button>
        </div>
      ) : query.data === undefined ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {view === 'week' ? (
              <WeekGrid
                days={days}
                sessions={sessions}
                timezone={timezone}
                now={now}
                drag={canWrite ? drag : undefined}
                selectedId={selected?.id ?? null}
                onSelect={select}
                pxPerMinute={pxPerMinute}
                hidden={hidden}
                {...joining}
              />
            ) : (
              <DayTimeline
                day={day}
                sessions={sessions}
                timezone={timezone}
                now={now}
                onPickDay={goTo}
                // Another week opens on its Monday (AGENDA-38).
                onWeek={(direction) => goTo(addDays(monday, 7 * direction))}
                onNew={canWrite ? () => openNew(day) : undefined}
                selectedId={selected?.id ?? null}
                onSelect={select}
                pxPerMinute={pxPerMinute}
                hidden={hidden}
                {...joining}
              />
            )}
          </div>
          {canWrite && draft && (
            <SessionPanel
              times={{ day: draft.day, start: draft.start, end: draft.end }}
              onTimesChange={changeTimes}
              timezone={timezone}
              now={now}
              sessions={overlapping}
              defaultListId={listId ?? activeLists[0]?.id ?? null}
              onCancel={() => drag.setDraft(null)}
              onSave={async (input, preview) => {
                await create.mutateAsync({ input, preview })
                drag.setDraft(null)
              }}
            />
          )}
          {!draft && selected && editTimes && canWrite && (
            <SessionPanel
              key={selected.id}
              editing={selected}
              times={editTimes}
              onTimesChange={setEditTimes}
              timezone={timezone}
              now={now}
              sessions={overlapping}
              defaultListId={selected.list_id}
              onCancel={() => setEditTimes(null)}
              onSave={async (input) => {
                const { started_at, ended_at } = input
                const changes: AgendaSessionChanges =
                  input.kind === 'task' ? { started_at, ended_at, task_id: input.task_id } : { started_at, ended_at, list_id: input.list_id }
                // The panel shows a refusal itself (AGENDA-31).
                await update.mutateAsync({ id: selected.id, changes, quiet: true })
                // A session chosen from a joined block goes back into it once saved (MERGE-31).
                if (groupIds) closeSelected()
                else setEditTimes(null)
              }}
            />
          )}
          {!draft && selected && !editTimes && (
            <SessionDetails
              key={selected.id}
              session={selected}
              timezone={timezone}
              now={now}
              onClose={closeSelected}
              onEdit={canWrite ? () => setEditTimes(sessionTimes(selected, timezone)) : undefined}
              onDelete={
                canWrite
                  ? () =>
                      // The panel closes with the session, not back to its block (MERGE-31); a failed delete
                      // brings the session back still chosen from its block (MERGE-33).
                      remove.mutate(selected.id, { onSuccess: () => setGroupIds(null) })
                  : undefined
              }
              onBack={groupIds ? () => setSelectedId(null) : undefined}
              groupCount={group.length}
            />
          )}
          {/* While a delete is on its way the chosen session is gone from the list: no flash of the block's list. */}
          {!draft && !selected && group.length > 0 && !remove.isPending && (
            <SessionGroupList sessions={group} timezone={timezone} onPick={pickFromGroup} onClose={closeSelected} />
          )}
        </div>
      )}
    </div>
  )
}

/** `/agenda`: the logged-in user's own sessions of the week (AGENDA-01, AGENDA-10). */
export default function AgendaPage() {
  const { t } = useTranslation()
  const { current } = useWorkspace()
  // The lists answer carries the workspace day timezone, which decides the days and midnight (AD-004).
  const active = useQuery({ queryKey: ['lists', { archived: false }], queryFn: () => lists.list({ archived: false }) })

  return (
    <div>
      <PageHeader section={current?.name ?? ''} title={t('nav.agenda')} />
      {active.data ? (
        <Agenda timezone={active.data.timezone} activeLists={active.data.lists} />
      ) : active.isError ? (
        <p className="py-12 text-center text-sm text-destructive">{t('agenda.loadError')}</p>
      ) : (
        <Skeleton className="h-96 w-full rounded-xl" />
      )}
    </div>
  )
}
