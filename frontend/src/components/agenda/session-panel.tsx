import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { NewSessionTaskDialog } from '@/components/agenda/new-session-task-dialog'
import { SessionTaskPicker } from '@/components/agenda/session-task-picker'

import { formatDuration } from '@/components/board/format-duration'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { lists as listsApi, sessions as sessionsApi } from '@/lib/api'
import { clockTime, minuteClock } from '@/lib/agenda/format'
import { DAY_MINUTES, dayOf, zonedInstant } from '@/lib/agenda/layout'
import { sessionErrorMessage, type SessionPreview } from '@/lib/agenda/use-agenda'
import { cn } from '@/lib/utils'
import type { AgendaSession, AgendaSessionInput, AgendaTask } from '@/types'

/** The day and the start and end of the session, in minutes since that day's local midnight. */
export interface PanelTimes {
  day: string
  start: number
  end: number
}

interface SessionPanelProps {
  times: PanelTimes
  /** A field changed the times; the draft on the grid follows (AGENDA-17). */
  onTimesChange: (times: PanelTimes) => void
  timezone: string
  now: Date
  /** The sessions already on the agenda, to warn about an overlap (AGENDA-19). */
  sessions: AgendaSession[]
  /** The list a break goes to unless another is chosen: the filter's, or the first active list. */
  defaultListId: string | null
  onCancel: () => void
  /** Records the session; a rejection is the API error, shown in the panel. */
  onSave: (input: AgendaSessionInput, preview: SessionPreview) => Promise<unknown>
  /** The session being edited (AGENDA-31); absent for a new one. Its kind stays, as the API keeps it. */
  editing?: AgendaSession
}

type Kind = 'task' | 'break'

interface TaskOption {
  id: string
  title: string
}

interface TaskGroup {
  list: { id: string; name: string; color: number }
  tasks: TaskOption[]
}

const parseTime = (value: string): number | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  return match ? Number(match[1]) * 60 + Number(match[2]) : null
}

/**
 * The `Nova sessão` panel (AGENDA-14 to AGENDA-26): a task of the active lists grouped by list, or a break
 * and its list; the date, start, end and duration; the overlap warning; `Cancelar` or Esc, and `Salvar`.
 */
export function SessionPanel({
  times,
  onTimesChange,
  timezone,
  now,
  sessions,
  defaultListId,
  onCancel,
  onSave,
  editing,
}: SessionPanelProps) {
  const { t, i18n } = useTranslation()
  const locale = i18n.language
  const [kind, setKind] = useState<Kind>(editing?.kind ?? 'task')
  const [taskId, setTaskId] = useState<string | null>(editing?.task_id ?? null)
  const [breakListId, setBreakListId] = useState<string | null>(editing?.kind === 'break' ? editing.list_id : null)
  // A new session picks its task in the picker, and can create it there (PICK-06, PICK-12); editing keeps the select.
  const [picked, setPicked] = useState<AgendaTask | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const active = useQuery({ queryKey: ['lists', { archived: false }], queryFn: () => listsApi.list({ archived: false }) })
  const activeLists = useMemo(() => active.data?.lists ?? [], [active.data])
  // Every task of the active lists, in any column, Done of any date included (AGENDA-16).
  const choices = useQuery({ queryKey: ['lists', 'session-tasks'], queryFn: () => sessionsApi.tasks() })
  const groups: TaskGroup[] = activeLists.map((list) => ({
    list,
    tasks: (choices.data?.tasks ?? []).filter((task) => task.list_id === list.id).map(({ id, title }) => ({ id, title })),
  }))
  // The task of an edited session stays among the choices even when it is no longer offered.
  if (editing?.kind === 'task' && editing.task_id && !groups.some((group) => group.tasks.some((task) => task.id === editing.task_id))) {
    const own = { id: editing.task_id, title: editing.task_title ?? '' }
    const group = groups.find((item) => item.list.id === editing.list_id)
    if (group) group.tasks = [...group.tasks, own]
    else groups.push({ list: { id: editing.list_id, name: editing.list_name, color: editing.list_color }, tasks: [own] })
  }
  const fallbackList = activeLists.some((list) => list.id === defaultListId) ? defaultListId : (activeLists[0]?.id ?? null)
  const listOfBreak = breakListId ?? fallbackList

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Esc closes the picker or the new task modal first, not the panel under them (PICK-19).
      if (event.key === 'Escape' && !pickerOpen && newTaskTitle === null) onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, pickerOpen, newTaskTitle])

  const startAt = zonedInstant(times.day, times.start, timezone)
  const endAt = zonedInstant(times.day, times.end, timezone)
  const seconds = Math.max(0, (endAt.getTime() - startAt.getTime()) / 1000)
  const overlap = sessions.find((session) => {
    if (session.id === editing?.id) return false
    const end = session.ended_at === null ? now.getTime() : Date.parse(session.ended_at)
    return Date.parse(session.started_at) < endAt.getTime() && end > startAt.getTime()
  })

  const change = (next: Partial<PanelTimes>) => {
    setError(null)
    onTimesChange({ ...times, ...next })
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const when = { started_at: startAt.toISOString(), ended_at: endAt.toISOString() }
    let input: AgendaSessionInput
    let preview: SessionPreview
    if (kind === 'task' && !editing) {
      // A new session takes the task the picker gave, a task just created included (PICK-16).
      if (!picked) return
      input = { kind: 'task', task_id: picked.id, ...when }
      preview = { task_title: picked.title, list_id: picked.list_id, list_name: picked.list_name, list_color: picked.list_color }
    } else if (kind === 'task') {
      const group = groups.find((item) => item.tasks.some((task) => task.id === taskId))
      const task = group?.tasks.find((item) => item.id === taskId)
      if (!group || !task) return
      input = { kind: 'task', task_id: task.id, ...when }
      preview = { task_title: task.title, list_id: group.list.id, list_name: group.list.name, list_color: group.list.color }
    } else {
      const list = activeLists.find((item) => item.id === listOfBreak)
      if (!list) return
      input = { kind: 'break', list_id: list.id, ...when }
      preview = { task_title: null, list_id: list.id, list_name: list.name, list_color: list.color }
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(input, preview)
    } catch (failure) {
      setError(sessionErrorMessage(failure, t))
    } finally {
      setSaving(false)
    }
  }

  const ready = kind === 'task' ? taskId !== null : listOfBreak !== null

  return (
    <aside aria-labelledby="session-panel-title" className="flex w-full flex-col gap-4 rounded-xl border bg-card p-4 lg:w-80">
      <h2 id="session-panel-title" className="text-base font-semibold">
        {t(editing ? 'agenda.panel.editTitle' : 'agenda.panel.newTitle')}
      </h2>
      <form className="flex flex-col gap-4" onSubmit={submit}>
        <div className={cn('grid grid-cols-2 gap-1 rounded-lg bg-muted p-1', editing && 'hidden')}>
          {(['task', 'break'] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={kind === option}
              className={cn(
                'rounded-md px-2 py-1 text-sm font-medium',
                kind === option ? 'bg-background shadow-sm' : 'text-muted-foreground',
              )}
              onClick={() => {
                setKind(option)
                setError(null)
              }}
            >
              {t(`agenda.panel.${option}`)}
            </button>
          ))}
        </div>

        {kind === 'task' ? (
          <div className="flex flex-col gap-1.5">
            <Label id="session-task-label">{t('agenda.panel.task')}</Label>
            {editing ? (
            <Select value={taskId ?? ''} onValueChange={(value) => setTaskId(value)}>
              <SelectTrigger aria-labelledby="session-task-label" className="w-full">
                <SelectValue placeholder={t('agenda.panel.chooseTask')} />
              </SelectTrigger>
              <SelectContent>
                {groups
                  .filter((group) => group.tasks.length > 0)
                  .map((group) => (
                    <SelectGroup key={group.list.id}>
                      <SelectLabel>{group.list.name}</SelectLabel>
                      {group.tasks.map((task) => (
                        <SelectItem key={task.id} value={task.id}>
                          {task.title}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  ))}
              </SelectContent>
            </Select>
            ) : (
              <SessionTaskPicker
                value={picked}
                lists={activeLists}
                open={pickerOpen}
                onOpenChange={setPickerOpen}
                onChange={(task) => {
                  setPicked(task)
                  setTaskId(task.id)
                  setError(null)
                }}
                onCreate={(title) => {
                  setPickerOpen(false)
                  setNewTaskTitle(title)
                }}
              />
            )}
            <NewSessionTaskDialog
              open={newTaskTitle !== null}
              onOpenChange={(open) => {
                if (open) return
                // Cancelled: back to the picker, its search kept (PICK-19).
                setNewTaskTitle(null)
                setPickerOpen(true)
              }}
              lists={activeLists}
              defaultListId={defaultListId}
              defaultTitle={newTaskTitle ?? ''}
              onCreated={(task) => {
                // The new task is the one of the session (PICK-16).
                const list = activeLists.find((item) => item.id === task.list_id)
                setPicked({ id: task.id, title: task.title, list_id: task.list_id, list_name: list?.name ?? '', list_color: list?.color ?? 1, column: 'done' })
                setTaskId(task.id)
                setNewTaskTitle(null)
                setError(null)
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label id="session-break-list-label">{t('agenda.panel.breakList')}</Label>
            {/* Mounted once the lists are in, so the chosen list is among its items from the start. */}
            <Select key={activeLists.length} value={listOfBreak ?? ''} onValueChange={(value) => setBreakListId(value)}>
              <SelectTrigger aria-labelledby="session-break-list-label" className="w-full">
                <SelectValue placeholder={t('agenda.panel.chooseList')} />
              </SelectTrigger>
              <SelectContent>
                {activeLists.map((list) => (
                  <SelectItem key={list.id} value={list.id}>
                    {list.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="session-date">{t('agenda.panel.date')}</Label>
          <Input
            id="session-date"
            type="date"
            value={times.day}
            onChange={(event) => event.target.value && change({ day: event.target.value })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-start">{t('agenda.panel.start')}</Label>
            <Input
              id="session-start"
              type="time"
              value={minuteClock(times.start)}
              onChange={(event) => {
                const minute = parseTime(event.target.value)
                if (minute !== null) change({ start: minute })
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="session-end">{t('agenda.panel.end')}</Label>
            <Input
              id="session-end"
              type="time"
              value={minuteClock(times.end % DAY_MINUTES)}
              onChange={(event) => {
                const minute = parseTime(event.target.value)
                // 00:00 as the end is the midnight that closes the day.
                if (minute !== null) change({ end: minute === 0 ? DAY_MINUTES : minute })
              }}
            />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('agenda.panel.duration')}: <span className="tabular-nums text-foreground">{formatDuration(seconds, locale)}</span>
        </p>

        {overlap && (
          <p role="status" className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            {t('agenda.panel.overlap', {
              title: overlap.kind === 'break' ? t('agenda.break') : overlap.task_title,
              start: clockTime(overlap.started_at, timezone),
              end: overlap.ended_at === null ? t('agenda.now') : clockTime(overlap.ended_at, timezone),
            })}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!ready || saving}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </aside>
  )
}

interface SessionDetailsProps {
  session: AgendaSession
  timezone: string
  now: Date
  onClose: () => void
  /** Opens the edit form; absent for a user who cannot write (AGENDA-44). */
  onEdit?: () => void
  /** Deletes the session once confirmed; absent for a user who cannot write (AGENDA-44). */
  onDelete?: () => void
  /** Goes back to the list of the joined block the session was chosen from (MERGE-33); absent otherwise. */
  onBack?: () => void
  /** The count of sessions of that block, for the way back. */
  groupCount?: number
}

/** `<weekday>, <day> <month> · HH:MM – HH:MM · <duration>` of a session (AGENDA-27). */
function sessionWhen(session: AgendaSession, timezone: string, now: Date, locale: string, t: TFunction): string {
  const start = new Date(session.started_at)
  const end = session.ended_at === null ? now : new Date(session.ended_at)
  const date = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${dayOf(start, timezone)}T00:00:00Z`),
  )
  const range = `${clockTime(start, timezone)} – ${session.ended_at === null ? t('agenda.now') : clockTime(end, timezone)}`
  const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
  return `${date} · ${range} · ${formatDuration(seconds, locale)}`
}

/**
 * The details of a session (AGENDA-27): the task (or `Intervalo`), the list, the day, times and duration,
 * where it was recorded, and `Editar`, `Excluir` with its confirmation (AGENDA-32) and `Fechar`. The
 * running session offers no edit nor delete, only the way to the focus (AGENDA-33).
 */
export function SessionDetails({ session, timezone, now, onClose, onEdit, onDelete, onBack, groupCount = 0 }: SessionDetailsProps) {
  const { t, i18n } = useTranslation()
  const [confirming, setConfirming] = useState(false)
  const running = session.ended_at === null
  const title = session.kind === 'break' ? t('agenda.break') : (session.task_title ?? '')
  const when = sessionWhen(session, timezone, now, i18n.language, t)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirming) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, confirming])

  return (
    <aside aria-labelledby="session-details-title" className="flex w-full flex-col gap-3 rounded-xl border bg-card p-4 lg:w-80">
      {onBack && (
        <button
          type="button"
          className="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          onClick={onBack}
        >
          {`‹ ${session.list_name} · ${t('agenda.sessionCount', { count: groupCount })}`}
        </button>
      )}
      <div className="flex flex-col gap-1">
        <h2 id="session-details-title" className="text-base font-semibold">
          {title}
        </h2>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(--chart-${session.list_color})` }} />
          {session.list_name}
        </p>
      </div>
      <p className="text-sm tabular-nums">{when}</p>
      <p className="text-xs text-muted-foreground">{t(`agenda.panel.origin.${session.origin}`)}</p>

      {running && (
        <div className="flex flex-col gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm">
          <p>{t('agenda.panel.running')}</p>
          <Link to={`/focus/${session.list_id}`} className="font-medium text-primary underline-offset-4 hover:underline">
            {t('agenda.panel.openFocus')}
          </Link>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {!running && onDelete && (
          <Button type="button" variant="outline" className="text-destructive" onClick={() => setConfirming(true)}>
            {t('common.delete')}
          </Button>
        )}
        {!running && onEdit && (
          <Button type="button" variant="outline" onClick={onEdit}>
            {t('agenda.panel.edit')}
          </Button>
        )}
        <Button type="button" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>

      {onDelete && (
        <DeleteConfirmationDialog
          open={confirming}
          title={t('agenda.panel.deleteTitle')}
          description={t('agenda.panel.deleteDescription', { title, when })}
          isPending={false}
          onClose={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            onDelete()
          }}
        />
      )}
    </aside>
  )
}
