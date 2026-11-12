import { useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CalendarCheck, Plus } from 'lucide-react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { lists as listsApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { useAuth } from '@/contexts/auth-context'
import { useWorkspace } from '@/contexts/workspace-context'
import { PageHeader } from '@/components/page-header'
import { greetingFor, hourIn } from '@/components/lists/greeting'
import { ListCard } from '@/components/lists/list-card'
import { ListDialog } from '@/components/lists/list-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { tomorrowPath } from '@/lib/plan/tomorrow'
import { cn } from '@/lib/utils'
import { useCardSelection } from '@/lib/use-card-selection'
import type { ListCard as ListCardData, ListsResponse } from '@/types'

const LISTS_KEY = ['lists', { archived: false }] as const

/**
 * The pointer drags the card from its body only: pressing the title (a link) or the `⋮` menu,
 * both marked `data-no-drag`, does what that control does and never starts a drag.
 */
class CardBodyPointerSensor extends PointerSensor {
  static activators = [
    {
      eventName: 'onPointerDown' as const,
      handler: ({ nativeEvent }: ReactPointerEvent) =>
        nativeEvent.isPrimary &&
        nativeEvent.button === 0 &&
        !(nativeEvent.target instanceof Element && nativeEvent.target.closest('[data-no-drag]')),
    },
  ]
}

export default function ListsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const { current, canWrite } = useWorkspace()
  const [searchParams, setSearchParams] = useSearchParams()
  const [creating, setCreating] = useState(false)
  const [renaming, setRenaming] = useState<ListCardData | null>(null)
  // The card a press last landed in keeps the accent border, through its link and its menu.
  const { selected: selectedCard, select: selectCard } = useCardSelection('data-list-id')

  const { data, isLoading } = useQuery({
    queryKey: LISTS_KEY,
    queryFn: () => listsApi.list({ archived: false }),
  })

  const moveMutation = useMutation({
    mutationFn: ({ id, beforeListId }: { id: string; beforeListId: string | null }) =>
      listsApi.move(id, beforeListId),
    onError: (e) => toast.error(extractApiError(e, t('common.error'))),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ['lists'] }),
  })

  const sensors = useSensors(
    // A few pixels of travel before a drag starts, so a click still opens the list or its menu.
    useSensor(CardBodyPointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  // The order a drop produced, drawn in the very render of the drop. The query cache tells its
  // subscribers a tick later, and in that tick the dropped card, its drag transform gone, slid
  // back toward its old slot before jumping to the new one. Tied to the response it reordered,
  // so the next response (the cache update, a refetch) replaces it without an effect.
  const [dropped, setDropped] = useState<{ base: ListsResponse; lists: ListCardData[] } | null>(null)
  const lists = (dropped && dropped.base === data ? dropped.lists : data?.lists) ?? []
  const name = user?.preferences?.display_name || user?.email?.split('@')[0] || ''
  const timeZone = data?.timezone ?? current?.timezone ?? undefined
  const navigate = useNavigate()
  const period = greetingFor(hourIn(timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone))

  // The sidebar's "Create new list" lands here with ?new=1.
  const dialogOpen = creating || (canWrite && searchParams.has('new'))
  const closeCreate = () => {
    setCreating(false)
    if (searchParams.has('new')) {
      const next = new URLSearchParams(searchParams)
      next.delete('new')
      setSearchParams(next, { replace: true })
    }
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = lists.map((list) => list.id)
    const from = ids.indexOf(String(active.id))
    const to = ids.indexOf(String(over.id))
    if (from < 0 || to < 0) return
    const order = arrayMove(ids, from, to)
    if (data) setDropped({ base: data, lists: arrayMove(lists, from, to) })
    queryClient.setQueryData<ListsResponse>(LISTS_KEY, (previous) =>
      previous ? { ...previous, lists: arrayMove(previous.lists, from, to) } : previous,
    )
    moveMutation.mutate({ id: String(active.id), beforeListId: order[to + 1] ?? null })
  }

  return (
    <div>
      <PageHeader
        section={current?.name ?? ''}
        title={t(`home.greeting.${period}`, { name })}
        action={
          // The plan of tomorrow in the workspace timezone (PLAN-01).
          timeZone && (
            <Button type="button" variant="outline" size="sm" onClick={() => navigate(tomorrowPath(timeZone))}>
              <CalendarCheck size={14} />
              {t('plan.agenda.planTomorrow')}
            </Button>
          )
        }
      />
      <p className="-mt-4 mb-8 text-sm text-muted-foreground">{t(`home.subtitle.${period}`)}</p>

      <h2 className="mb-3 text-sm font-semibold">{t('home.yourLists')}</h2>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={lists.map((list) => list.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {lists.map((list) => (
                <SortableListCard
                  key={list.id}
                  list={list}
                  canWrite={canWrite}
                  selected={list.id === selectedCard}
                  onFocusCard={() => selectCard(list.id)}
                  onRename={setRenaming}
                />
              ))}
              {canWrite && (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="flex min-h-56 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                >
                  <Plus size={20} />
                  {t('home.createList')}
                </button>
              )}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {canWrite && <ListDialog open={dialogOpen} onClose={closeCreate} />}
      {canWrite && <ListDialog open={!!renaming} list={renaming} onClose={() => setRenaming(null)} />}
    </div>
  )
}

function SortableListCard({
  list,
  canWrite,
  selected,
  onFocusCard,
  onRename,
}: {
  list: ListCardData
  canWrite: boolean
  /** The card a press last landed in: it keeps the accent border. */
  selected: boolean
  /** The keyboard reached the card itself: it is selected, as a press on it would. */
  onFocusCard: () => void
  onRename: (list: ListCardData) => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: list.id,
    disabled: !canWrite,
  })
  // A viewer cannot reorder, so the card does not announce itself as sortable.
  const dragProps = canWrite ? { ...attributes, ...listeners } : {}
  return (
    <div
      // The card itself is the keyboard activator: Space on the link or the
      // menu inside it keeps doing what those controls do.
      ref={(node) => {
        setNodeRef(node)
        setActivatorNodeRef(node)
      }}
      data-list-id={list.id}
      style={{
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        transition,
      }}
      // Only a writer is told the card can be picked up (#31).
      onFocus={(event) => {
        if (event.target === event.currentTarget) onFocusCard()
      }}
      className={cn(
        'outline-none',
        canWrite && (isDragging ? 'cursor-grabbing' : 'cursor-grab'),
        isDragging && 'relative z-10 opacity-80',
      )}
      {...dragProps}
    >
      {/* Dragged, the accent border stays on after the press, the keyboard drag included. */}
      <ListCard list={list} canWrite={canWrite} onRename={onRename} className={cn('h-full', (selected || isDragging) && 'border-primary')} />
    </div>
  )
}
