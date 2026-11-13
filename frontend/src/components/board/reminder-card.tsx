import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bell } from 'lucide-react'

import { cn } from '@/lib/utils'
import { scheduleBadge } from '@/lib/schedule'
import type { CardFieldsState } from '@/lib/board/card-fields'
import { PriorityIcon } from '@/components/board/priority'
import type { TaskCardView, TaskColumn } from '@/types'

interface ReminderCardProps {
  task: TaskCardView
  column: TaskColumn
  canWrite: boolean
  onOpen: (task: TaskCardView) => void
  actions?: { menu: ReactNode }
  timeZone?: string
  fields: CardFieldsState
  className?: string
}

/**
 * The compact card of a reminder (REM-03): the bell, the title, the priority icon when that field is on, and
 * the day or time of its schedule. No checkbox, no estimate and no time spent, whatever the fields (FIELDS-06).
 */
export function ReminderCard({ task, column, canWrite, onOpen, actions, timeZone, fields, className }: ReminderCardProps) {
  const { t, i18n } = useTranslation()
  const badge = scheduleBadge(task, column, { now: new Date(), timeZone, t, language: i18n.language })
  const done = column === 'done'

  return (
    <div
      data-slot="card"
      className={cn(
        'group relative flex items-center gap-2.5 rounded-lg border border-dashed bg-card px-3 py-2 transition-colors active:border-primary',
        className,
      )}
    >
      <Bell size={14} role="img" aria-label={t('board.reminder')} className="shrink-0 text-muted-foreground" />
      <button
        type="button"
        onClick={() => onOpen(task)}
        title={task.title}
        className={cn(
          'line-clamp-2 min-w-0 flex-1 cursor-pointer text-left text-sm break-words hover:underline',
          done && 'text-muted-foreground line-through',
        )}
      >
        {task.title}
      </button>
      {fields.priority && <PriorityIcon priority={task.priority} />}
      {badge && (
        <span title={badge.tooltip} className="shrink-0 font-mono text-xs text-muted-foreground">
          {badge.label}
        </span>
      )}
      {actions && canWrite && (
        <div
          className={cn(
            'absolute top-1 right-1 z-10 flex items-center rounded-md bg-card/95 opacity-0 transition-opacity',
            'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
          {actions.menu}
        </div>
      )}
    </div>
  )
}
