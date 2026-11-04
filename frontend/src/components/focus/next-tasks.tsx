import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useDroppable } from '@dnd-kit/core'
import { useSortable } from '@dnd-kit/sortable'
import { GripVertical } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { cn } from '@/lib/utils'
import { FOCUS_DROP_ID, type NextTask } from '@/lib/focus/next-order'

/** `<total> subtarefas · <estimativa>`, only the estimate without subtasks (#16); nothing without either. */
function NextTaskMeta({ task }: { task: NextTask }) {
  const { t, i18n } = useTranslation()
  const parts: string[] = []
  const total = task.subtasks?.total ?? 0
  if (total > 0) parts.push(t('focus.queue.subtaskCount', { count: total }))
  if (task.estimate_minutes !== null) parts.push(formatDuration(task.estimate_minutes * 60, i18n.language))
  if (parts.length === 0) return null
  return <span className="shrink-0 text-xs text-muted-foreground">{parts.join(' · ')}</span>
}

const row = 'flex items-center gap-2 rounded-lg border bg-card py-2 pr-3 text-sm'

interface NextTaskItemProps {
  task: NextTask
  /** False for a `viewer`: no handle, and the item cannot be dragged (#15). */
  canWrite: boolean
}

/** One of `Próximas tarefas`: with a six-dot handle that drags it, by mouse or keyboard (#15). */
export function NextTaskItem({ task, canWrite }: NextTaskItemProps) {
  const { t } = useTranslation()
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: !canWrite,
  })

  return (
    <li
      ref={setNodeRef}
      data-task-id={task.id}
      data-placeholder={isDragging || undefined}
      style={{ transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined, transition }}
      className={cn(
        row,
        canWrite ? 'pl-1' : 'pl-3',
        // Where the dragged task falls: a dashed space in its place (canvas #15, `Arrastando com o mouse`).
        isDragging && 'border-2 border-dashed border-primary/50 bg-primary/5 [&>*]:invisible',
      )}
    >
      {canWrite && (
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={t('focus.queue.move', { title: task.title })}
          className="inline-flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
        >
          <GripVertical size={16} aria-hidden />
        </button>
      )}
      <span className="min-w-0 flex-1 truncate">{task.title}</span>
      <NextTaskMeta task={task} />
    </li>
  )
}

/** The task being dragged, lifted with a shadow, following the pointer (canvas #15). */
export function NextTaskOverlay({ task }: { task: NextTask }) {
  return (
    <div data-overlay={task.id} className={cn(row, 'border-primary pl-1 shadow-lg')}>
      <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
        <GripVertical size={16} aria-hidden />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">{task.title}</span>
      <NextTaskMeta task={task} />
    </div>
  )
}

/** The card in focus as a drop area; refused (disabled) during a break, `Estender`, a stale session or one elsewhere. */
export function FocusDrop({ accepts, children }: { accepts: boolean; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: FOCUS_DROP_ID, disabled: !accepts })
  return (
    <div ref={setNodeRef} data-focus-drop>
      {children}
    </div>
  )
}
