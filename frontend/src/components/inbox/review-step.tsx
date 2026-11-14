import { useTranslation } from 'react-i18next'
import { Bell, CheckCheck, CheckSquare, FolderKanban, SkipForward, Trash2 } from 'lucide-react'

import { todayInTimezone } from '@/lib/date-utils'
import { targetColumn } from '@/lib/inbox/decision'
import { cn } from '@/lib/utils'
import { formatDuration } from '@/components/board/format-duration'
import { PriorityIcon } from '@/components/board/priority'
import { Button } from '@/components/ui/button'
import type { Decision, InboxItem, ListCard, TaskColumn } from '@/types'

/** Why a draft cannot be sent (ALL-07, EDGE-02). */
export type CommitRefusal = 'list_archived' | 'list_read_only' | 'list_not_found' | 'name_too_long' | 'already_processed'

const COLUMN_ORDER: TaskColumn[] = ['backlog', 'this_week', 'today', 'done']

/** The column a draft goes to: `Já fiz` to Concluídas, a group to its chosen column or the Backlog, the rest by the schedule (PROC-03). */
function draftColumn(decision: Exclude<Decision, { type: 'discard' }>, today: string): TaskColumn {
  if (decision.type === 'done') return 'done'
  if (decision.type === 'group') return decision.column ?? 'backlog'
  return targetColumn(decision.scheduled_on, today, decision.column)
}

/** The minutes a draft adds to its column: the task's estimate, or the sum of the group's tasks. */
function draftMinutes(decision: Decision): number {
  if (decision.type === 'task') return decision.estimate_minutes ?? 0
  if (decision.type === 'group') return decision.tasks.reduce((sum, task) => sum + (task.estimate_minutes ?? 0), 0)
  return 0
}

const KIND_ICON = { task: CheckSquare, reminder: Bell, group: FolderKanban, done: CheckCheck, discard: Trash2, skipped: SkipForward }

/**
 * The review of Processar tudo (ALL-04, ALL-05, ALL-07, ALL-08): each decided item with its type, name, priority
 * and destination, what each list gains per column with the sum of the estimates, and the confirmation.
 */
export function ReviewStep({
  items,
  lists,
  timeZone,
  refusals,
  pending,
  onEdit,
  onConfirm,
  onLater,
}: {
  /** Atuais as it stands: the items with a draft are sent, the others stay in the inbox. */
  items: InboxItem[]
  lists: ListCard[]
  timeZone: string | undefined
  refusals: Record<string, CommitRefusal>
  pending: boolean
  onEdit: (id: string) => void
  onConfirm: (ids: string[]) => void
  onLater: () => void
}) {
  const { t, i18n } = useTranslation()
  const today = todayInTimezone(timeZone)
  const listName = (id: string) => lists.find((list) => list.id === id)?.name ?? '—'
  const decided = items.filter((item) => item.draft !== null)
  const duration = (minutes: number) => formatDuration(minutes * 60, i18n.language)

  // What each list gains, per column (ALL-04).
  const gains = new Map<string, Map<TaskColumn, { count: number; minutes: number }>>()
  for (const item of decided) {
    const decision = item.draft!
    if (decision.type === 'discard') continue
    const columns = gains.get(decision.list_id) ?? new Map()
    const column = draftColumn(decision, today)
    const current = columns.get(column) ?? { count: 0, minutes: 0 }
    columns.set(column, { count: current.count + 1, minutes: current.minutes + draftMinutes(decision) })
    gains.set(decision.list_id, columns)
  }

  return (
    <div className="flex min-h-0 flex-col">
      <div className="px-6 pb-4">
        <h2 className="text-lg font-semibold">{t('process.review.title')}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t('process.review.hint')}</p>
        {Object.keys(refusals).length > 0 && (
          <p role="alert" className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {t('process.review.refused')}
          </p>
        )}
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-4 overflow-y-auto px-6 pb-5 md:grid-cols-[1fr_16rem]">
        <ol aria-label={t('process.review.title')} className="flex flex-col gap-2">
          {items.map((item, index) => {
            const decision = item.draft
            const kind = decision ? decision.type : 'skipped'
            const Icon = KIND_ICON[kind]
            const name = decision && decision.type !== 'discard' ? (decision.name ?? item.text) : item.text
            const destination = !decision
              ? t('process.review.staysInInbox')
              : decision.type === 'discard'
                ? t('process.review.trash')
                : `${listName(decision.list_id)} › ${t(`board.columns.${draftColumn(decision, today)}`)}`
            const refusal = refusals[item.id]
            return (
              <li
                key={item.id}
                className={cn(
                  'relative flex items-start gap-3 rounded-xl border px-3 py-2.5',
                  refusal ? 'border-destructive' : 'border-border',
                  !decision && 'bg-transparent opacity-70',
                )}
              >
                <span className="w-4 pt-0.5 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                <Icon size={16} aria-hidden className="mt-0.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm">
                    <span className="sr-only">{t(`process.review.kind_${kind}`)}:</span>
                    {decision && 'priority' in decision && decision.priority && <PriorityIcon priority={decision.priority} />}
                    <button
                      type="button"
                      onClick={() => onEdit(item.id)}
                      aria-label={t('process.review.edit', { name })}
                      className={cn(
                        'truncate text-left font-medium hover:underline after:absolute after:inset-0',
                        decision?.type === 'discard' && 'text-muted-foreground line-through',
                      )}
                    >
                      {name}
                    </button>
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                    <span aria-hidden>{t(`process.review.kind_${kind}`)}</span>
                    <span aria-hidden>·</span>
                    <span>{destination}</span>
                    {decision?.type === 'group' && <span>· {t('process.review.groupTasks', { count: decision.tasks.length })}</span>}
                    {decision && draftMinutes(decision) > 0 && <span>· {duration(draftMinutes(decision))}</span>}
                  </p>
                  {refusal && <p className="mt-1 text-xs font-medium text-destructive">{t(`process.review.reason.${refusal}`)}</p>}
                </div>
              </li>
            )
          })}
        </ol>

        <aside aria-labelledby="review-by-list" className="flex flex-col gap-3 rounded-xl bg-muted/50 p-3">
          <h3 id="review-by-list" className="text-xs font-semibold text-muted-foreground">
            {t('process.review.byList')}
          </h3>
          {[...gains.entries()].map(([listId, columns]) => (
            <section key={listId} aria-label={listName(listId)} className="flex flex-col gap-1 text-sm">
              <p className="font-medium">{listName(listId)}</p>
              {COLUMN_ORDER.filter((column) => columns.has(column)).map((column) => {
                const gain = columns.get(column)!
                return (
                  <p key={column} data-column={column} className="flex gap-2 text-xs">
                    <span className="flex-1 text-muted-foreground">{t(`board.columns.${column}`)}</span>
                    <span>{t('process.review.gains', { count: gain.count })}</span>
                    <span className="w-14 text-right font-mono tabular-nums">{gain.minutes > 0 ? duration(gain.minutes) : '—'}</span>
                  </p>
                )
              })}
            </section>
          ))}
        </aside>
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
        <span className="flex-1" />
        <Button type="button" variant="ghost" onClick={onLater}>
          {t('process.review.later')}
        </Button>
        <Button type="button" disabled={decided.length === 0 || pending} onClick={() => onConfirm(decided.map((item) => item.id))}>
          {t('process.review.confirm', { count: decided.length })}
        </Button>
      </footer>
    </div>
  )
}
