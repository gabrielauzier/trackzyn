import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { SessionTaskPicker } from '@/components/agenda/session-task-picker'
import { SchedulePicker, type ScheduleValue } from '@/components/schedule/schedule-picker'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { minuteClock } from '@/lib/agenda/format'
import { longDay } from '@/lib/schedule'
import type { AgendaTask, ListCard } from '@/types'

/** What was scheduled: the task and where it went. */
export interface NewSchedule {
  taskId: string
  title: string
  day: string
  time: string | null
}

interface NewSchedulePanelProps {
  /** The day of the window, or of the toolbar button: today, or the day shown in the day view. */
  day: string
  /** The window selected on the grid, in minutes since the local midnight of `day`; null from the toolbar button. */
  window: { start: number; end: number } | null
  timeZone: string
  /** The active lists: the search groups by them, and a new task goes to the Backlog of one (D12). */
  lists: ListCard[]
  /** The list a new task goes to unless another is chosen: the filter's, or the first active list. */
  defaultListId: string | null
  onCancel: () => void
  onSaved: (schedule: NewSchedule) => void
  now?: Date
}

/**
 * The `Novo agendamento` panel (US-8): the day and the window selected, the search of the pending tasks of the
 * workspace with `Criar tarefa "<busca>" e agendar`, which creates the task in the Backlog of the chosen list (D12),
 * and the picker of the day, the time and the repetition. A task without an estimate takes the length of the window
 * as its estimate; one with an estimate keeps it (D11). A task already scheduled has its schedule replaced.
 */
export function NewSchedulePanel({ day, window, timeZone, lists, defaultListId, onCancel, onSaved, now }: NewSchedulePanelProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const queryClient = useQueryClient()
  const [picked, setPicked] = useState<AgendaTask | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  /** The title of the task to create, once `Criar tarefa` is chosen; null while a task is picked or none is. */
  const [newTitle, setNewTitle] = useState<string | null>(null)
  const [listId, setListId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const chosen = useQuery({ queryKey: ['task', picked?.id], queryFn: () => tasksApi.get(picked!.id), enabled: picked !== null })
  const fallbackList = lists.some((list) => list.id === defaultListId) ? defaultListId : (lists[0]?.id ?? null)
  const listOfNew = listId ?? fallbackList

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Esc closes the search first, not the panel under it.
      if (event.key === 'Escape' && !pickerOpen) onCancel()
    }
    globalThis.addEventListener('keydown', onKey)
    return () => globalThis.removeEventListener('keydown', onKey)
  }, [onCancel, pickerOpen])

  const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)
  const windowMinutes = window ? window.end - window.start : null

  const save = async (value: ScheduleValue) => {
    if (value.on === null) return
    const title = newTitle?.trim() ?? ''
    if (newTitle !== null ? title === '' || listOfNew === null : picked === null) {
      setError(t('agenda.newSchedule.chooseTask'))
      return
    }
    // The window becomes the estimate only of a task without one, and only when the task keeps a time (D11).
    const estimate = value.time !== null ? windowMinutes : null
    setSaving(true)
    setError(null)
    try {
      let saved: NewSchedule
      if (newTitle !== null) {
        const created = await tasksApi.create({
          list_id: listOfNew!,
          title,
          estimate_minutes: estimate,
          column: 'backlog',
          scheduled_on: value.on,
          scheduled_time: value.time,
        })
        if (value.recurrence !== null) await tasksApi.update(created.id, { recurrence: value.recurrence })
        saved = { taskId: created.id, title: created.title, day: value.on, time: value.time }
      } else {
        const task = chosen.data ?? (await tasksApi.get(picked!.id))
        await tasksApi.update(task.id, {
          scheduled_on: value.on,
          scheduled_time: value.time,
          ...(task.estimate_minutes === null && estimate !== null ? { estimate_minutes: estimate } : {}),
          ...(value.recurrence !== null ? { recurrence: value.recurrence } : {}),
        })
        saved = { taskId: task.id, title: task.title, day: value.on, time: value.time }
      }
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
      onSaved(saved)
    } catch (failure) {
      setError(extractApiError(failure, t('common.error')))
    } finally {
      setSaving(false)
    }
  }

  const scheduledOn = chosen.data?.scheduled_on ?? null

  return (
    <aside aria-labelledby="new-schedule-title" className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4 lg:w-80">
      <div className="flex flex-col gap-1">
        <h2 id="new-schedule-title" className="text-base font-semibold">
          {t('agenda.newSchedule.title')}
        </h2>
        {window && (
          <p data-testid="new-schedule-window" className="text-sm tabular-nums text-muted-foreground">
            {`${capitalize(longDay(day, t, language))} · ${t('agenda.range', { start: minuteClock(window.start), end: minuteClock(window.end) })}`}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t('agenda.panel.task')}</Label>
        <SessionTaskPicker
          value={newTitle === null ? picked : null}
          lists={lists}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          pendingOnly
          createLabel={(query) => (query ? t('agenda.newSchedule.createNamed', { title: query }) : t('agenda.newSchedule.create'))}
          onChange={(task) => {
            setPicked(task)
            setNewTitle(null)
            setError(null)
          }}
          onCreate={(title) => {
            setPickerOpen(false)
            setPicked(null)
            setNewTitle(title)
            setError(null)
          }}
        />
        {picked && scheduledOn !== null && newTitle === null && (
          <p className="text-xs text-muted-foreground">{t('agenda.newSchedule.replaces', { day: longDay(scheduledOn, t, language) })}</p>
        )}
      </div>

      {newTitle !== null && (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-schedule-task-title">{t('agenda.newSchedule.taskTitle')}</Label>
            <Input id="new-schedule-task-title" autoFocus value={newTitle} onChange={(event) => setNewTitle(event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label id="new-schedule-list-label">{t('agenda.newTask.list')}</Label>
            <Select value={listOfNew ?? ''} onValueChange={setListId}>
              <SelectTrigger aria-labelledby="new-schedule-list-label" className="w-full">
                <SelectValue placeholder={t('agenda.panel.chooseList')} />
              </SelectTrigger>
              <SelectContent>
                {lists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t('agenda.newSchedule.backlogHint')}</p>
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <SchedulePicker
        value={{ on: day, time: window ? minuteClock(window.start) : null, recurrence: null }}
        timeZone={timeZone}
        now={now}
        pending={saving}
        onCancel={onCancel}
        onSubmit={(value) => void save(value)}
      />
    </aside>
  )
}
