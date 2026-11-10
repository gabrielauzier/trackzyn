import { useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronLeft, ChevronRight, Lock } from 'lucide-react'

import { DatePickerChip } from '@/components/agenda/date-picker-chip'
import { NewSessionTaskDialog } from '@/components/agenda/new-session-task-dialog'
import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { BlockEditor } from '@/components/plan/block-editor'
import { BreakDialog } from '@/components/plan/break-dialog'
import { CapacityBar } from '@/components/plan/capacity-bar'
import { PlanGrid, type FixedBlock } from '@/components/plan/plan-grid'
import { PlanSidebar } from '@/components/plan/plan-sidebar'
import { toDuration } from '@/components/board/estimate'
import { WorkdayEditor } from '@/components/plan/workday-editor'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/contexts/workspace-context'
import { lists as listsApi, tasks as tasksApi } from '@/lib/api'
import { addDays, dayOf, scheduledMinutes } from '@/lib/agenda/layout'
import { useScheduled } from '@/lib/agenda/use-scheduled'
import { capacity, type FixedTimed } from '@/lib/plan/capacity'
import { clockMinutes } from '@/lib/plan/clock'
import { clampTask, draftReducer, emptyDraft, isDirty, type DropItem } from '@/lib/plan/draft'
import { fit } from '@/lib/plan/fit'
import { useDraftGuard } from '@/lib/plan/draft-guard-context'
import { usePlan } from '@/lib/plan/use-plan'
import { todayPath } from '@/lib/plan/tomorrow'
import { usePlanDrag } from '@/lib/plan/use-plan-drag'
import { cn } from '@/lib/utils'
import type { AgendaTaskInput, ListCard, PlanListRef, PlanRead, PlanTaskRef, Task } from '@/types'

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
  activeLists: PlanListRef[]
  /** The plan as read when the page opened: the draft starts from it. */
  initial: PlanRead
  planned: Plan
}

/** The day of the plan, once read: the draft, the header, the bar, the side list, the grid and the footer. */
function PlanDay({ day, today, activeLists, initial, planned }: PlanDayProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.resolvedLanguage ?? i18n.language
  const navigate = useNavigate()
  const { canWrite, current: workspace } = useWorkspace()
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
  /** The pinned header: the list sits under it and the page opens with the workday start below it (PLAN-03). */
  const header = useRef<HTMLElement>(null)
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

  const queryClient = useQueryClient()
  /** Where `Nova tarefa` fell on the grid, while its form is open (PLAN-48). */
  const [newTask, setNewTask] = useState<{ item: Extract<DropItem, { kind: 'new' }>; start: number } | null>(null)
  /**
   * The form of `Nova tarefa` saved (PLAN-48): the task goes to Hoje when the plan is today's and to Esta semana
   * otherwise; its day is the plan's once the plan is saved (PLAN-09).
   */
  const createPlanTask = (input: AgendaTaskInput) => tasksApi.create({ ...input, estimate_minutes: input.estimate_minutes ?? null, column: day === today ? 'today' : 'this_week' })
  /** Its block goes into the draft where the card fell, as a task dropped from the list. */
  const placeNewTask = (task: Task) => {
    if (!newTask) return
    const list = activeLists.find((item) => item.id === task.list_id) ?? newTask.item.list
    const ref: PlanTaskRef = { id: task.id, title: task.title, list, done: false, scheduled_on: task.scheduled_on, estimate_minutes: task.estimate_minutes }
    dispatch({ type: 'add', item: { kind: 'task', task: ref }, start: newTask.start })
    setNewTask(null)
    // The side list shows it as planned; the saved plan does not change.
    void queryClient.invalidateQueries({ predicate: ({ queryKey }) => queryKey[0] === 'plan' && queryKey[3] === 'candidates' })
  }
  const drag = usePlanDrag({
    pxPerMinute: PX_PER_MINUTE,
    onDrop: (item, start) => (item.kind === 'new' ? setNewTask({ item, start }) : dispatch({ type: 'add', item, start })),
    onMove: (key, start) => dispatch({ type: 'move', key, start }),
    onResize: (key, minutes) => dispatch({ type: 'resize', key, minutes }),
  })

  // The timed tasks of the workspace are fixed; the sessions already done stay on the Agenda (PLAN-03).
  const scheduled = useScheduled(day, day)
  const timed = useMemo(() => scheduled.timed.filter((task) => task.scheduled_on === day && task.scheduled_time !== null), [scheduled.timed, day])
  const fixedTimed: FixedTimed[] = useMemo(
    () => timed.map((task) => ({ id: task.id, scheduled_time: task.scheduled_time!, estimate_minutes: task.estimate_minutes })),
    [timed],
  )
  const fixed = useMemo<FixedBlock[]>(() => {
    const inDraft = new Set(draft.blocks.flatMap((block) => (block.kind === 'task' ? [block.task.id] : [])))
    // A timed task with a block in the draft shows only as its block.
    return timed
      .filter((task) => !inDraft.has(task.id))
      .map((task) => ({
        id: task.id,
        kind: 'timed' as const,
        title: task.title,
        start: clockMinutes(task.scheduled_time!) ?? 0,
        minutes: scheduledMinutes(task.estimate_minutes),
        color: task.list.color,
      }))
  }, [timed, draft.blocks])

  const workday = current.workday
  // The bar counts overlapping blocks once when the workspace counts net hours (HOURS-27).
  const fits = capacity(draft.blocks, fixedTimed, workday, workspace?.hours_count_mode ?? 'gross')
  const breakList = activeLists[0] ?? null
  const selected = draft.blocks.find((block) => block.key === selectedKey) ?? null
  const tasksCount = draft.blocks.filter((block) => block.kind === 'task').length

  /**
   * `Encaixar` (PLAN-32, PLAN-33): a marked task scheduled with a time on this day goes into the draft at that time,
   * for its estimate; the others, in order, at the first free time of the workday where each fits, around the draft,
   * the timed tasks and those windows. Nothing is saved. Gives back the ones left.
   */
  const fitTasks = (tasks: PlanTaskRef[]) => {
    const timeOf = new Map(timed.map((task) => [task.id, clockMinutes(task.scheduled_time!) ?? 0]))
    const windows = tasks.flatMap((task) => {
      const start = timeOf.get(task.id)
      return start === undefined ? [] : [{ task, start, minutes: clampTask(scheduledMinutes(task.estimate_minutes)) }]
    })
    for (const { task, start } of windows) dispatch({ type: 'add', item: { kind: 'task', task }, start })
    const occupied = [...draft.blocks, ...fixed, ...windows].map(({ start, minutes }) => ({ start, minutes }))
    const sized = tasks
      .filter((task) => !timeOf.has(task.id))
      .map((task) => ({ task, minutes: clampTask(scheduledMinutes(task.estimate_minutes)) }))
    const { placed, left } = fit(sized, occupied, workday)
    for (const { task, start } of placed) dispatch({ type: 'add', item: { kind: 'task', task: task.task }, start })
    return left.map(({ task }) => task)
  }

  const goTo = (next: string) => confirmLeave(() => navigate(`/planejar/${next}`))
  const showFooter = !readOnly && (dirty || saveState === 'conflict' || saveState === 'failed')

  return (
    <div className="flex flex-col gap-4 pb-4" style={{ '--plan-header': `${headerHeight}px` } as CSSProperties}>
      {/* Side by side, the header stays at the top of the window, over the page's padding, while the page scrolls (PLAN-03). */}
      <header
        ref={header}
        data-slot="plan-header"
        className="flex flex-wrap items-center gap-3 bg-background lg:sticky lg:top-0 lg:z-30 lg:-mx-6 lg:-mt-6 lg:px-6 lg:pt-6 lg:pb-3"
      >
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
        {/* Side by side, the list stays under the header while the page scrolls the grid, and scrolls inside when taller
            than the window, its items kept off the scrollbar (PLAN-03). */}
        <div
          data-slot="plan-side"
          className="lg:sticky lg:top-[calc(var(--plan-header)+0.5rem)] lg:max-h-[calc(100vh-var(--plan-header)-1.5rem)] lg:w-80 lg:shrink-0 lg:overflow-y-auto lg:pr-3"
        >
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
        <section className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border bg-card">
          <PlanGrid
            day={day}
            blocks={draft.blocks}
            fixed={fixed}
            workday={workday}
            drag={readOnly ? undefined : drag}
            selectedKey={selectedKey}
            onOpen={setSelectedKey}
            // The header, and a breath under it so the workday's first hour label shows.
            scrollInset={() => (header.current?.offsetHeight ?? 0) + 16}
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
      <NewSessionTaskDialog
        open={newTask !== null}
        onOpenChange={(open) => !open && setNewTask(null)}
        lists={activeLists}
        defaultListId={newTask?.item.list.id ?? null}
        defaultTitle=""
        defaultEstimate={toDuration(newTask?.item.estimate ?? null)}
        hint={t('plan.newTask.hint')}
        onSubmit={createPlanTask}
        onCreated={placeNewTask}
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
  return <PlanDay day={day} today={today} activeLists={activeLists} initial={plan.data} planned={planned} />
}

/** `/planejar/:day`: the logged-in user's plan of a day (PLAN-01); without a valid day, tomorrow's. */
export default function PlanPage() {
  const { t } = useTranslation()
  const { day } = useParams()
  // The lists answer carries the workspace timezone, which decides today and tomorrow (AD-004).
  const active = useQuery({ queryKey: ['lists', { archived: false }], queryFn: () => listsApi.list({ archived: false }) })

  if (active.isError) return <p className="py-12 text-center text-sm text-destructive">{t('plan.page.loadError')}</p>
  if (!active.data) return <Skeleton className="h-96 w-full rounded-xl" />
  if (!isDay(day)) return <Navigate to={todayPath(active.data.timezone)} replace />
  // Each day starts its own draft.
  return <PlanScreen key={day} day={day} timezone={active.data.timezone} lists={active.data.lists} />
}
