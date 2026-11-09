import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { ChevronDown, CircleCheck, House, Minimize2 } from 'lucide-react'

import { AddTaskForm } from '@/components/board/add-task-form'
import { formatDuration } from '@/components/board/format-duration'
import { ElsewhereDialog } from '@/components/focus/elsewhere-dialog'
import { ExtendPrompt } from '@/components/focus/extend-prompt'
import { FocusControls } from '@/components/focus/focus-controls'
import { FocusNotes } from '@/components/focus/focus-notes'
import { FocusSubtasks } from '@/components/focus/focus-subtasks'
import { FocusTaskCard } from '@/components/focus/focus-task-card'
import { FocusDrop, NextTaskItem, NextTaskOverlay } from '@/components/focus/next-tasks'
import { OfflineConflicts } from '@/components/focus/offline-conflicts'
import { PlannedBreaks } from '@/components/focus/planned-breaks'
import { SoundSettings } from '@/components/focus/sound-settings'
import { ListBadge } from '@/components/lists/list-badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { useWorkspace } from '@/contexts/workspace-context'
import { lists as listsApi, plans as plansApi, tasks as tasksApi } from '@/lib/api'
import { dayOf, minuteOf } from '@/lib/agenda/layout'
import { extractApiError } from '@/lib/api-errors'
import { type FocusRouteState, collapseFocus, isDesktop, notifyFocusChanged, rememberFocusList } from '@/lib/desktop/focus-window'
import { serverNow } from '@/lib/focus/clock'
import { deviceId } from '@/lib/focus/device-id'
import { taskLeft } from '@/lib/focus/task-left'
import { FOCUS_DROP_ID, arrangeQueue } from '@/lib/focus/next-order'
import { focusQueryKey, useFocus } from '@/lib/focus/use-focus'
import { useFocusSounds } from '@/lib/sounds/use-focus-sounds'
import { cn } from '@/lib/utils'
import type { FocusState } from '@/types'

/** The item or the card under the pointer; the keyboard has no pointer, so the closest corners. */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  return hits.length > 0 ? hits : closestCorners(args)
}

/**
 * Whether opening the focus screen starts the first task of Today (FOCUS-02): unless a session of this
 * device already runs on this list (coming back from the board, FOCUS-16) or the estimate of that task
 * is already used up (it waits for `Estender`, Edge Case). A session on another device is asked to be
 * taken over (SYNC-02). Nothing starts while a stale session waits for `Manter` or `Cortar no último
 * sinal` (SYNC-11).
 */
function shouldStart(state: FocusState, listId: string): boolean {
  // A session left open by a crash waits for the user's answer, not for a new start (SYNC-11).
  if (state.stale !== null) return false
  const first = state.today.tasks[0]
  if (!first || first.awaiting_extend) return false
  const session = state.session
  if (session === null) return true
  if (session.device_id !== deviceId()) return true
  return session.kind === 'task' && session.list_id !== listId
}

/** `/focus/:listId`: focus on the pending tasks of Today of the list (`03-foco.png`). */
export default function FocusPage() {
  const { listId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const { canWrite, current } = useWorkspace()
  const queryClient = useQueryClient()
  const { state, display, actions: focusActions, conflicts, expired } = useFocus(listId)
  const { playComplete } = useFocusSounds(state, display)
  // On the desktop, the widget reads the server again once an action here was answered (WIDGET-22).
  const actions = useMemo(() => {
    const tell = <T,>(action: Promise<T>) => {
      void action.finally(() => notifyFocusChanged())
      return action
    }
    return {
      ...focusActions,
      start: (taskId: string, takeover?: boolean) => tell(focusActions.start(taskId, takeover)),
      pause: () => tell(focusActions.pause()),
      skip: (taskId: string) => tell(focusActions.skip(taskId)),
      complete: (taskId: string) => tell(focusActions.complete(taskId)),
      extend: (taskId: string) => tell(focusActions.extend(taskId)),
      takeBreak: (minutes: number) => tell(focusActions.takeBreak(minutes)),
      endBreak: () => tell(focusActions.endBreak()),
      retry: (actionId: string) => tell(focusActions.retry(actionId)),
    }
  }, [focusActions])
  // A completion made here plays its sound here, once (SOUND-01).
  const complete = (taskId: string) => {
    playComplete()
    void actions.complete(taskId)
  }

  // The widget opens on this list when the task here is paused.
  useEffect(() => {
    if (listId) rememberFocusList(listId)
  }, [listId])

  const { data: allLists } = useQuery({
    queryKey: ['lists', { archived: false }],
    queryFn: () => listsApi.list({ archived: false }),
  })

  // The breaks of the user's plan of today in this list, each with `Começar` (PLAN-26, PLAN-28); saving a plan reads
  // them again under `['plans']`.
  const timezone = allLists?.timezone ?? null
  const nowInstant = new Date(serverNow())
  const planDay = timezone === null ? null : dayOf(nowInstant, timezone)
  const { data: todayPlan } = useQuery({
    queryKey: ['plans', current?.id ?? null, planDay, planDay],
    queryFn: () => plansApi.planned(planDay!, planDay!),
    enabled: planDay !== null && canWrite,
    retry: false,
  })
  const plannedBreaks = (todayPlan?.blocks ?? []).flatMap((block) =>
    block.kind === 'break' && block.day === planDay && block.list.id === listId ? [block] : [],
  )

  // Start once per list, on the first state the server answers. Coming from `Focar agora` on the
  // desktop, the focus then goes to the widget (WIDGET-01): once the start was answered, or at once when
  // a task of this device already counts here.
  // Opened from the board's open-without-starting button, nothing starts and the widget stays closed (#14).
  const routeState = location.state as FocusRouteState | null
  const collapse = isDesktop() && routeState?.collapse === true
  const startOnOpen = routeState?.start !== false
  const started = useRef<string | null>(null)
  useEffect(() => {
    if (!state || !canWrite || started.current === listId) return
    started.current = listId
    if (!startOnOpen) return
    // Without the server the widget cannot sign in, and a stale session waits for a decision taken here.
    const toWidget = (reachedServer: boolean) => {
      navigate(location.pathname, { replace: true, state: null })
      if (reachedServer) void collapseFocus()
    }
    if (shouldStart(state, listId)) {
      const start = actions.start(state.today.tasks[0]!.id)
      if (collapse) void start.then((result) => toWidget(!result.offline))
    } else if (collapse && state.session?.kind === 'task' && state.session.device_id === deviceId() && state.session.list_id === listId) {
      toWidget(state.stale === null && navigator.onLine)
    }
  }, [state, canWrite, listId, actions, collapse, startOnOpen, navigate, location.pathname])

  // The queue in the order the last reorder asked for, kept over every poll until the server answered
  // the move and the screen read the state again (#15).
  const [order, setOrder] = useState<string[] | null>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [overCard, setOverCard] = useState(false)
  const moving = useRef(0)
  const moveMutation = useMutation({
    mutationFn: ({ id, before }: { id: string; before: string | null }) => tasksApi.move(id, { column: 'today', before_task_id: before }),
    onMutate: () => {
      moving.current += 1
    },
    // The new order stays on screen until the state read after the move shows it.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: focusQueryKey(listId) }),
    onError: (e) => toast.error(extractApiError(e, t('common.error'))),
    onSettled: () => {
      moving.current -= 1
      if (moving.current === 0) setOrder(null)
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
      notifyFocusChanged()
    },
  })
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // Compared while rendering, against the state the screen showed last.
  const [seen, setSeen] = useState<{ state: FocusState | null; left: boolean }>({ state: null, left: false })
  if (state !== seen.state) {
    setSeen({ state, left: seen.left || (state !== null && seen.state !== null && taskLeft(seen.state, state)) })
  }
  const left = seen.left

  const board = `/lists/${listId}`
  if (left) return <Navigate to={board} replace />

  const list = allLists?.lists.find((item) => item.id === listId)
  const otherLists = (allLists?.lists ?? []).filter((item) => item.id !== listId)
  const elsewhere = conflicts.find((conflict) => conflict.code === 'focus_elsewhere')
  const refused = conflicts.filter((conflict) => conflict.code !== 'focus_elsewhere')
  const elsewhereTask = elsewhere?.action.type === 'start' ? elsewhere.action.task_id : null

  const today = state?.today
  const total = today ? today.done + today.pending : 0
  const percent = total > 0 && today ? Math.round((today.done / total) * 100) : 0
  const task = state?.task ?? null
  const queue = arrangeQueue(today?.tasks.filter((item) => item.id !== task?.id) ?? [], order)
  const queueIds = queue.map((item) => item.id)
  const dragged = queue.find((item) => item.id === draggedId) ?? null
  const clear = display?.mode === 'all_clear' || display?.mode === 'idle'
  // Nothing open and the task never counted: the screen waits for `Começar` (#14).
  const stopped = state?.session === null && task !== null && task.spent_seconds === 0 && display?.mode === 'paused'
  // A next task dropped on the card becomes the one in focus, from a task of this device counting or
  // paused; never during a break, `Estender`, a session without signal or one on another device (#15).
  const session = state?.session ?? null
  const running = display?.mode === 'countdown' || display?.mode === 'countup'
  const ownTask = session?.kind === 'task' && session.device_id === deviceId()
  const accepts =
    canWrite && task !== null && state?.stale === null && ((display?.mode === 'paused' && session === null) || (running && ownTask))
  const dropping = overCard && accepts && dragged !== null

  const titleOf = (id: string | number) => queue.find((item) => item.id === id)?.title ?? ''
  const position = (id: string | number, at: string | number) =>
    t('focus.queue.position', { title: titleOf(id), position: queueIds.indexOf(String(at)) + 1, total: queueIds.length })
  const announcements: Announcements = {
    onDragStart: ({ active }) => position(active.id, active.id),
    onDragOver: ({ active, over }) =>
      over ? (over.id === FOCUS_DROP_ID ? t('focus.queue.dropToFocus') : position(active.id, over.id)) : undefined,
    onDragEnd: ({ active, over }) =>
      over ? (over.id === FOCUS_DROP_ID ? t('focus.queue.dropToFocus') : position(active.id, over.id)) : undefined,
    onDragCancel: ({ active }) => t('focus.queue.cancelled', { title: titleOf(active.id) }),
  }

  const onDragStart = ({ active }: DragStartEvent) => {
    // A poll already on its way would answer the order of before the drag.
    void queryClient.cancelQueries({ queryKey: focusQueryKey(listId) })
    setOrder(queueIds)
    setDraggedId(String(active.id))
  }
  const onDragOver = ({ over }: DragOverEvent) => setOverCard(over?.id === FOCUS_DROP_ID)
  const endDrag = () => {
    setDraggedId(null)
    setOverCard(false)
    if (moving.current === 0) setOrder(null)
  }
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const activeId = String(active.id)
    const ids = queueIds
    endDrag()
    if (!over || !canWrite) return
    if (over.id === FOCUS_DROP_ID) {
      if (!accepts || !task) return
      // The dragged task becomes the first of Today and the one that was in focus goes right after it, on
      // top of the queue with its time kept (#15, rule 2). With no session open the server reads the first
      // task of Today as the one in focus, so without the move a pause would bring the old one back.
      const rest = ids.filter((id) => id !== activeId)
      void actions.start(activeId)
      setOrder([task.id, ...rest])
      const todayIds = (today?.tasks ?? []).map((item) => item.id)
      const afterActive = todayIds.filter((id) => id !== activeId)
      const moves: { id: string; before: string | null }[] = []
      if (todayIds[0] !== activeId && todayIds[0] !== undefined) moves.push({ id: activeId, before: todayIds[0] })
      if (afterActive[0] !== task.id && afterActive[0] !== undefined) moves.push({ id: task.id, before: afterActive[0] })
      // One after the other: in parallel the server could apply them in either order.
      void moves.reduce<Promise<unknown>>((previous, move) => previous.then(() => moveMutation.mutateAsync(move)), Promise.resolve()).catch(() => undefined)
      return
    }
    const from = ids.indexOf(activeId)
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0 || from === to) return
    const next = arrayMove(ids, from, to)
    setOrder(next)
    // The task in focus is never in the queue, so it is never the one the moved task goes before.
    moveMutation.mutate({ id: activeId, before: next[next.indexOf(activeId) + 1] ?? null })
  }

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col gap-4">
      <header className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" size="sm" className="gap-1 px-2" aria-label={t('focus.page.pickList')}>
              {list && <ListBadge name={list.name} color={list.color} size="sm" />}
              <ChevronDown size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {otherLists.map((item) => (
              <DropdownMenuItem key={item.id} onClick={() => navigate(`/focus/${item.id}`)}>
                <ListBadge name={item.name} color={item.color} size="sm" />
                {item.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <h1 className="flex-1 text-2xl font-bold">{t('board.columns.today')}</h1>
        <SoundSettings />
        <Button variant="ghost" size="icon-sm" aria-label={t('focus.page.home')} onClick={() => navigate(board)}>
          <House />
        </Button>
        {/* Only the desktop has the widget to collapse into (WIDGET-02, WIDGET-24). */}
        {isDesktop() && (
          <Button variant="ghost" size="icon-sm" aria-label={t('focus.page.collapse')} onClick={() => void collapseFocus()}>
            <Minimize2 />
          </Button>
        )}
      </header>

      {!state || !display || !today ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : (
        <>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('focus.page.estimate', { estimate: formatDuration(today.estimate_minutes * 60, i18n.language) })}
            </p>
            <div className="flex items-center gap-3">
              <Progress value={percent} aria-label={t('board.progress', { done: today.done, total })} className="h-1.5 flex-1" />
              <span className="text-xs whitespace-nowrap text-muted-foreground">
                {t('board.progress', { done: today.done, total })}
              </span>
            </div>
          </div>

          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            accessibility={{ announcements, screenReaderInstructions: { draggable: t('focus.queue.instructions') } }}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
            onDragCancel={endDrag}
          >
            {clear ? (
              <div className="flex flex-col items-center gap-2 py-10 text-sm font-medium text-muted-foreground">
                <CircleCheck size={24} className="text-primary" aria-hidden />
                {t('board.allClear')}
              </div>
            ) : display.mode === 'break' ? (
              <FocusTaskCard title={t('focus.break.open')} display={display} />
            ) : display.mode === 'awaiting_extend' && task ? (
              <div className="space-y-3 rounded-xl border-2 border-primary bg-card px-4 py-3">
                <p className="truncate text-base font-medium">{task.title}</p>
                {canWrite && <ExtendPrompt onExtend={() => actions.extend(task.id)} onComplete={() => complete(task.id)} />}
              </div>
            ) : (
              task && (
                <FocusDrop accepts={accepts}>
                  <FocusTaskCard
                    title={task.title}
                    display={display}
                    stopped={stopped}
                    dropHint={
                      dropping
                        ? task.spent_seconds >= 60
                          ? t('focus.queue.backToTopWithTime', { title: task.title, spent: formatDuration(task.spent_seconds, i18n.language) })
                          : t('focus.queue.backToTop', { title: task.title })
                        : null
                    }
                  >
                    <FocusSubtasks taskId={task.id} canWrite={canWrite} onComplete={() => complete(task.id)} />
                    {/* One per task in focus: a change of task saves what its open editor holds and closes it (#33). */}
                    <FocusNotes key={task.id} taskId={task.id} canWrite={canWrite} />
                  </FocusTaskCard>
                </FocusDrop>
              )
            )}

            {canWrite && !clear && (
              <div data-dimmed={dropping || undefined} className={cn('transition-opacity', dropping && 'pointer-events-none opacity-40')}>
                <FocusControls
                  display={display}
                  taskId={task?.id ?? null}
                  pending={today.pending}
                  spentSeconds={task?.spent_seconds}
                  actions={{ ...actions, complete }}
                />
              </div>
            )}

            {canWrite && timezone !== null && display.mode !== 'break' && (
              <PlannedBreaks breaks={plannedBreaks} nowMinute={minuteOf(nowInstant, timezone)} onStart={(block) => void actions.takeBreak(block.minutes)} />
            )}

            {queue.length > 0 && (
              <section className="space-y-2">
                <h2 id="focus-next" className="text-xs font-semibold text-muted-foreground">
                  {t('focus.page.next')}
                </h2>
                <SortableContext items={queueIds} strategy={verticalListSortingStrategy}>
                  <ul className="space-y-2" aria-labelledby="focus-next">
                    {queue.map((item) => (
                      <NextTaskItem key={item.id} task={item} canWrite={canWrite} />
                    ))}
                  </ul>
                </SortableContext>
              </section>
            )}
            <DragOverlay>{dragged && <NextTaskOverlay task={dragged} />}</DragOverlay>
          </DndContext>
          {canWrite && <AddTaskForm listId={listId} column="today" />}

          <OfflineConflicts conflicts={refused} expired={expired} onRetry={actions.retry} onDiscard={actions.discard} />
        </>
      )}

      <ElsewhereDialog
        taskId={elsewhereTask}
        onTakeOver={(taskId) => {
          if (elsewhere) actions.discard(elsewhere.action_id)
          void actions.start(taskId, true)
        }}
        onClose={() => elsewhere && actions.discard(elsewhere.action_id)}
      />
    </div>
  )
}
