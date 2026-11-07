import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { cn } from '@/lib/utils'

/** What a task row shows: its title, its estimate and its subtask count. */
export interface TaskRowTask {
  title: string
  estimate_minutes: number | null
  /** Absent in a focus answer stored before the field existed, read as none. */
  subtasks?: { done: number; total: number }
}

/** A bordered, rounded row of a task (`Próximas tarefas`, the list card on the home screen). */
export const taskRowClass = 'flex items-center gap-2 rounded-lg border bg-card py-2 pr-3 text-sm'

/** `<n> subtarefa(s) · <estimativa>`, only the part that exists (#16); nothing without either. */
export function TaskRowMeta({ task }: { task: TaskRowTask }) {
  const { t, i18n } = useTranslation()
  const parts: string[] = []
  const total = task.subtasks?.total ?? 0
  if (total > 0) parts.push(t('focus.queue.subtaskCount', { count: total }))
  if (task.estimate_minutes !== null) parts.push(formatDuration(task.estimate_minutes * 60, i18n.language))
  if (parts.length === 0) return null
  return <span className="shrink-0 text-xs text-muted-foreground">{parts.join(' · ')}</span>
}

/** A task row without a handle: the title truncated on the left, the meta on the right. */
export function TaskRow({ task, className }: { task: TaskRowTask; className?: string }) {
  return (
    <li className={cn(taskRowClass, 'pl-3', className)}>
      <span className="min-w-0 flex-1 truncate" title={task.title}>
        {task.title}
      </span>
      <TaskRowMeta task={task} />
    </li>
  )
}
