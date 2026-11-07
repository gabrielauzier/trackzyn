import { useEffect, useMemo, useReducer, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, ChevronLeft, ChevronRight, Lock } from 'lucide-react'

import { DatePickerChip } from '@/components/agenda/date-picker-chip'
import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { BlockEditor } from '@/components/plan/block-editor'
import { BreakDialog } from '@/components/plan/break-dialog'
import { CapacityBar } from '@/components/plan/capacity-bar'
import { PlanGrid, type FixedBlock } from '@/components/plan/plan-grid'
import { PlanSidebar } from '@/components/plan/plan-sidebar'
import { WorkdayEditor } from '@/components/plan/workday-editor'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/contexts/workspace-context'
import { lists as listsApi, sessions as sessionsApi } from '@/lib/api'
import { addDays, dayOf, dayPieces, scheduledMinutes } from '@/lib/agenda/layout'
import { agendaKey } from '@/lib/agenda/use-agenda'
import { useScheduled } from '@/lib/agenda/use-scheduled'
import { capacity, type FixedTimed } from '@/lib/plan/capacity'
import { clockMinutes } from '@/lib/plan/clock'
import { clampTask, draftReducer, emptyDraft, isDirty } from '@/lib/plan/draft'
import { fit } from '@/lib/plan/fit'
import { useDraftGuard } from '@/lib/plan/draft-guard-context'
import { usePlan } from '@/lib/plan/use-plan'
import { tomorrowPath } from '@/lib/plan/tomorrow'
import { usePlanDrag } from '@/lib/plan/use-plan-drag'
import { cn } from '@/lib/utils'
import type { ListCard, PlanListRef, PlanRead, PlanTaskRef } from '@/types'

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/** A real `AAAA-MM-DD` day: `2026-02-30` is not one. */
const isDay = (day: string | undefined): day is string => day !== undefined && DAY_PATTERN.test(day) && addDays(day, 0) === day

/** `Segunda, 9 de novembro`: the weekday and the date in full, with a capital letter. */
function dayTitle(day: string, locale: string) {
  const text = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`))
  return text.charAt(0).toLocaleUpperCase(locale) + text.slice(1)
}

type Plan = ReturnType<typeof usePlan>

interface PlanDayProps {
  day: string
  today: string
  timezone: string
  activeLists: PlanListRef[]
  /** The plan as read when the page opened: the draft starts from it. */
  initial: PlanRead
  planned: Plan
}

/** The day of the plan, once read: the draft, the header, the bar, the side list, the grid and the footer. */
function PlanDay({ day, today, timezone, activeLists, initial, planned }: PlanDayProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const navigate = useNavigate()
  const { canWrite } = useWorkspace()
  const { setDraftDay, confirmLeave } = useDraftGuard()
  const { plan, candidates, save, saveState, clearSave, saveWorkday } = planned
  const current = plan.data ?? initial

  /** The saved plan the draft was built on: `Descartar` goes back to it and `Confirmar plano` sends its version (PLAN-35). */
  const [source, setSource] = useState(initial)
  const [draft, dispatch] = useReducer(draftReducer, initial.blocks, (saved) => draftReducer(emptyDraft, { type: 'reset', saved }))
  const dirty = isDirty(draft)
  // A past day and a viewer only read the plan (PLAN-34, PLAN-41).
  const readOnly = !current.editable || !canWrite
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [breakOpen, setBreakOpen] = useState(false)
  const [workdayOpen, setWorkdayOpen] = useState(false)

  // Leaving with an unsaved draft asks first (PLAN-36).
  useEffect(() => setDraftDay(dirty && !readOnly ? day : null), [dirty, readOnly, day, setDraftDay])
  useEffect(() => () => setDraftDay(null), [setDraftDay])

  const restart = (saved: PlanRead) => {
    setSource(saved)
    setSelectedKey(null)
    dispatch({ type: 'reset', saved: saved.blocks })
  }

  /** `Confirmar plano`: the whole draft in one write (PLAN-08); the saved plan is the new start of the draft (PLAN-11). */
  const confirm = () => save({ baseVersion: source.version, blocks: draft.blocks }, { onSuccess: restart })
  /** `Recarregar`: the plan saved elsewhere replaces the draft (PLAN-35). */
  const reload = () =>
    void plan.refetch().then(({ data }) => {
      if (data) restart(data)
      clearSave()
    })

  /** `Descartar`: back to the saved plan. */
  const discard = () => {
    restart(source)
    clearSave()
  }

  const drag = usePlanDrag({
    pxPerMinute: PX_PER_MINUTE,
    onDrop: (item, start) => dispatch({ type: 'add', item, start }),
    onMove: (key, start) => dispatch({ type: 'move', key, start }),
    onResize: (key, minutes) => dispatch({ type: 'resize', key, minutes }),
  })

  // The user's sessions of the day (the Agenda's query) and the timed tasks of the workspace are fixed (PLAN-03).
  const sessionsQuery = useQuery({
    queryKey: agendaKey({ from: day, to: day, listId: null }),
    queryFn: () => sessionsApi.list({ from: day, to: day }),
    retry: false,
  })
  const scheduled = useScheduled(day, day)
  const timed = useMemo(() => scheduled.timed.filter((task) => task.scheduled_on === day && task.scheduled_time !== null), [scheduled.timed, day])
  const fixedTimed: FixedTimed[] = useMemo(
    () => timed.map((task) => ({ id: task.id, scheduled_time: task.scheduled_time!, estimate_minutes: task.estimate_minutes })),
    [timed],
  )
  const fixed = useMemo<FixedBlock[]>(() => {
    const inDraft = new Set(draft.blocks.flatMap((block) => (block.kind === 'task' ? [block.task.id] : [])))
    const sessions = (dayPieces(sessionsQuery.data?.sessions ?? [], [day], timezone, new Date()).get(day) ?? []).map((piece) => ({
      id: piece.session.id,
      kind: 'session' as const,
      title: piece.session.kind === 'break' ? t('agenda.break') : (piece.session.task_title ?? ''),
      start: piece.start,
      minutes: piece.end - piece.start,
      color: piece.session.list_color,
    }))
    // A timed task with a block in the draft shows only as its block.
    const tasks = timed
      .filter((task) => !inDraft.has(task.id))
      .map((task) => ({
        id: task.id,
        kind: 'timed' as const,
        title: task.title,
        start: clockMinutes(task.scheduled_time!) ?? 0,
        minutes: scheduledMinutes(task.estimate_minutes),
        color: task.list.color,
      }))
    return [...sessions, ...tasks]
  }, [sessionsQuery.data, timed, draft.blocks, day, timezone, t])

  const workday = current.workday
  const fits = capacity(draft.blocks, fixedTimed, workday)
  const breakList = activeLists[0] ?? null
  const selected = draft.blocks.find((block) => block.key === selectedKey) ?? null
  const tasksCount = draft.blocks.filter((block) => block.kind === 'task').length

  /**
   * `Encaixar` (PLAN-32, PLAN-33): the marked tasks go into the draft, in order, at the first free time of the workday
   * where each fits, around the draft, the sessions and the timed tasks; nothing is saved. Gives back the ones left.
   */
  const fitTasks = (tasks: PlanTaskRef[]) => {
    const occupied = [...draft.blocks, ...fixed].map(({ start, minutes }) => ({ start, minutes }))
    const sized = tasks.map((task) => ({ task, minutes: clampTask(scheduledMinutes(task.estimate_minutes)) }))
    const { placed, left } = fit(sized, occupied, workday)
    for (const { task, start } of placed) dispatch({ type: 'add', item: { kind: 'task', task: task.task }, start })
    return left.map(({ task }) => task)
  }

  const goTo = (next: string) => confirmLeave(() => navigate(`/planejar/${next}`))
  const showFooter = !readOnly && (dirty || saveState === 'conflict' || saveState === 'failed')

  return (
    <div className="flex flex-col gap-4 pb-4">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex items-center">
          <Button type="button" variant="ghost" size="icon" aria-label={t('plan.page.previousDay')} onClick={() => goTo(addDays(day, -1))}>
            <ChevronLeft size={16} />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={t('plan.page.nextDay')} onClick={() => goTo(addDays(day, 1))}>
            <ChevronRight size={16} />
          </Button>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-medium text-muted-foreground">{t('plan.page.eyebrow')}</span>
          <h1 className="text-2xl font-semibold tracking-tight">{dayTitle(day, locale)}</h1>
        </div>
        <DatePickerChip today={today} shown={day} label={t('plan.page.pickDay')} onPick={goTo} />
        {readOnly && (
          <span data-slot="read-only" className="flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <Lock aria-hidden size={12} />
            {t(current.editable ? 'plan.page.viewer' : 'plan.page.past')}
          </span>
        )}
        {saveState === 'saved' && !dirty && (
          <span role="status" className="flex items-center gap-1.5 rounded-md bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
            <CheckCircle2 aria-hidden size={14} />
            {t('plan.page.saved')}
          </span>
        )}
        <div className="w-full min-w-64 lg:ml-auto lg:w-auto lg:flex-1 lg:max-w-xl">
          <CapacityBar capacity={fits} workday={workday} onEditWorkday={readOnly ? undefined : () => setWorkdayOpen(true)} />
        </div>
      </header>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="lg:w-80 lg:shrink-0">
          <PlanSidebar
            day={day}
            candidates={candidates}
            blocks={draft.blocks}
            breakList={breakList}
            onDragStart={readOnly ? undefined : drag.startDrop}
            onNewBreak={readOnly || !breakList ? undefined : () => setBreakOpen(true)}
            onFit={readOnly ? undefined : fitTasks}
          />
        </div>
        <section className="flex h-[calc(100vh-16rem)] min-h-96 min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <PlanGrid
            day={day}
            blocks={draft.blocks}
            fixed={fixed}
            workday={workday}
            drag={readOnly ? undefined : drag}
            selectedKey={selectedKey}
            onOpen={setSelectedKey}
          />
        </section>
      </div>

      {showFooter && (
        <footer data-slot="plan-footer" className="sticky bottom-0 z-30 flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3 shadow-lg">
          {saveState === 'conflict' ? (
            <div role="alert" className="flex flex-1 items-center gap-3 text-sm font-medium text-destructive">
              {t('plan.page.conflict')}
              <Button type="button" size="sm" variant="outline" onClick={reload}>
                {t('plan.page.reload')}
              </Button>
            </div>
          ) : saveState === 'failed' ? (
            <div role="alert" className="flex flex-1 items-center gap-3 text-sm font-medium text-destructive">
              {t('plan.page.failed')}
              <Button type="button" size="sm" variant="outline" onClick={confirm}>
                {t('plan.page.retry')}
              </Button>
            </div>
          ) : (
            <>
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span aria-hidden className="size-2 rounded-full bg-amber-500" />
                {t('plan.page.draft')}
              </span>
              <span className="text-sm text-muted-foreground">
                {t('plan.page.summary', {
                  tasks: t('plan.page.tasks', { count: tasksCount }),
                  breaks: t('plan.page.breaks', { count: draft.blocks.length - tasksCount }),
                })}
              </span>
            </>
          )}
          <span className={cn('flex gap-2', saveState !== 'conflict' && saveState !== 'failed' && 'ml-auto')}>
            <Button type="button" variant="outline" disabled={saveState === 'saving'} onClick={discard}>
              {t('plan.page.discard')}
            </Button>
            {saveState !== 'conflict' && (
              <Button type="button" disabled={saveState === 'saving'} onClick={confirm}>
                {t('plan.page.confirm')}
              </Button>
            )}
          </span>
        </footer>
      )}

      <BlockEditor
        block={selected}
        lists={activeLists}
        error={draft.error}
        readOnly={readOnly}
        onEdit={(change) => {
          if (selected) dispatch({ type: 'edit', key: selected.key, ...change })
        }}
        onRemove={() => {
          if (selected) dispatch({ type: 'remove', key: selected.key })
          setSelectedKey(null)
        }}
        onClose={() => setSelectedKey(null)}
      />
      <BreakDialog
        open={breakOpen}
        onOpenChange={setBreakOpen}
        lists={activeLists}
        onCreate={(item) => {
          dispatch({ type: 'add', item, start: clockMinutes(workday.start) ?? 0 })
          setBreakOpen(false)
        }}
      />
      <WorkdayEditor open={workdayOpen} onOpenChange={setWorkdayOpen} workday={workday} onSave={saveWorkday} />
    </div>
  )
}

/** The plan of `day` once the workspace's lists gave its timezone. */
function PlanScreen({ day, timezone, lists }: { day: string; timezone: string; lists: ListCard[] }) {
  const { t } = useTranslation()
  const planned = usePlan(day)
  const activeLists = useMemo(() => lists.map(({ id, name, color }) => ({ id, name, color })), [lists])
  const today = dayOf(new Date(), timezone)
  const { plan } = planned

  if (plan.isError) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border py-16 text-center">
        <p className="text-sm text-destructive">{t('plan.page.loadError')}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void plan.refetch()}>
          {t('plan.page.retry')}
        </Button>
      </div>
    )
  }
  if (!plan.data) return <Skeleton className="h-96 w-full rounded-xl" />
  return <PlanDay day={day} today={today} timezone={timezone} activeLists={activeLists} initial={plan.data} planned={planned} />
}

/** `/planejar/:day`: the logged-in user's plan of a day (PLAN-01); without a valid day, tomorrow's. */
export default function PlanPage() {
  const { t } = useTranslation()
  const { day } = useParams()
  // The lists answer carries the workspace timezone, which decides today and tomorrow (AD-004).
  const active = useQuery({ queryKey: ['lists', { archived: false }], queryFn: () => listsApi.list({ archived: false }) })

  if (active.isError) return <p className="py-12 text-center text-sm text-destructive">{t('plan.page.loadError')}</p>
  if (!active.data) return <Skeleton className="h-96 w-full rounded-xl" />
  if (!isDay(day)) return <Navigate to={tomorrowPath(active.data.timezone)} replace />
  // Each day starts its own draft.
  return <PlanScreen key={day} day={day} timezone={active.data.timezone} lists={active.data.lists} />
}
