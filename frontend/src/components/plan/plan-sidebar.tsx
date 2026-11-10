import { useMemo, useState, type PointerEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Coffee, Plus, Search, Sparkles, Utensils } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { minuteClock } from '@/lib/agenda/format'
import { NewTaskCard } from '@/components/plan/new-task-card'
import type { DraftBlock, DropItem } from '@/lib/plan/draft'
import { cn } from '@/lib/utils'
import type { PlanCandidate, PlanListRef, PlanTaskRef } from '@/types'

/** The breaks ready to drop: `Café` 15 min and `Almoço` 1h (PLAN-14). */
const READY_BREAKS = [
  { key: 'coffee', minutes: 15, Icon: Coffee },
  { key: 'lunch', minutes: 60, Icon: Utensils },
] as const

const GROUPS = ['day', 'today', 'this_week', 'backlog'] as const
type Group = (typeof GROUPS)[number]

const ALL = 'all'

interface PlanSidebarProps {
  /** The day of the plan: its scheduled tasks come first (PLAN-02). */
  day: string
  candidates: PlanCandidate[]
  /** The blocks of the draft: their tasks show as planned. */
  blocks: DraftBlock[]
  /** The list of a new break's Intervalo: the first active list (PLAN-18); null, no break can be dropped. */
  breakList: PlanListRef | null
  /** Starts dragging a task or a break onto the grid (PLAN-04, PLAN-15); absent, nothing moves (PLAN-34). */
  onDragStart?: (event: PointerEvent, item: DropItem) => void
  /** Opens `Nova pausa` (PLAN-16). */
  onNewBreak?: () => void
  /**
   * `Encaixar` the marked tasks, in the order marked, into the draft (PLAN-32); gives back the ones that did not fit
   * (PLAN-33). Absent, nothing is marked.
   */
  onFit?: (tasks: PlanTaskRef[]) => PlanTaskRef[]
}

/** Where a task goes: its day when it is scheduled for the plan's day, else its column. */
const groupOf = (task: PlanCandidate, day: string): Group => (task.scheduled_on === day ? 'day' : task.column)

/** Lower case and without accents, so `cafe` finds `Café`. */
const fold = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase()

const taskRef = (task: PlanCandidate): PlanTaskRef => ({
  id: task.id,
  title: task.title,
  list: task.list,
  done: false,
  scheduled_on: task.scheduled_on,
  estimate_minutes: task.estimate_minutes,
})

/**
 * The side of the plan (PLAN-02, PLAN-14): the breaks `Café`, `Almoço` and `Nova pausa`, then the pending tasks in
 * `Agendadas para o dia`, `Hoje`, `Esta semana` and `Backlog`, with a search by title and a filter by list. A task
 * already in the draft shows `no plano HH:MM`, faded, and can still be dragged again.
 */
export function PlanSidebar({ day, candidates, blocks, breakList, onDragStart, onNewBreak, onFit }: PlanSidebarProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const [query, setQuery] = useState('')
  const [listId, setListId] = useState<string>(ALL)
  /** The marked tasks, in the order they were marked (PLAN-32). */
  const [marked, setMarked] = useState<string[]>([])
  /** How many of the last `Encaixar` did not fit (PLAN-33). */
  const [notFit, setNotFit] = useState(0)

  const toggle = (id: string) => {
    setNotFit(0)
    setMarked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }
  /** `Encaixar`: the tasks that fit go into the draft and leave the marks; the rest stay marked with the notice. */
  const fitMarked = () => {
    if (!onFit) return
    const byId = new Map(candidates.map((task) => [task.id, task]))
    const tasks = marked.flatMap((id) => {
      const task = byId.get(id)
      return task ? [taskRef(task)] : []
    })
    const left = onFit(tasks)
    setMarked(left.map((task) => task.id))
    setNotFit(left.length)
  }

  const lists = useMemo(() => {
    const byId = new Map<string, PlanListRef>()
    for (const task of candidates) if (!byId.has(task.list.id)) byId.set(task.list.id, task.list)
    return [...byId.values()]
  }, [candidates])

  // The first block of each task in the draft, by start.
  const plannedAt = useMemo(() => {
    const starts = new Map<string, number>()
    for (const block of blocks) {
      if (block.kind !== 'task') continue
      const known = starts.get(block.task.id)
      if (known === undefined || block.start < known) starts.set(block.task.id, block.start)
    }
    return starts
  }, [blocks])

  const groups = useMemo(() => {
    const needle = fold(query.trim())
    const shown = candidates.filter((task) => (listId === ALL || task.list.id === listId) && fold(task.title).includes(needle))
    return GROUPS.map((group) => ({ group, tasks: shown.filter((task) => groupOf(task, day) === group) })).filter(({ tasks }) => tasks.length > 0)
  }, [candidates, query, listId, day])

  return (
    <aside aria-label={t('plan.sidebar.label')} className="flex flex-col gap-4">
      {onDragStart && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('plan.sidebar.newTask')}</h2>
          {/* The list filtered on, else the first active list, as a break's (PLAN-48). */}
          <NewTaskCard list={lists.find((list) => list.id === listId) ?? breakList} onDragStart={onDragStart} />
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t('plan.sidebar.breaks')}</h2>
        <div className="flex flex-wrap gap-2">
          {READY_BREAKS.map(({ key, minutes, Icon }) => {
            const name = t(`plan.sidebar.${key}`)
            const usable = Boolean(onDragStart && breakList)
            return (
              <button
                key={key}
                type="button"
                data-break={key}
                disabled={!usable}
                className={cn(
                  'flex h-9 items-center gap-1.5 rounded-md border border-dashed border-muted-foreground/60 px-3 text-sm select-none disabled:opacity-50',
                  usable && 'cursor-grab',
                )}
                style={{ backgroundImage: 'repeating-linear-gradient(135deg, var(--muted) 0 6px, var(--border) 6px 8px)' }}
                onPointerDown={(event) => {
                  if (onDragStart && breakList) onDragStart(event, { kind: 'break', name, minutes, list: breakList })
                }}
              >
                <Icon aria-hidden size={14} />
                {name}{' '}
                <span className="text-muted-foreground">{formatDuration(minutes * 60, language)}</span>
              </button>
            )
          })}
          <Button type="button" variant="outline" size="sm" className="h-9" disabled={!onNewBreak} onClick={onNewBreak}>
            <Plus aria-hidden size={14} />
            {t('plan.sidebar.newBreak')}
          </Button>
        </div>
      </section>

      <div className="flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">{t('plan.sidebar.search')}</span>
          <Search aria-hidden size={14} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} placeholder={t('plan.sidebar.search')} className="pl-8" onChange={(event) => setQuery(event.target.value)} />
        </label>
        <Select value={listId} onValueChange={setListId}>
          <SelectTrigger aria-label={t('plan.sidebar.listFilter')} className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t('plan.sidebar.allLists')}</SelectItem>
            {lists.map((list) => (
              <SelectItem key={list.id} value={list.id}>
                {list.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {onFit && marked.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Button type="button" size="sm" onClick={fitMarked}>
            <Sparkles aria-hidden size={14} />
            {t('plan.sidebar.fit', { count: marked.length })}
          </Button>
          {notFit > 0 && (
            <p role="status" className="text-xs font-medium text-destructive">
              {t('plan.sidebar.notFit', { count: notFit })}
            </p>
          )}
        </div>
      )}

      {groups.length === 0 && <p className="text-sm text-muted-foreground">{t('plan.sidebar.empty')}</p>}
      {groups.map(({ group, tasks }) => (
        <section key={group} aria-labelledby={`plan-group-${group}`} className="flex flex-col gap-1.5">
          <h2 id={`plan-group-${group}`} className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {t(`plan.sidebar.groups.${group}`)}{' '}
            <span className="font-medium">{tasks.length}</span>
          </h2>
          <ul className="flex flex-col gap-1.5">
            {tasks.map((task) => {
              const planned = plannedAt.get(task.id)
              const meta = [task.list.name]
              if (task.scheduled_time) meta.push(task.scheduled_time)
              if (planned !== undefined) meta.push(t('plan.sidebar.planned', { time: minuteClock(planned) }))
              return (
                <li
                  key={task.id}
                  data-candidate={task.id}
                  data-planned={planned !== undefined || undefined}
                  className={cn(
                    'flex items-center gap-2.5 rounded-md border bg-card px-2.5 py-2 select-none',
                    onDragStart && 'cursor-grab',
                    planned !== undefined && 'bg-muted/50 opacity-60',
                  )}
                  onPointerDown={onDragStart && ((event) => onDragStart(event, { kind: 'task', task: taskRef(task) }))}
                >
                  {onFit && (
                    <input
                      type="checkbox"
                      aria-label={t('plan.sidebar.mark', { title: task.title })}
                      checked={marked.includes(task.id)}
                      className="size-4 shrink-0 cursor-pointer accent-(--primary)"
                      // Marking is not a drag.
                      onPointerDown={(event) => event.stopPropagation()}
                      onChange={() => toggle(task.id)}
                    />
                  )}
                  <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: `var(--chart-${task.list.color})` }} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm font-medium">{task.title}</span>
                    <span className="text-[11px] text-muted-foreground">{meta.join(' · ')}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] whitespace-nowrap tabular-nums text-muted-foreground">
                    {task.estimate_minutes === null ? t('plan.sidebar.noEstimate') : formatDuration(task.estimate_minutes * 60, language)}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </aside>
  )
}
