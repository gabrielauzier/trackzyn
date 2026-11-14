import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { CircleCheck, Eye, Rocket } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AddTaskForm } from '@/components/board/add-task-form'
import { GroupContainer } from '@/components/board/group-container'
import { columnItems, type BoardGroup } from '@/lib/board/blocks'
import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { isDesktop } from '@/lib/desktop/focus-window'
import type { Board, BoardColumnView, TaskCardView } from '@/types'

type PendingColumn = 'backlog' | 'this_week' | 'today'

const shell = 'flex min-h-0 flex-col gap-3 rounded-2xl border bg-card/50 p-4'

/** Draws one group's container around its cards (`cards`); the board makes it a drop target. */
export type RenderGroup = (group: BoardGroup, tasks: TaskCardView[], cards: ReactNode) => ReactNode

const plainGroup: RenderGroup = (group, tasks, cards) => (
  <GroupContainer key={`${group.id}:${tasks[0]?.id}`} group={group} count={tasks.length}>
    {cards}
  </GroupContainer>
)

/** The tasks of a column, the consecutive ones of a group inside its container (GRP-04). */
function columnCards(
  tasks: TaskCardView[],
  groups: readonly BoardGroup[],
  renderTask: (task: TaskCardView, index: number) => ReactNode,
  renderGroup: RenderGroup,
) {
  return columnItems(tasks, groups).map((item) =>
    item.type === 'task'
      ? renderTask(item.task, item.index)
      : renderGroup(
          item.group,
          item.tasks.map(({ task }) => task),
          item.tasks.map(({ task, index }) => renderTask(task, index)),
        ),
  )
}

interface BoardColumnProps {
  column: PendingColumn
  /** Today and This week carry `done`/`total` for the progress bar. */
  view: BoardColumnView & { done?: number; total?: number }
  listId: string
  /** False for a `viewer`: no Add task, and Focus now stays disabled. */
  canWrite: boolean
  /** Renders one card; `index` is its 0-based place in the column. */
  renderTask: (task: TaskCardView, index: number) => ReactNode
  /** The groups of the list, drawn as containers around their cards. */
  groups?: readonly BoardGroup[]
  /** Draws a container; a plain one when left out. */
  renderGroup?: RenderGroup
  /** What Focus now does; the focus mode itself comes with `foco-e-sons`. */
  onFocusNow?: () => void
  /** Opens the focus screen without starting the timer; only the desktop app offers it (#14). */
  onOpenFocus?: () => void
  className?: string
}

/** One of the three pending columns: Backlog, This week or Today. */
export function BoardColumn({
  column,
  view,
  listId,
  canWrite,
  renderTask,
  groups = [],
  renderGroup = plainGroup,
  onFocusNow,
  onOpenFocus,
  className,
}: BoardColumnProps) {
  const { t, i18n } = useTranslation()
  const hasProgress = view.done !== undefined && view.total !== undefined
  const done = view.done ?? 0
  const total = view.total ?? 0
  const percent = total > 0 ? Math.round((done / total) * 100) : 0
  const empty = view.tasks.length === 0
  // A reminder has no focus (REM-05): a Today with only reminders has nothing to focus on.
  const nothingToFocus = !view.tasks.some((task) => task.kind !== 'reminder')

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

      {column === 'today' && (
        // Sticks to the top of the scrolling page while the tasks of Today pass under it; the page bar of
        // the narrow layout (h-14, below lg) sits above it. Opaque, as the column's own background.
        <div
          data-slot="focus-buttons"
          className="sticky top-14 z-10 -mx-4 bg-background lg:top-0"
        >
          <div className="flex items-center gap-2 bg-card/50 px-4 py-2">
            <Button className="flex-1" variant="outline" disabled={!canWrite || nothingToFocus} onClick={onFocusNow}>
              <Rocket size={16} /> {t('board.focusNow')}
            </Button>
            {isDesktop() && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="size-9"
                      aria-label={t('board.openFocus')}
                      disabled={!canWrite || nothingToFocus}
                      onClick={onOpenFocus}
                    >
                      <Eye size={16} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{t('board.openFocus')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">{columnCards(view.tasks, groups, renderTask, renderGroup)}</div>

      {canWrite && <AddTaskForm listId={listId} column={column} />}

      {empty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-10 text-sm font-medium text-muted-foreground">
          <CircleCheck size={24} className="text-primary" aria-hidden />
          {t('board.allClear')}
        </div>
      )}

    </section>
  )
}

interface DoneColumnProps {
  done: Board['columns']['done']
  renderTask: (task: TaskCardView, index: number) => ReactNode
  groups?: readonly BoardGroup[]
  renderGroup?: RenderGroup
  className?: string
}

/** Concluídas: today and the last earlier day with completions, grouped by day. */
export function DoneColumn({ done, renderTask, groups = [], renderGroup = plainGroup, className }: DoneColumnProps) {
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
            {columnCards(day.tasks, groups, renderTask, renderGroup)}
          </div>
        )
      })}
    </section>
  )
}
