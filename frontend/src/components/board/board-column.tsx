import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AddTaskForm } from '@/components/board/add-task-form'
import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import type { Board, BoardColumnView, TaskCardView } from '@/types'

type PendingColumn = 'backlog' | 'this_week' | 'today'

const shell = 'flex min-h-0 flex-col gap-3 rounded-2xl border bg-card/50 p-4'

interface BoardColumnProps {
  column: PendingColumn
  /** Today and This week carry `done`/`total` for the progress bar. */
  view: BoardColumnView & { done?: number; total?: number }
  listId: string
  /** False for a `viewer`: no Add task, and Focus now stays disabled. */
  canWrite: boolean
  /** Renders one card; `index` is its 0-based place in the column. */
  renderTask: (task: TaskCardView, index: number) => ReactNode
  /** What Focus now does; the focus mode itself comes with `foco-e-sons`. */
  onFocusNow?: () => void
  className?: string
}

/** One of the three pending columns: Backlog, This week or Today. */
export function BoardColumn({ column, view, listId, canWrite, renderTask, onFocusNow, className }: BoardColumnProps) {
  const { t, i18n } = useTranslation()
  const hasProgress = view.done !== undefined && view.total !== undefined
  const done = view.done ?? 0
  const total = view.total ?? 0
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const empty = view.tasks.length === 0

  return (
    <section className={cn(shell, column === 'today' && 'border-primary/60', className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t(`board.columns.${column}`)}</h2>
        <span title={t('board.pendingEstimate')} className="text-sm text-muted-foreground">
          {formatDuration(view.estimate_minutes * 60, i18n.language)}
        </span>
      </header>

      {hasProgress && (
        <div className="flex items-center gap-3">
          <Progress value={percent} aria-label={t('board.progress', { done, total })} className="h-1.5 flex-1" />
          <span className="text-xs whitespace-nowrap text-muted-foreground">{t('board.progress', { done, total })}</span>
        </div>
      )}

      <div className="flex flex-col gap-2">{view.tasks.map((task, index) => renderTask(task, index))}</div>

      {canWrite && <AddTaskForm listId={listId} column={column} />}

      {empty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-sm font-medium text-muted-foreground">
          <CircleCheck size={24} className="text-primary" aria-hidden />
          {t('board.allClear')}
        </div>
      )}

      {column === 'today' && (
        <Button className="mt-auto w-full" variant="outline" disabled={!canWrite || empty} onClick={onFocusNow}>
          <Rocket size={16} /> {t('board.focusNow')}
        </Button>
      )}
    </section>
  )
}

interface DoneColumnProps {
  done: Board['columns']['done']
  renderTask: (task: TaskCardView, index: number) => ReactNode
  className?: string
}

/** Concluídas: today and the last earlier day with completions, grouped by day. */
export function DoneColumn({ done, renderTask, className }: DoneColumnProps) {
  const { t, i18n } = useTranslation()
  // `date` is a calendar day in the workspace timezone; read it at noon UTC so no offset moves it.
  const dayLabel = new Intl.DateTimeFormat(i18n.language, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })

  return (
    <section className={cn(shell, className)}>
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{t('board.columns.done')}</h2>
        <span className="text-sm text-muted-foreground">{t('board.doneToday', { count: done.today_count })}</span>
      </header>

      {done.days.map((day) => {
        const label = dayLabel.format(new Date(`${day.date}T12:00:00Z`))
        return (
          <div key={day.date} role="group" aria-label={label} className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{label}</span>
              <span>{t('board.taskCount', { count: day.tasks.length })}</span>
            </div>
            {day.tasks.map((task, index) => renderTask(task, index))}
          </div>
        )
      })}
    </section>
  )
}
