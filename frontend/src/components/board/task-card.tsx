import { useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ChevronDown, FileText, ListChecks, Pencil, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DURATION_ERROR_KEY, parseDuration, toDuration } from '@/components/board/estimate'
import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { DurationInput } from '@/components/ui/duration-input'
import type { TaskCardView, TaskColumn } from '@/types'

interface TaskCardProps {
  task: TaskCardView
  column: TaskColumn
  /** 1-based order in the column; only Today shows it. */
  number?: number
  /** False for a `viewer`: nothing can be added and the estimate is only text. */
  canWrite: boolean
  /** Opens the task dialog. */
  onOpen: (task: TaskCardView) => void
  /**
   * Saves an estimate edited on the card, in minutes (null for none). Without it the estimate is only
   * text, as on the card that follows a drag.
   */
  onEstimateChange?: (task: TaskCardView, minutes: number | null) => void
  /** The subtask list, shown when the card's subtask row is expanded. */
  subtasks?: ReactNode
  /** The quick note, shown when the notes action is on; it is given what closes it. */
  notes?: (close: () => void) => ReactNode
  /** The quick actions that show when the card is hovered or focused; without it the card has none. */
  actions?: {
    /** The "more actions" menu, which also moves the card one column. */
    menu: ReactNode
  }
  className?: string
}

export function TaskCard({ task, column, number, canWrite, onOpen, onEstimateChange, subtasks, notes, actions, className }: TaskCardProps) {
  const { t, i18n } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const done = column === 'done'
  const locale = i18n.language

  return (
    // The accent border while pressed; the board keeps it on the card it selected (`className`).
    <Card className={cn('group relative gap-2 px-3 py-2.5 shadow-none transition-colors active:border-primary', className)}>
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
          {canWrite && actions.menu}
        </div>
      )}
      <div className="flex items-start gap-2">
        {column === 'today' && number !== undefined && (
          <span title={t('board.orderInToday')} className="mt-0.5 w-4 shrink-0 text-xs text-muted-foreground">
            {number}
          </span>
        )}
        {/* Completing is moving the card to Concluídas; there the check only marks it, it is no control. */}
        {done && <Check size={16} strokeWidth={2.5} role="img" aria-label={t('board.completed')} className="mt-0.5 shrink-0 text-primary" />}
        <button
          type="button"
          onClick={() => onOpen(task)}
          title={task.title}
          className={cn(
            'line-clamp-3 min-w-0 flex-1 cursor-pointer text-left text-sm font-medium break-words hover:underline',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </button>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        {canWrite && onEstimateChange ? (
          <EstimateEditor task={task} onSave={(minutes) => onEstimateChange(task, minutes)} />
        ) : (
          <span>
            {task.estimate_minutes !== null && (
              <span title={t('board.estimate')}>{formatDuration(task.estimate_minutes * 60, locale)}</span>
            )}
          </span>
        )}
        <span title={t('board.spent')} className="font-medium text-foreground">
          {formatDuration(task.spent_seconds, locale)}
        </span>
      </div>

      {task.created_via && (
        <p className="truncate text-xs text-muted-foreground" title={t('board.createdVia', { name: task.created_via })}>
          {t('board.createdVia', { name: task.created_via })}
        </p>
      )}

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


/** A press on the estimate is not the start of a drag of the card. */
const keepFromDrag = (event: PointerEvent) => event.stopPropagation()

/** The estimate of a card for someone who can edit: a button that turns into an `HH:MM` field in place. */
function EstimateEditor({ task, onSave }: { task: TaskCardView; onSave: (minutes: number | null) => void }) {
  const { t, i18n } = useTranslation()
  const [text, setText] = useState<string | null>(null)
  // Enter on an unfinished value shows why it is not saved.
  const [tried, setTried] = useState(false)
  const label = t('board.editEstimate')

  if (text === null) {
    return (
      <button
        type="button"
        aria-label={label}
        onPointerDown={keepFromDrag}
        onClick={() => {
          setTried(false)
          setText(toDuration(task.estimate_minutes))
        }}
        className="group/estimate -mx-1 inline-flex h-5 min-w-10 cursor-text items-center gap-1 rounded px-1 hover:bg-muted"
      >
        {task.estimate_minutes !== null && (
          <span title={t('board.estimate')}>{formatDuration(task.estimate_minutes * 60, i18n.language)}</span>
        )}
        <Pencil size={11} aria-hidden className="opacity-0 group-hover/estimate:opacity-100" />
      </button>
    )
  }

  const parsed = parseDuration(text)
  const error = 'error' in parsed ? parsed.error : null
  // A whole HH:MM that is out of range warns as it is typed; an unfinished one only on Enter.
  const shown = error && (error !== 'format' || tried) ? error : null
  const close = () => setText(null)
  const commit = () => {
    if ('error' in parsed) return false
    if (parsed.minutes !== task.estimate_minutes) onSave(parsed.minutes)
    close()
    return true
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.key === 'Enter') {
      event.preventDefault()
      if (!commit()) setTried(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  return (
    <span className="flex flex-col">
      <DurationInput
        autoFocus
        aria-label={label}
        aria-invalid={shown ? true : undefined}
        aria-describedby={shown ? `estimate-error-${task.id}` : undefined}
        value={text}
        onChange={setText}
        onPointerDown={keepFromDrag}
        onKeyDown={onKeyDown}
        // Leaving saves a valid value and puts the previous one back otherwise.
        onBlur={() => {
          if (!commit()) close()
        }}
      />
      {shown && (
        <span id={`estimate-error-${task.id}`} role="alert" className="mt-0.5 text-[11px] text-destructive">
          {t(DURATION_ERROR_KEY[shown])}
        </span>
      )}
    </span>
  )
}
