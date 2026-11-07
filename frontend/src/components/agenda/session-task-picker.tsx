import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Plus, Search, X } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { sessions as sessionsApi } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { AgendaTask, ListCard, RecentAgendaTask } from '@/types'

/** How long the search waits after the last key before it asks (PICK-08). */
export const SEARCH_DEBOUNCE_MS = 300

interface SessionTaskPickerProps {
  /** The task chosen for the session, or null. */
  value: AgendaTask | null
  /** The active lists, in their order: the groups follow it (PICK-07). */
  lists: ListCard[]
  onChange: (task: RecentAgendaTask) => void
  /** Opens the new task modal with this title: the search text, or empty (PICK-12). */
  onCreate: (title: string) => void
  /** The popover's state, when the panel drives it (it closes it for the modal and opens it again on Cancel). */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Offers only the pending tasks, as `Novo agendamento` does (US-8); Done is offered otherwise. */
  pendingOnly?: boolean
  /** The text of the create option for the search text; `Criar nova tarefa` or `Criar "<busca>"` otherwise. */
  createLabel?: (query: string) => string
}

/** `title` with the first match of `query` wrapped in `<mark>`, ignoring case (PICK-08). */
function Highlighted({ title, query }: { title: string; query: string }) {
  const at = query ? title.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1
  if (at < 0) return <>{title}</>
  return (
    <>
      {title.slice(0, at)}
      <mark className="rounded-sm bg-primary/15 px-px text-inherit">{title.slice(at, at + query.length)}</mark>
      {title.slice(at + query.length)}
    </>
  )
}

/**
 * The task field of a new session (PICK-06 to PICK-11): a popover with a search that asks 300 ms after the last key,
 * the 10 tasks updated last or the matches grouped by list, and `Criar nova tarefa` after them.
 */
export function SessionTaskPicker({
  value,
  lists,
  onChange,
  onCreate,
  open: openProp,
  onOpenChange: onOpenChangeProp,
  pendingOnly = false,
  createLabel,
}: SessionTaskPickerProps) {
  const { t } = useTranslation()
  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next)
    onOpenChangeProp?.(next)
  }
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  const query = text.trim()
  const settled = useDebouncedValue(query, SEARCH_DEBOUNCE_MS)
  const found = useQuery({
    queryKey: ['agenda-tasks', settled],
    queryFn: () => sessionsApi.searchTasks(settled),
    enabled: open,
  })
  const results = useMemo(() => (found.data?.tasks ?? []).filter((task) => !pendingOnly || task.column !== 'done'), [found.data, pendingOnly])
  // The groups follow the order of the lists; inside each, the order the API gave: the latest first (PICK-07).
  const groups = useMemo(
    () =>
      lists
        .map((list) => ({ list, tasks: results.filter((task) => task.list_id === list.id) }))
        .filter((group) => group.tasks.length > 0),
    [lists, results],
  )
  const searching = settled !== ''
  const empty = searching && found.isSuccess && results.length === 0

  const pick = (task: RecentAgendaTask) => {
    onChange(task)
    setOpen(false)
    setText('')
  }
  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) setText('')
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-haspopup="dialog"
          aria-label={t('agenda.panel.task')}
          className="flex h-9 w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 text-left text-sm shadow-xs data-[state=open]:border-primary"
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>{value?.title ?? t('agenda.panel.chooseTask')}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        aria-label={t('agenda.picker.tasks')}
        className="flex w-(--radix-popover-trigger-width) min-w-72 flex-col overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          input.current?.focus()
        }}
      >
        <div className="p-2 pb-1.5">
          <label className="flex h-9 items-center gap-2 rounded-md border bg-muted/40 px-2.5 focus-within:border-primary">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              ref={input}
              type="search"
              aria-label={t('agenda.picker.search')}
              placeholder={t('agenda.picker.search')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:hidden"
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
            {text && (
              <button
                type="button"
                aria-label={t('agenda.picker.clear')}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                onClick={() => {
                  setText('')
                  input.current?.focus()
                }}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </label>
        </div>
        {empty ? (
          <div className="flex flex-col items-center gap-1 px-5 py-7 text-center">
            <p className="text-sm font-medium">{t('agenda.picker.empty')}</p>
            <p className="text-xs text-muted-foreground">{t('agenda.picker.emptyHint', { query: settled })}</p>
          </div>
        ) : (
          <>
            <p className="px-4 pb-1.5 text-xs text-muted-foreground">
              {searching ? t('agenda.picker.results', { count: results.length, query: settled }) : t('agenda.picker.recent')}
            </p>
            <div role="listbox" aria-label={t('agenda.picker.tasks')} className="max-h-80 overflow-y-auto px-1.5 pb-1.5">
              {groups.map((group) => (
                <div key={group.list.id} role="group" aria-label={group.list.name}>
                  <div aria-hidden className="flex items-center gap-1.5 px-2.5 pt-2 pb-1 text-xs font-semibold text-muted-foreground">
                    <span className="size-2 rounded-sm" style={{ backgroundColor: `var(--chart-${group.list.color})` }} />
                    {group.list.name}
                  </div>
                  {group.tasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      role="option"
                      aria-selected={value?.id === task.id}
                      className={cn(
                        'flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-muted',
                        value?.id === task.id && 'bg-muted',
                      )}
                      onClick={() => pick(task)}
                    >
                      <span className="min-w-0 truncate">
                        <Highlighted title={task.title} query={settled} />
                      </span>
                      {task.column === 'done' && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t('agenda.picker.done')}</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
        <div className="border-t p-1.5">
          <button
            type="button"
            disabled={lists.length === 0}
            className={cn(
              'flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50',
              empty && 'bg-primary/10 text-primary hover:bg-primary/15',
            )}
            // The modal starts on the search text whenever there is one, with results or not (PICK-12).
            onClick={() => onCreate(query)}
          >
            <Plus className="size-4 shrink-0" aria-hidden />
            {createLabel ? createLabel(query) : empty ? t('agenda.picker.createNamed', { title: settled }) : t('agenda.picker.create')}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
