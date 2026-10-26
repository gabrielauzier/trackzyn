import { useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronLeft } from 'lucide-react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  pointerWithin,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { lists as listsApi, tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { formatClock } from '@/lib/focus/format-clock'
import { useFocus } from '@/lib/focus/use-focus'
import { useFocusSounds } from '@/lib/sounds/use-focus-sounds'
import { useWorkspace } from '@/contexts/workspace-context'
import { useIsMobile } from '@/hooks/use-mobile'
import { BoardColumn, DoneColumn } from '@/components/board/board-column'
import { formatDuration } from '@/components/board/format-duration'
import { SubtaskList } from '@/components/board/subtask-list'
import { TaskCard } from '@/components/board/task-card'
import { TaskDialog } from '@/components/board/task-dialog'
import { ListBadge } from '@/components/lists/list-badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { FocusRouteState } from '@/lib/desktop/focus-window'
import type { Board, TaskCardView, TaskColumn } from '@/types'

const COLUMNS: TaskColumn[] = ['backlog', 'this_week', 'today', 'done']
type PendingColumn = Exclude<TaskColumn, 'done'>

const COLUMN_PREFIX = 'column:'

/** Every card's column, read from the board. */
const noop = () => {}

/** The card or column under the pointer (cards first); the keyboard has no pointer, so the closest corners. */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args)
  if (hits.length === 0) return closestCorners(args)
  const cards = hits.filter((hit) => !String(hit.id).startsWith(COLUMN_PREFIX))
  return cards.length > 0 ? cards : hits
}

function findCard(board: Board, column: TaskColumn, id: string): { task: TaskCardView; column: TaskColumn; number: number } | null {
  const tasks = column === 'done' ? board.columns.done.days.flatMap((day) => day.tasks) : board.columns[column].tasks
  const index = tasks.findIndex((task) => task.id === id)
  return index < 0 ? null : { task: tasks[index], column, number: index + 1 }
}

function columnsOf(board: Board): Map<string, TaskColumn> {
  const map = new Map<string, TaskColumn>()
  for (const column of ['backlog', 'this_week', 'today'] as const) {
    for (const task of board.columns[column].tasks) map.set(task.id, column)
  }
  for (const day of board.columns.done.days) for (const task of day.tasks) map.set(task.id, 'done')
  return map
}

/** The board with `taskId` moved into a pending column, right before `beforeId` (or last). */
function placeTask(board: Board, taskId: string, to: PendingColumn, beforeId: string | null): Board {
  let moved: TaskCardView | undefined
  const take = (tasks: TaskCardView[]) =>
    tasks.filter((task) => {
      if (task.id !== taskId) return true
      moved = task
      return false
    })
  const columns = {
    backlog: { ...board.columns.backlog, tasks: take(board.columns.backlog.tasks) },
    this_week: { ...board.columns.this_week, tasks: take(board.columns.this_week.tasks) },
    today: { ...board.columns.today, tasks: take(board.columns.today.tasks) },
    done: {
      ...board.columns.done,
      days: board.columns.done.days.map((day) => ({ ...day, tasks: take(day.tasks) })),
    },
  }
  if (!moved) return board
  const target = columns[to].tasks
  const index = beforeId ? target.findIndex((task) => task.id === beforeId) : -1
  target.splice(index < 0 ? target.length : index, 0, moved)
  return { ...board, columns }
}

export default function ListBoardPage() {
  const { listId = '' } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = useWorkspace()
  const isMobile = useIsMobile()
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [tab, setTab] = useState<TaskColumn>('today')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  // While a card is dragged over another column the board shows it there already, before it is dropped.
  const [preview, setPreview] = useState<Board | null>(null)
  const dragOrigin = useRef<TaskColumn | null>(null)
  // The card the dragged one was slotted before when it entered the column it is over now.
  const insertedAt = useRef<string | null>(null)
  const boardKey = ['lists', listId, 'board'] as const
  const focus = useFocus(listId)
  const { playComplete } = useFocusSounds(focus.state, focus.display)

  const { data: board, error } = useQuery({ queryKey: boardKey, queryFn: () => listsApi.board(listId) })
  const { data: allLists } = useQuery({
    queryKey: ['lists', { archived: false }],
    queryFn: () => listsApi.list({ archived: false }),
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, column, before }: { id: string; column: TaskColumn; before: string | null }) =>
      tasksApi.move(id, { column, before_task_id: before }),
    onError: (e) => toast.error(extractApiError(e, t('common.error'))),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['lists'] }),
  })

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a click still opens the task or ticks it.
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  if ((error as { response?: { status?: number } } | null)?.response?.status === 404) {
    return <Navigate to="/" replace />
  }
  if (!board) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {COLUMNS.map((column) => (
          <Skeleton key={column} className="h-96 w-full rounded-2xl" />
        ))}
      </div>
    )
  }

  const shown = preview ?? board
  const taskColumns = columnsOf(shown)
  const move = (id: string, column: TaskColumn, before: string | null) => moveMutation.mutate({ id, column, before })

  // The task of this user's open session, which the board highlights with its time running (FOCUS-16).
  const session = focus.state?.session
  const focusedId = session?.kind === 'task' ? session.task_id : null
  const running = focus.display?.mode === 'countdown' || focus.display?.mode === 'countup'

  // Completing on the board plays the completion sound once (SOUND-01). The task in focus is completed
  // through focus, so its session ends and the next task of Today starts counting (Edge Case, FOCUS-08).
  const complete = (id: string) => {
    playComplete()
    if (id === focusedId) {
      void focus.actions.complete(id).finally(() => void queryClient.invalidateQueries({ queryKey: ['lists'] }))
    } else {
      move(id, 'done', null)
    }
  }

  const endDrag = () => {
    setDraggedId(null)
    setPreview(null)
    dragOrigin.current = null
    insertedAt.current = null
  }

  const columnUnder = (overId: string) =>
    overId.startsWith(COLUMN_PREFIX) ? (overId.slice(COLUMN_PREFIX.length) as TaskColumn) : taskColumns.get(overId)

  const onDragStart = ({ active }: DragStartEvent) => {
    setDraggedId(String(active.id))
    dragOrigin.current = taskColumns.get(String(active.id)) ?? null
  }

  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over || !canWrite) return
    const activeId = String(active.id)
    const overId = String(over.id)
    // Once previewed, the dragged card sits under the pointer, so it is also what the pointer is over.
    if (overId === activeId) return
    const to = columnUnder(overId)
    if (!to) return
    if (to === 'done') {
      // Dropping into Concluídas completes the task rather than placing it, so it is not previewed.
      setPreview(null)
      insertedAt.current = null
      return
    }
    if (taskColumns.get(activeId) === to) {
      if (overId !== insertedAt.current) insertedAt.current = null
      return
    }
    const before = overId.startsWith(COLUMN_PREFIX) ? null : overId
    insertedAt.current = before
    setPreview(placeTask(board, activeId, to, before))
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const origin = dragOrigin.current
    const inserted = insertedAt.current
    endDrag()
    if (!over || !canWrite || !origin) return
    const activeId = String(active.id)
    const overId = String(over.id)
    const current = taskColumns.get(activeId)
    const to = overId === activeId ? current : columnUnder(overId)
    if (!current || !to) return
    if (to === 'done') {
      // Concluídas is ordered by day, so a task only enters it, at no particular place.
      if (origin !== 'done') complete(activeId)
      return
    }
    // Moved into this column during the drag, and not dragged to another card since: it is where the preview put it.
    const placed = current !== origin && (overId === activeId || overId.startsWith(COLUMN_PREFIX) || overId === inserted)
    const ids = shown.columns[to].tasks.map((task) => task.id)
    let before: string | null
    if (placed) {
      before = ids[ids.indexOf(activeId) + 1] ?? null
    } else if (overId.startsWith(COLUMN_PREFIX)) {
      before = null
    } else if (current === to) {
      if (activeId === overId) return
      const order = arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId))
      before = order[order.indexOf(activeId) + 1] ?? null
    } else {
      before = overId
    }
    queryClient.setQueryData<Board>(boardKey, (previous) => previous && placeTask(previous, activeId, to, before))
    move(activeId, to, before)
  }

  const draggedColumn = draggedId ? taskColumns.get(draggedId) : undefined
  const draggedCard = draggedId && draggedColumn ? findCard(shown, draggedColumn, draggedId) : null

  const renderTask = (column: TaskColumn) => (task: TaskCardView, index: number) => (
    <SortableTask key={task.id} id={task.id} canWrite={canWrite}>
      <TaskCard
        task={task}
        column={column}
        number={index + 1}
        canWrite={canWrite}
        onOpen={(card) => setOpenTaskId(card.id)}
        onComplete={(card) => complete(card.id)}
        subtasks={<SubtaskList taskId={task.id} canWrite={canWrite} />}
        className={task.id === focusedId ? 'border-2 border-primary' : undefined}
      />
      {task.id === focusedId && running && focus.display && (
        <span role="timer" aria-label={t('board.inFocus')} className="mt-1 block text-right font-mono text-sm font-semibold tabular-nums">
          {formatClock(focus.display.seconds)}
        </span>
      )}
    </SortableTask>
  )

  const renderColumn = (column: TaskColumn) =>
    column === 'done' ? (
      <ColumnDrop column="done" ids={shown.columns.done.days.flatMap((day) => day.tasks.map((task) => task.id))}>
        <DoneColumn done={shown.columns.done} renderTask={renderTask('done')} className="h-full" />
      </ColumnDrop>
    ) : (
      <ColumnDrop column={column} ids={shown.columns[column].tasks.map((task) => task.id)}>
        <BoardColumn
          column={column}
          view={shown.columns[column]}
          listId={listId}
          canWrite={canWrite}
          renderTask={renderTask(column)}
          onFocusNow={() => navigate(`/focus/${listId}`, { state: { collapse: true } satisfies FocusRouteState })}
          className="h-full"
        />
      </ColumnDrop>
    )

  const otherLists = (allLists?.lists ?? []).filter((list) => list.id !== listId)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ChevronLeft size={16} /> {t('board.back')}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" className="gap-2 text-base font-semibold">
              <ListBadge name={board.list.name} color={board.list.color} size="sm" />
              {board.list.name}
              <ChevronDown size={16} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {otherLists.map((list) => (
              <DropdownMenuItem key={list.id} onClick={() => navigate(`/lists/${list.id}`)}>
                <ListBadge name={list.name} color={list.color} size="sm" />
                {list.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <p className="text-sm text-muted-foreground">
          {t('board.summary', {
            count: board.pending.count,
            estimate: formatDuration(board.pending.estimate_minutes * 60, i18n.language),
          })}
        </p>
      </div>

      <DndContext sensors={sensors} collisionDetection={collisionDetection}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={endDrag}
      >
        {isMobile ? (
          <Tabs value={tab} onValueChange={(value) => setTab(value as TaskColumn)}>
            <TabsList className="w-full">
              {COLUMNS.map((column) => (
                <TabsTrigger key={column} value={column}>
                  {t(`board.columns.${column}`)}
                </TabsTrigger>
              ))}
            </TabsList>
            {COLUMNS.map((column) => (
              <TabsContent key={column} value={column}>
                {renderColumn(column)}
              </TabsContent>
            ))}
          </Tabs>
        ) : (
          <div className="grid grid-cols-4 gap-4">
            {COLUMNS.map((column) => (
              <div key={column} className="min-w-0">
                {renderColumn(column)}
              </div>
            ))}
          </div>
        )}
        {/* The card follows the pointer in an overlay: in place, it snapped back as soon as the pointer
            was over another column's SortableContext, and looked like it had vanished. */}
        <DragOverlay>
          {draggedCard && (
            <div data-task-id={draggedCard.task.id}>
              <TaskCard task={draggedCard.task} column={draggedCard.column} number={draggedCard.number} canWrite={canWrite} onOpen={noop} onComplete={noop} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

      <TaskDialog taskId={openTaskId} canWrite={canWrite} onClose={() => setOpenTaskId(null)} />
    </div>
  )
}

/** A column as a drop target, so a task can land in it even when it is empty. */
function ColumnDrop({ column, ids, children }: { column: TaskColumn; ids: string[]; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: `${COLUMN_PREFIX}${column}` })
  return (
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} data-column={column} className="h-full">
        {children}
      </div>
    </SortableContext>
  )
}

function SortableTask({ id, canWrite, children }: { id: string; canWrite: boolean; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled: !canWrite,
  })
  // A viewer cannot move tasks, so the card does not announce itself as sortable.
  const dragProps = canWrite ? { ...attributes, ...listeners } : {}
  return (
    <div
      ref={(node) => {
        setNodeRef(node)
        setActivatorNodeRef(node)
      }}
      data-task-id={id}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      className={isDragging ? 'opacity-40' : undefined}
      {...dragProps}
    >
      {children}
    </div>
  )
}
