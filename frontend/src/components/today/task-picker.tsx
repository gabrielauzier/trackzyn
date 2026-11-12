import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { groupPending } from '@/lib/today/rules'
import type { TodayPendingTask } from '@/types'
import { TaskTile } from './task-tile'

interface TaskPickerProps {
  /** The trigger's text: `Outra tarefa` or `Escolher tarefa`. */
  label: string
  pending: TodayPendingTask[]
  nowMinute: number
  onPick: (task: TodayPendingTask) => void
  variant?: 'default' | 'outline'
}

/** A popover with the tasks of `Pendente`, in the order of its groups, searchable by title (HOJE-15). */
export function TaskPicker({ label, pending, nowMinute, onPick, variant = 'outline' }: TaskPickerProps) {
  const { t } = useTranslation()
  const [open, setOpenState] = useState(false)
  const [query, setQuery] = useState('')
  const setOpen = (next: boolean) => {
    setOpenState(next)
    if (!next) setQuery('')
  }
  const needle = query.trim().toLocaleLowerCase()
  const tasks = groupPending(pending, nowMinute)
    .flatMap((group) => group.tasks)
    .filter((task) => task.title.toLocaleLowerCase().includes(needle))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant}>{label}</Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-2">
        <Input aria-label={t('today.picker.search')} placeholder={t('today.picker.search')} value={query} onChange={(event) => setQuery(event.target.value)} />
        {tasks.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{t('today.picker.empty')}</p>
        ) : (
          <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
            {tasks.map((task) => (
              <li key={task.id}>
                <TaskTile
                  variant="pending"
                  title={task.title}
                  list={task.list}
                  estimateMinutes={task.estimate_minutes}
                  onOpen={() => {
                    setOpen(false)
                    onPick(task)
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
