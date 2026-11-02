import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, ArrowRight, ChevronDown, FileText, ListChecks, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import type { TaskCardView, TaskColumn } from '@/types'

interface TaskCardProps {
  task: TaskCardView
  column: TaskColumn
  /** 1-based order in the column; only Today shows it. */
  number?: number
  /** False for a `viewer`: the check is disabled and nothing can be added. */
  canWrite: boolean
  /** Opens the task dialog. */
  onOpen: (task: TaskCardView) => void
  /** Called when the check of a pending task is ticked. */
  onComplete: (task: TaskCardView) => void
  /** The subtask list, shown when the card's subtask row is expanded. */
  subtasks?: ReactNode
  /** The quick note, shown when the notes action is on; it is given what closes it. */
  notes?: (close: () => void) => ReactNode
  /** The quick actions that show when the card is hovered or focused; without it the card has none. */
  actions?: {
    /** One column to the left or right. */
    onMove: (task: TaskCardView, direction: 'left' | 'right') => void
    /** The "more actions" menu. */
    menu: ReactNode
  }
  className?: string
}

export function TaskCard({ task, column, number, canWrite, onOpen, onComplete, subtasks, notes, actions, className }: TaskCardProps) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const done = column === 'done'
  const locale = i18n.language

  return (
    <Card className={cn('group relative gap-2 px-3 py-2.5 shadow-none', className)}>
      {actions && (
        <div
          className={cn(
            'absolute top-1.5 right-1.5 z-10 flex max-w-[calc(100%-0.75rem)] items-center justify-end rounded-md bg-card/95 opacity-0 transition-opacity',
            'group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100',
          )}
        >
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label={t('board.showSubtasks')}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ListChecks size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="size-6"
            aria-label={t('board.showNotes')}
            aria-expanded={notesOpen}
            onClick={() => setNotesOpen((value) => !value)}
          >
            <FileText size={14} />
          </Button>
          {canWrite && (
            <>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label={t('board.moveLeft')}
                disabled={column === 'backlog'}
                onClick={() => actions.onMove(task, 'left')}
              >
                <ArrowLeft size={14} />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6"
                aria-label={t('board.moveRight')}
                disabled={done}
                onClick={() => actions.onMove(task, 'right')}
              >
                <ArrowRight size={14} />
              </Button>
              {actions.menu}
            </>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        {column === 'today' && number !== undefined && (
          <span title={t('board.orderInToday')} className="mt-0.5 w-4 shrink-0 text-xs text-muted-foreground">
            {number}
          </span>
        )}
        <Checkbox
          className="mt-0.5"
          checked={done}
          // A done task leaves Concluídas by being dragged out (BOARD-08), not by its check.
          disabled={!canWrite || done}
          aria-label={t('board.complete', { title: task.title })}
          onCheckedChange={(checked) => checked === true && onComplete(task)}
        />
        <button
          type="button"
          onClick={() => onOpen(task)}
          className={cn(
            'min-w-0 flex-1 truncate text-left text-sm font-medium hover:underline',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {task.estimate_minutes !== null && (
            <span title={t('board.estimate')}>{formatDuration(task.estimate_minutes * 60, locale)}</span>
          )}
        </span>
        <span title={t('board.spent')} className="font-medium text-foreground">
          {formatDuration(task.spent_seconds, locale)}
        </span>
      </div>

      {task.subtasks.total > 0 && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <span className="flex-1">{t('board.subtaskSummary', { done: task.subtasks.done, total: task.subtasks.total })}</span>
          {canWrite && (
            <Button variant="ghost" size="icon-sm" aria-label={t('board.addSubtask')} onClick={() => setExpanded(true)}>
              <Plus size={14} />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('board.showSubtasks')}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
          </Button>
        </div>
      )}
      {expanded && subtasks}
      {notesOpen && notes?.(() => setNotesOpen(false))}
    </Card>
  )
}
