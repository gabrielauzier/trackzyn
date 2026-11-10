import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CalendarCheck, ChevronLeft, ChevronRight, Clock, Plus } from 'lucide-react'

import { PageHeader } from '@/components/page-header'
import { TaskDialog } from '@/components/board/task-dialog'
import { DatePickerChip } from '@/components/agenda/date-picker-chip'
import { DayScheduledPanel } from '@/components/agenda/day-scheduled-panel'
import { DayTimeline } from '@/components/agenda/day-timeline'
import { NewSchedulePanel } from '@/components/agenda/new-schedule-panel'
import { PlannedBreakPanel } from '@/components/agenda/planned-break-panel'
import { SessionGroupList } from '@/components/agenda/session-group-list'
import { ScheduledMoveConfirm } from '@/components/agenda/scheduled-move-confirm'
import { SessionMoveConfirm } from '@/components/agenda/session-move-confirm'
import { SessionDetails, SessionPanel, type PanelTimes } from '@/components/agenda/session-panel'
import { AgendaViewMenu } from '@/components/agenda/view-menu'
import { WeekGrid } from '@/components/agenda/week-grid'
import { SeriesScopeDialog } from '@/components/schedule/series-scope-dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/contexts/workspace-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { lists, plans as plansApi, sessions as sessionsApi, tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { dropZoneAt } from '@/lib/agenda/drop-zone'
import { isHiddenSession } from '@/lib/agenda/hide'
import { readHideBreaks, readHideScheduled, saveHideBreaks, saveHideScheduled } from '@/lib/agenda/hide-breaks'
import { addDays, dayLimit, dayOf, minuteOf, mondayOf, newSessionTimes, weekDays, zonedInstant } from '@/lib/agenda/layout'
import { agendaKey, useAgenda } from '@/lib/agenda/use-agenda'
import { useScheduled } from '@/lib/agenda/use-scheduled'
import { useGridDrag, type Draft, type ScheduledDrop } from '@/lib/agenda/use-grid-drag'
import { type WeekDay, readShownDays, saveShownDays } from '@/lib/agenda/week-days'
import { type Zoom, pxPerMinuteAt, readZoom, saveZoom } from '@/lib/agenda/zoom'
import { tomorrowPath } from '@/lib/plan/tomorrow'
import { asksSeriesScope, longDay, type ScheduleChangeFields } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import type { AgendaSession, AgendaSessionChanges, ListCard, PlannedBlock, ProjectedOccurrence, ScheduledTask, SeriesScope, TaskSchedule } from '@/types'

const ALL_LISTS = 'all'

const NO_PLAN: PlannedBlock[] = []

type PlannedBreak = Extract<PlannedBlock, { kind: 'break' }>

/** Nothing scheduled, the same arrays on every render: `Exibir agendamentos` off. */
const NO_SCHEDULED: ScheduledTask[] = []
const NO_PROJECTED: ProjectedOccurrence[] = []

/** A change of the schedule of a task from the agenda, with the estimate a drop from `Sem hora` gives (D22). */
type ScheduleChange = ScheduleChangeFields & { estimate_minutes?: number | null }

/** A drop to save: the change, and what `Desfazer` puts back (US-14). */
interface PendingDrop {
  id: string
  change: ScheduleChange
  undo: ScheduleChange
}

/** A drop waiting for `Salvar horário`: the task as saved and where it was released (D35). */
interface ConfirmingDrop extends PendingDrop {
  task: ScheduledTask
  schedule: TaskSchedule
}

/** The clock of the grid: the open session and the now line move with it. */
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

function Agenda({ timezone, activeLists, title }: { timezone: string; activeLists: ListCard[]; title: ReactNode }) {
  /** The page's header: the grid and the side panel take what is left of the window under it (AGENDA-02). */
  const header = useRef<HTMLDivElement>(null)
  const [headerHeight, setHeaderHeight] = useState(0)
  useLayoutEffect(() => {
    const node = header.current
    if (!node) return
    const measure = () => setHeaderHeight(node.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const { t, i18n } = useTranslation()
  const { canWrite, current } = useWorkspace()
  // The workspace minimum hides short sessions from the grid and the panel, not from the totals (HIDE-11, HIDE-14).
  const minSessionMinutes = current?.min_session_minutes ?? null
  // `Ocultar intervalos`, remembered on this device, hides the breaks the same way (ADJ-22, ADJ-23).
  const [hideBreaks, setHideBreaks] = useState(readHideBreaks)
  const pickHideBreaks = (next: boolean) => {
    setHideBreaks(next)
    saveHideBreaks(next)
  }
  /** `Exibir agendamentos` off: the scheduled tasks and the planned tasks leave the grid, remembered on this device. */
  const [hideScheduled, setHideScheduled] = useState(readHideScheduled)
  const pickHideScheduled = (next: boolean) => {
    setHideScheduled(next)
    saveHideScheduled(next)
  }
  const hidden = useCallback(
    (session: AgendaSession) => (hideBreaks && session.kind === 'break') || isHiddenSession(session, minSessionMinutes),
    [hideBreaks, minSessionMinutes],
  )
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
  // The week days this device chose to show; the week view draws only those (DAYS-09, DAYS-15).
  const [shownDays, setShownDays] = useState<WeekDay[]>(readShownDays)
  const pickDays = (next: WeekDay[]) => {
    setShownDays(next)
    saveShownDays(next)
  }
  const visibleDays = useMemo(() => days.filter((_, index) => shownDays.includes(index as WeekDay)), [days, shownDays])
  const sunday = addDays(monday, 6)
  const { query, create, update, remove } = useAgenda({ from: monday, to: sunday, listId })
  const sessions = useMemo(() => query.data?.sessions ?? [], [query.data])
  // The scheduled tasks of the whole workspace (D9), and the task a click on one opens (US-5).
  const scheduled = useScheduled(monday, sunday)
  const { projected } = scheduled
  /** A scheduled task dropped at a new day or time, shown there until it is saved or cancelled (D35). */
  const [confirming, setConfirming] = useState<ConfirmingDrop | null>(null)
  const { timed, untimed } = useMemo(() => {
    if (!confirming) return scheduled
    const others = (list: ScheduledTask[]) => list.filter((item) => item.id !== confirming.id)
    const { change, task } = confirming
    const moved: ScheduledTask = {
      ...task,
      scheduled_on: change.scheduled_on ?? task.scheduled_on,
      scheduled_time: change.scheduled_time === undefined ? task.scheduled_time : change.scheduled_time,
      estimate_minutes: change.estimate_minutes === undefined ? task.estimate_minutes : change.estimate_minutes,
    }
    return moved.scheduled_time === null
      ? { timed: others(scheduled.timed), untimed: [...others(scheduled.untimed), moved] }
      : { timed: [...others(scheduled.timed), moved], untimed: others(scheduled.untimed) }
  }, [scheduled, confirming])
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  /** The day whose scheduled tasks show in the place of the side panel, from `+X` of the `Sem hora` row (US-14). */
  const [dayPanel, setDayPanel] = useState<string | null>(null)
  /** `Novo agendamento`: a window selected from now on, or the day of the toolbar button without a time (US-8). */
  const [scheduling, setScheduling] = useState<{ day: string; window: { start: number; end: number } | null } | null>(null)
  /** A drop of an occurrence of a series, waiting for `Só esta` or `Esta e as próximas` (US-12). */
  const [scoping, setScoping] = useState<PendingDrop | null>(null)
  const showDay = (shown: string) => {
    closeSelected()
    drag.setDraft(null)
    setScheduling(null)
    setDayPanel(shown)
  }
  const scheduledProps = hideScheduled
    ? { timed: NO_SCHEDULED, untimed: NO_SCHEDULED, projected: NO_PROJECTED, onOpenTask: setOpenTaskId, onShowDay: showDay }
    : { timed, untimed, projected, onOpenTask: setOpenTaskId, onShowDay: showDay }
  const navigate = useNavigate()
  // The blocks of the user's own saved plans of the week, without done tasks (PLAN-24, PLAN-39). Under `['lists']`, as
  // the scheduled tasks: completing a task anywhere, or saving a plan, reads them again.
  const plannedQuery = useQuery({
    queryKey: ['lists', 'plans', current?.id ?? null, monday, sunday],
    queryFn: () => plansApi.planned(monday, sunday),
    placeholderData: keepPreviousData,
    retry: false,
  })
  const planned = plannedQuery.data?.blocks ?? NO_PLAN
  /** A planned task opens the plan of its day (PLAN-29); a planned break, its panel. */
  const openPlanned = (block: PlannedBlock) => {
    if (block.kind === 'task') return navigate(`/planejar/${block.day}`)
    closeSelected()
    drag.setDraft(null)
    setDayPanel(null)
    setScheduling(null)
    setPlannedBreak(block)
  }
  // `Exibir agendamentos` off hides the planned tasks; `Exibir intervalos` off, the planned breaks.
  const shownPlanned = useMemo(
    () => (hideScheduled || hideBreaks ? planned.filter((block) => (block.kind === 'task' ? !hideScheduled : !hideBreaks)) : planned),
    [planned, hideScheduled, hideBreaks],
  )
  const plannedProps = {
    planned: shownPlanned,
    onOpenPlanned: openPlanned,
    // `Planejar dia` in the header of a day (PLAN-31).
    onPlanDay: (shown: string) => navigate(`/planejar/${shown}`),
  }
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
  /** The session hovered in the list of a joined block, drawn out of it while the list shows. */
  const [previewId, setPreviewId] = useState<string | null>(null)
  const previewing = !selected && group.some((session) => session.id === previewId) ? previewId : null
  /** The planned break whose panel shows; on today's plan it leads to the focus of its list (PLAN-28). */
  const [plannedBreak, setPlannedBreak] = useState<PlannedBreak | null>(null)

  const closeSelected = () => {
    setPlannedBreak(null)
    setSelectedId(null)
    setPreviewId(null)
    setEditTimes(null)
    setGroupIds(null)
  }

  /**
   * A saved block released at a new time waits for the panel (ADJ-01): its draft stays on the grid, the session is
   * chosen, and an open `Editar` form takes the new times instead (ADJ-08). A new session's draft waits for its panel.
   */
  const commit = (final: Draft) => {
    setPlannedBreak(null)
    if (final.sessionId === null) {
      // A window that begins at now or later schedules a task; before now, it records a session (US-8, D10).
      setDayPanel(null)
      const window = { start: final.start, end: final.end }
      if (final.mode === 'create') setScheduling(final.start >= dayLimit(final.day, now, timezone) ? { day: final.day, window } : null)
      else if (scheduling?.window) setScheduling({ day: final.day, window })
      return
    }
    setDayPanel(null)
    setScheduling(null)
    const times = { day: final.day, start: final.start, end: final.end }
    setEditTimes(editTimes !== null && selectedId === final.sessionId ? times : null)
    if (groupIds && !groupIds.includes(final.sessionId)) setGroupIds(null)
    setSelectedId(final.sessionId)
  }
  const queryClient = useQueryClient()
  const saveDrop = useMutation({
    mutationFn: ({ id, change, scope }: { id: string; change: ScheduleChange; scope?: SeriesScope }) =>
      tasksApi.update(id, scope === undefined ? change : { ...change, scope }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['lists'] }),
    onError: (error) => toast.error(extractApiError(error, t('common.error'))),
  })
  /** Saves a drop and offers `Desfazer`, which puts the day, the time and the estimate back (US-14). */
  const saveMove = ({ id, change, undo }: PendingDrop, scope?: SeriesScope) =>
    saveDrop.mutate(
      { id, change, scope },
      {
        onSuccess: () => {
          const shown = longDay(change.scheduled_on!, t, i18n.language)
          const text = change.scheduled_time
            ? t('agenda.drop.scheduledAt', { day: shown, time: change.scheduled_time })
            : t('agenda.drop.scheduledOn', { day: shown })
          toast.success(text, { action: { label: t('agenda.drop.undo'), onClick: () => saveDrop.mutate({ id, change: undo, scope }) } })
        },
      },
    )
  /** A scheduled task released at a new day or time (US-6, US-14); an occurrence of a series asks first (US-12). */
  const drop = ({ taskId, day, time, from }: ScheduledDrop) => {
    // The pending block dragged again still moves from its saved place: `timed` and `untimed` already show the preview (D35).
    const prior = confirming?.id === taskId ? confirming : null
    const task = prior?.task ?? [...timed, ...untimed].find((item) => item.id === taskId)
    if (!task) return
    const origin = prior ? { day: task.scheduled_on, time: task.scheduled_time } : from
    const change: ScheduleChange = { scheduled_on: day, scheduled_time: time }
    const undo: ScheduleChange = { scheduled_on: origin.day, scheduled_time: origin.time }
    // From `Sem hora` to the grid, a task without an estimate takes 1h (D22).
    if (origin.time === null && time !== null && task.estimate_minutes === null) {
      change.estimate_minutes = 60
      undo.estimate_minutes = null
    }
    const schedule = { scheduled_on: task.scheduled_on, scheduled_time: task.scheduled_time, series: task.series && { ...task.series, next_on: null } }
    // Nothing is saved before `Salvar horário`, as a moved session (D35).
    closeSelected()
    setDayPanel(null)
    setScheduling(null)
    setConfirming({ id: taskId, change, undo, task, schedule })
  }
  /** `Salvar horário`: an occurrence of a series still asks `Só esta` or `Esta e as próximas` (US-12). */
  const confirmMove = () => {
    if (!confirming) return
    const { id, change, undo, schedule } = confirming
    setConfirming(null)
    if (asksSeriesScope(schedule, change)) setScoping({ id, change, undo })
    else saveMove({ id, change, undo })
  }
  const drag = useGridDrag({
    pxPerMinute,
    limit: (day) => dayLimit(day, now, timezone),
    dayAt: columnDayAt,
    onCommit: commit,
    onScheduledDrop: drop,
    zoneAt: dropZoneAt,
    scheduleAfterNow: true,
  })
  /** The view options in the corner of the grid: the week days in the week view only, and the zoom (DAYS-01, DAYS-02). */
  const viewMenu = (
    <AgendaViewMenu
      days={shownDays}
      showDays={view === 'week'}
      zoom={zoom}
      hideBreaks={hideBreaks}
      hideScheduled={hideScheduled}
      onDaysChange={pickDays}
      onZoomChange={pickZoom}
      onHideBreaksChange={pickHideBreaks}
      onHideScheduledChange={pickHideScheduled}
    />
  )
  const draft = drag.draft !== null && drag.draft.sessionId === null ? drag.draft : null
  /** The new time of the chosen session, not saved yet (ADJ-01). */
  const pending =
    drag.draft !== null && !drag.dragging && selected !== null && drag.draft.sessionId === selected.id ? drag.draft : null

  /** Another week closes the panel without recording (AGENDA-47). */
  const goTo = (next: string) => {
    if (mondayOf(next) !== monday) {
      drag.setDraft(null)
      closeSelected()
      setScheduling(null)
    }
    setDay(next)
  }

  /** `Nova sessão` on `on`, with the times of now (AGENDA-15, AGENDA-43). */
  const openNew = (on: string = today) => {
    closeSelected()
    setDayPanel(null)
    setScheduling(null)
    const { start, end } = newSessionTimes(now, timezone)
    setDay(on)
    drag.setDraft({ mode: 'create', day: on, start, end, sessionId: null })
  }

  const changeTimes = (times: PanelTimes) => {
    setDay(times.day)
    drag.setDraft({ mode: 'create', ...times, sessionId: null })
  }

  /** `Agendar` in the toolbar: `Novo agendamento` on today, or on the day shown in the day view, without a time (US-8). */
  const openSchedule = () => {
    closeSelected()
    drag.setDraft(null)
    setDayPanel(null)
    setScheduling({ day: view === 'day' && day >= today ? day : today, window: null })
  }

  const select = (session: AgendaSession) => {
    // A click on the block whose new time is pending keeps it; another block drops it (ADJ-06).
    if (pending && session.id === pending.sessionId) return
    setPlannedBreak(null)
    setDayPanel(null)
    setScheduling(null)
    drag.setDraft(null)
    setEditTimes(null)
    setGroupIds(null)
    setSelectedId(session.id)
  }

  /** A click on a joined block lists its sessions (MERGE-27). */
  const selectGroup = (members: AgendaSession[]) => {
    setPlannedBreak(null)
    setDayPanel(null)
    setScheduling(null)
    drag.setDraft(null)
    setPreviewId(null)
    setEditTimes(null)
    setSelectedId(null)
    setGroupIds(members.map((member) => member.id))
  }

  /** A session chosen from the list opens alone, out of the block, with its handles (MERGE-28, MERGE-29). */
  const pickFromGroup = (session: AgendaSession) => {
    setEditTimes(null)
    setPreviewId(null)
    setSelectedId(session.id)
  }

  // While a session is chosen the selection is that session; the block is selected only while its list shows.
  // The session hovered in the list of a joined block takes the selection off the rest of the block.
  const joining = {
    joinGap,
    apartId: selected?.id ?? previewing,
    onSelectGroup: selectGroup,
    selectedGroup: selected || previewing ? null : groupIds,
    previewId: previewing,
  }

  return (
    <div className="flex flex-col gap-4" style={{ '--agenda-header': `${headerHeight}px` } as CSSProperties}>
      {/* One line: the page title, then the toolbar. Its height leaves the rest of the window to the grid (AGENDA-02). */}
      <div ref={header} data-slot="agenda-header" className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {title}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
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
            {/* The plan of tomorrow in the workspace timezone (PLAN-01). */}
            {/* Below 1536 px only the icon, so the title and the toolbar fit one line (AGENDA-02). */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-label={t('plan.agenda.planTomorrow')}
              title={t('plan.agenda.planTomorrow')}
              onClick={() => navigate(tomorrowPath(timezone, now))}
            >
              <CalendarCheck size={14} />
              <span className="hidden 2xl:inline">{t('plan.agenda.planTomorrow')}</span>
            </Button>
            {/* Secondary, before `Nova sessão`; off for a viewer (US-8). */}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canWrite}
              aria-label={t('agenda.schedule')}
              title={t('agenda.schedule')}
              onClick={openSchedule}
            >
              <Clock size={14} />
              <span className="hidden 2xl:inline">{t('agenda.schedule')}</span>
            </Button>
            {/* From 768 px in both views; below, the day view has its round + button (ADJ-19). */}
            {canWrite && !narrow && (
              <Button type="button" size="sm" onClick={() => openNew()}>
                <Plus size={14} />
                {t('agenda.newSession')}
              </Button>
            )}
          </div>
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
                days={visibleDays}
                corner={viewMenu}
                sessions={sessions}
                timezone={timezone}
                now={now}
                drag={canWrite ? drag : undefined}
                selectedId={selected?.id ?? null}
                onSelect={select}
                pxPerMinute={pxPerMinute}
                hidden={hidden}
                {...joining}
                {...scheduledProps}
                {...plannedProps}
              />
            ) : (
              <DayTimeline
                corner={viewMenu}
                day={day}
                sessions={sessions}
                timezone={timezone}
                now={now}
                onPickDay={goTo}
                // Another week opens on its Monday (AGENDA-38).
                onWeek={(direction) => goTo(addDays(monday, 7 * direction))}
                onNew={canWrite && narrow ? () => openNew(day) : undefined}
                // The touch scrolls the timeline below 768 px: the gestures are for the mouse (ADJ-19).
                drag={canWrite && !narrow ? drag : undefined}
                selectedId={selected?.id ?? null}
                onSelect={select}
                pxPerMinute={pxPerMinute}
                hidden={hidden}
                {...joining}
                {...scheduledProps}
                {...plannedProps}
              />
            )}
          </div>
          {/* The open panel fits what is left of the window, as the grid does, and scrolls inside when taller. */}
          <div data-slot="agenda-panels" className="empty:hidden lg:max-h-[calc(100dvh-var(--agenda-header)-4rem)] lg:overflow-y-auto">
            {confirming && (
              <ScheduledMoveConfirm
                key={confirming.id}
                task={confirming.task}
                to={{ day: confirming.change.scheduled_on!, time: confirming.change.scheduled_time ?? null }}
                minutes={(confirming.change.estimate_minutes ?? confirming.task.estimate_minutes) ?? 60}
                onCancel={() => setConfirming(null)}
                onSave={confirmMove}
              />
            )}
            {!confirming && plannedBreak && (
              <PlannedBreakPanel
                key={plannedBreak.id}
                block={plannedBreak}
                today={today}
                onClose={() => setPlannedBreak(null)}
              />
            )}
            {!confirming && !plannedBreak && dayPanel && (
              <DayScheduledPanel
                key={dayPanel}
                day={dayPanel}
                timeZone={timezone}
                canWrite={canWrite}
                now={now}
                onOpenTask={setOpenTaskId}
                onClose={() => setDayPanel(null)}
              />
            )}
            {!confirming && !plannedBreak && !dayPanel && canWrite && scheduling && (
              <NewSchedulePanel
                key={`${scheduling.day}:${scheduling.window?.start ?? ''}:${scheduling.window?.end ?? ''}`}
                day={scheduling.day}
                window={scheduling.window}
                timeZone={timezone}
                now={now}
                lists={activeLists}
                defaultListId={listId ?? activeLists[0]?.id ?? null}
                onCancel={() => {
                  setScheduling(null)
                  drag.setDraft(null)
                }}
                onSaved={() => {
                  setScheduling(null)
                  drag.setDraft(null)
                }}
              />
            )}
            {!confirming && !plannedBreak && !dayPanel && !scheduling && canWrite && draft && (
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
            {!confirming && !plannedBreak && !dayPanel && !scheduling && !draft && selected && editTimes && canWrite && (
              <SessionPanel
                key={selected.id}
                editing={selected}
                times={editTimes}
                // The block follows the fields until the form is saved or cancelled (ADJ-08).
                onTimesChange={(times) => {
                  setEditTimes(times)
                  drag.setDraft({ mode: 'move', ...times, sessionId: selected.id })
                }}
                timezone={timezone}
                now={now}
                sessions={overlapping}
                defaultListId={selected.list_id}
                onCancel={() => {
                  setEditTimes(null)
                  drag.setDraft(null)
                }}
                onSave={async (input) => {
                  const { started_at, ended_at } = input
                  const changes: AgendaSessionChanges =
                    input.kind === 'task' ? { started_at, ended_at, task_id: input.task_id } : { started_at, ended_at, list_id: input.list_id }
                  // The panel shows a refusal itself (AGENDA-31).
                  await update.mutateAsync({ id: selected.id, changes, quiet: true })
                  drag.setDraft(null)
                  // A session chosen from a joined block goes back into it once saved (MERGE-31).
                  if (groupIds) closeSelected()
                  else setEditTimes(null)
                }}
              />
            )}
            {!confirming && !plannedBreak && !dayPanel && !scheduling && !draft && selected && pending && !editTimes && canWrite && (
              <SessionMoveConfirm
                key={selected.id}
                session={selected}
                times={{ day: pending.day, start: pending.start, end: pending.end }}
                timezone={timezone}
                now={now}
                sessions={overlapping}
                onCancel={() => drag.setDraft(null)}
                onSave={async () => {
                  const at = (minute: number) => zonedInstant(pending.day, minute, timezone).toISOString()
                  const changes: AgendaSessionChanges =
                    pending.mode === 'top'
                      ? { started_at: at(pending.start) }
                      : pending.mode === 'bottom'
                        ? { ended_at: at(pending.end) }
                        : { started_at: at(pending.start), ended_at: at(pending.end) }
                  // The panel shows a refusal itself (ADJ-04); the block stays at the new time until the cache has it (ADJ-02).
                  await update.mutateAsync({ id: selected.id, changes, quiet: true })
                  drag.setDraft(null)
                  // A session chosen from a joined block goes back into it once saved (ADJ-09).
                  if (groupIds) closeSelected()
                }}
              />
            )}
            {!confirming && !plannedBreak && !dayPanel && !scheduling && !draft && selected && !editTimes && !pending && (
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
            {!confirming && !plannedBreak && !dayPanel && !scheduling && !draft && !selected && group.length > 0 && !remove.isPending && (
              <SessionGroupList
                sessions={group}
                timezone={timezone}
                onPick={pickFromGroup}
                onPreview={(session) => setPreviewId(session?.id ?? null)}
                onClose={closeSelected}
              />
            )}
          </div>
        </div>
      )}
      <SeriesScopeDialog
        open={scoping !== null}
        variant="move"
        onCancel={() => setScoping(null)}
        onChoose={(scope) => {
          if (scoping) saveMove(scoping, scope)
          setScoping(null)
        }}
      />
      <TaskDialog taskId={openTaskId} canWrite={canWrite} timeZone={timezone} onClose={() => setOpenTaskId(null)} />
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
      {active.data ? (
        <Agenda
          timezone={active.data.timezone}
          activeLists={active.data.lists}
          title={
            <div className="shrink-0">
              <p className="mb-0.5 text-xs font-medium text-muted-foreground">{current?.name ?? ''}</p>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('nav.agenda')}</h1>
            </div>
          }
        />
      ) : (
        <>
          <PageHeader section={current?.name ?? ''} title={t('nav.agenda')} />
          {active.isError ? (
            <p className="py-12 text-center text-sm text-destructive">{t('agenda.loadError')}</p>
          ) : (
            <Skeleton className="h-96 w-full rounded-xl" />
          )}
        </>
      )}
    </div>
  )
}
