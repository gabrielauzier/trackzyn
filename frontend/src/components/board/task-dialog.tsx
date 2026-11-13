import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CalendarX, Flag, Repeat, Trash2, UserRound, X } from 'lucide-react'
import { groups as groupsApi, tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { DURATION_ERROR_KEY, parseDuration, toDuration } from '@/components/board/estimate'
import { NoteEditor } from '@/components/board/note-editor'
import { PrioritySelect } from '@/components/board/priority'
import { SubtaskList } from '@/components/board/subtask-list'
import { useTask } from '@/components/board/use-task'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { DurationInput } from '@/components/ui/duration-input'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { SchedulePicker } from '@/components/schedule/schedule-picker'
import { SeriesScopeDialog } from '@/components/schedule/series-scope-dialog'
import { asksSeriesScope, longDay, recurrenceSummary, type ScheduleChangeFields } from '@/lib/schedule'
import type { Priority, SeriesScope, Task } from '@/types'

const NOTES_MAX = 10_000
const FLAG_REASON_MAX = 200
const WAITING_FOR_MAX = 100
/** The `Sem grupo` option of the Grupo select. */
const NO_GROUP = 'none'

/** What `Salvar` sends: only the fields that changed (MODAL-05). */
type TaskChanges = Parameters<typeof tasksApi.update>[1]


interface TaskDialogProps {
  /** The task to show; null keeps the dialog closed. */
  taskId: string | null
  /** False for a `viewer`: the fields are read-only and nothing can be saved or deleted. */
  canWrite: boolean
  onClose: () => void
  /** The workspace's timezone, which decides today in the schedule picker. */
  timeZone?: string
}

export function TaskDialog({ taskId, canWrite, onClose, timeZone }: TaskDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={!!taskId} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('board.editTask')}</DialogTitle>
        </DialogHeader>
        {taskId && <TaskDetails taskId={taskId} canWrite={canWrite} onDone={onClose} timeZone={timeZone} />}
      </DialogContent>
    </Dialog>
  )
}

function TaskDetails({ taskId, canWrite, onDone, timeZone }: { taskId: string; canWrite: boolean; onDone: () => void; timeZone?: string }) {
  const { t } = useTranslation()
  const { data: task } = useTask(taskId)
  if (!task) return <Skeleton className="h-48 w-full" />
  return (
    <div className="min-w-0 space-y-4">
      {task.created_via && (
        <p className="truncate text-xs text-muted-foreground" title={t('board.createdVia', { name: task.created_via })}>
          {t('board.createdVia', { name: task.created_via })}
        </p>
      )}
      {/* Keyed by id so the form starts from this task's saved values. */}
      <TaskForm key={task.id} task={task} canWrite={canWrite} onDone={onDone} />
      <ScheduleField task={task} canWrite={canWrite} timeZone={timeZone} />
      {/* A reminder has no subtasks (MODAL-06). */}
      {task.kind !== 'reminder' && <SubtaskList taskId={task.id} canWrite={canWrite} />}
    </div>
  )
}

function TaskForm({ task, canWrite, onDone }: { task: Task; canWrite: boolean; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const schema = z.object({
    title: z.string().trim().min(1, t('board.titleRequired')).max(255, t('board.titleTooLong')),
    // HH:MM, from 00:01 to 24:00 with minutes up to 59; empty for no estimate.
    estimate: z.string().superRefine((value, ctx) => {
      const parsed = parseDuration(value)
      if ('error' in parsed) ctx.addIssue({ code: 'custom', message: t(DURATION_ERROR_KEY[parsed.error]) })
    }),
    notes: z
      .string()
      .max(NOTES_MAX, t('board.notesTooLong', { max: NOTES_MAX.toLocaleString(i18n.language) })),
    priority: z.enum(['none', 'low', 'medium', 'high', 'ultra']),
    due_on: z.string(),
    group_id: z.string(),
    waiting: z.boolean(),
    waiting_for: z.string().max(WAITING_FOR_MAX, t('board.notesTooLong', { max: WAITING_FOR_MAX })),
    flagged: z.boolean(),
    flag_reason: z.string().max(FLAG_REASON_MAX, t('board.notesTooLong', { max: FLAG_REASON_MAX })),
  })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task.title,
      estimate: toDuration(task.estimate_minutes),
      notes: task.notes,
      priority: task.priority,
      due_on: task.due_on ?? '',
      group_id: task.group_id ?? NO_GROUP,
      waiting: task.waiting,
      waiting_for: task.waiting_for ?? '',
      flagged: task.flagged,
      flag_reason: task.flag_reason ?? '',
    },
  })
  const reminder = task.kind === 'reminder'
  const flagged = useWatch({ control: form.control, name: 'flagged' })
  const waiting = useWatch({ control: form.control, name: 'waiting' })
  // The groups of the task's list, for the Grupo select (MODAL-04).
  const { data: listGroups } = useQuery({
    queryKey: ['lists', task.list_id, 'groups'],
    queryFn: () => groupsApi.list(task.list_id),
    enabled: !reminder,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lists'] })

  const save = useMutation({
    mutationFn: (payload: TaskChanges) => tasksApi.update(task.id, payload),
    onSuccess: () => {
      void refresh()
      onDone()
    },
    onError: (e) => form.setError('root.server', { message: extractApiError(e, t('common.error')) }),
  })
  // An occurrence of a series is deleted with the scope chosen (US-12).
  const remove = useMutation({
    mutationFn: (scope?: SeriesScope) => (scope === undefined ? tasksApi.remove(task.id) : tasksApi.remove(task.id, scope)),
    onSuccess: () => {
      setConfirmDelete(false)
      void refresh()
      onDone()
    },
    onError: (e) => form.setError('root.server', { message: extractApiError(e, t('common.error')) }),
  })

  const onSubmit = (values: Values) => {
    // Only what changed goes to the server.
    const payload: TaskChanges = {}
    if (values.title !== task.title) payload.title = values.title
    const parsed = parseDuration(values.estimate)
    const estimate = 'minutes' in parsed ? parsed.minutes : task.estimate_minutes
    if (!reminder && estimate !== task.estimate_minutes) payload.estimate_minutes = estimate
    if (values.notes !== task.notes) payload.notes = values.notes
    if (values.priority !== task.priority) payload.priority = values.priority
    const dueOn = values.due_on || null
    if (dueOn !== task.due_on) payload.due_on = dueOn
    const groupId = values.group_id === NO_GROUP ? null : values.group_id
    if (!reminder && groupId !== task.group_id) payload.group_id = groupId
    // Turning Aguardando or the flag off clears its text on the server (WAIT-05, FLAG-04).
    if (values.waiting !== task.waiting) payload.waiting = values.waiting
    const waitingFor = values.waiting_for.trim() || null
    if (values.waiting && waitingFor !== task.waiting_for) payload.waiting_for = waitingFor
    if (values.flagged !== task.flagged) payload.flagged = values.flagged
    const flagReason = values.flag_reason.trim() || null
    if (values.flagged && flagReason !== task.flag_reason) payload.flag_reason = flagReason
    if (Object.keys(payload).length === 0) onDone()
    else save.mutate(payload)
  }

  const serverError = form.formState.errors.root?.server?.message

  return (
    <Form {...form}>
      <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('board.taskTitle')}</FormLabel>
              <FormControl>
                <Input disabled={!canWrite} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {flagged ? (
          <div className="space-y-2 rounded-lg border border-rose-600 p-3">
            <div className="flex items-center gap-2">
              <Flag size={14} aria-hidden className="fill-current text-rose-500" />
              <span className="flex-1 text-sm font-medium">{t('board.flag')}</span>
              {canWrite && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    form.setValue('flagged', false)
                    form.setValue('flag_reason', '')
                  }}
                >
                  {t('board.flagRemove')}
                </Button>
              )}
            </div>
            <FormField
              control={form.control}
              name="flag_reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">{t('board.flagReason')}</FormLabel>
                  <FormControl>
                    <Input disabled={!canWrite} placeholder={t('board.flagReasonPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            {canWrite && (
              <Button type="button" variant="outline" size="sm" className="border-dashed" onClick={() => form.setValue('flagged', true)}>
                <Flag size={14} aria-hidden className="text-rose-500" />
                {t('board.flagAdd')}
              </Button>
            )}
            <span className="text-xs text-muted-foreground">{t('board.flagHint')}</span>
          </div>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="priority"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('board.cardFields.priority')}</FormLabel>
                <FormControl>
                  <PrioritySelect
                    aria-label={t('board.cardFields.priority')}
                    value={field.value}
                    onChange={(next: Priority) => field.onChange(next)}
                    disabled={!canWrite}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          {!reminder && (
            <FormField
              control={form.control}
              name="estimate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('board.estimate')}</FormLabel>
                  <FormControl>
                    <DurationInput variant="field" disabled={!canWrite} {...field} />
                  </FormControl>
                  <FormDescription>{t('board.estimateHint')}</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
          <FormField
            control={form.control}
            name="due_on"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('board.due')}</FormLabel>
                <FormControl>
                  <Input type="date" disabled={!canWrite} {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          {!reminder && (
            <FormField
              control={form.control}
              name="group_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('board.group')}</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange} disabled={!canWrite || !listGroups}>
                    <FormControl>
                      <SelectTrigger aria-label={t('board.group')} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={NO_GROUP}>{t('board.noGroup')}</SelectItem>
                      {listGroups?.map((group) => (
                        <SelectItem key={group.id} value={group.id}>
                          {group.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormItem>
              )}
            />
          )}
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <UserRound size={15} aria-hidden className="text-primary" />
            <span id={`waiting-${task.id}`} className="flex-1 text-sm font-medium">
              {t('board.waitingSwitch')}
            </span>
            <Switch
              aria-labelledby={`waiting-${task.id}`}
              checked={waiting}
              disabled={!canWrite}
              onCheckedChange={(on) => {
                form.setValue('waiting', on)
                if (!on) form.setValue('waiting_for', '')
              }}
            />
          </div>
          {waiting && (
            <FormField
              control={form.control}
              name="waiting_for"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="sr-only">{t('board.waitingForField')}</FormLabel>
                  <FormControl>
                    <Input disabled={!canWrite} placeholder={t('board.waitingForPlaceholder')} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('board.notes')}</FormLabel>
              <FormControl>
                <NoteEditor
                  value={field.value}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  editable={canWrite}
                  aria-label={t('board.notes')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        {canWrite && (
          <DialogFooter className="sm:justify-between">
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 size={14} /> {t('board.deleteTask')}
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onDone}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {t('common.save')}
              </Button>
            </div>
          </DialogFooter>
        )}
      </form>
      {task.series ? (
        <SeriesScopeDialog
          open={confirmDelete}
          variant="delete"
          title={task.title}
          nextOn={task.series.next_on}
          isPending={remove.isPending}
          onCancel={() => setConfirmDelete(false)}
          onChoose={(scope) => remove.mutate(scope)}
        />
      ) : (
        <DeleteConfirmationDialog
          open={confirmDelete}
          title={t('board.deleteTask')}
          description={t('board.deleteTaskDescription', { title: task.title })}
          isPending={remove.isPending}
          onClose={() => setConfirmDelete(false)}
          onConfirm={() => remove.mutate(undefined)}
        />
      )}
    </Form>
  )
}

/** `HH:MM` plus `minutes`, around the clock. */
function endOf(start: string, minutes: number): string {
  const [hours, mins] = start.split(':').map(Number)
  const total = (hours! * 60 + mins! + minutes) % (24 * 60)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

type ScheduleChange = ScheduleChangeFields & { scope?: SeriesScope }

/**
 * `Agendamento` (US-2): `Sem agendamento`, `Qui, 12 nov` or `Qui, 12 nov · 10:00 – 12:00 · ↻ toda quinta`, the end
 * from the estimate or one hour with `+1h` when there is none (D7, D23), with the picker, `Limpar hora`, which
 * keeps the day, and `Remover agendamento`, which clears both. Each saves at once.
 */
function ScheduleField({ task, canWrite, timeZone }: { task: Task; canWrite: boolean; timeZone?: string }) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const queryClient = useQueryClient()
  const [picking, setPicking] = useState(false)
  /** A new day or time of an occurrence of a series, waiting for `Só esta` or `Esta e as próximas` (US-12). */
  const [scoping, setScoping] = useState<ScheduleChange | null>(null)
  const save = useMutation({
    mutationFn: (change: ScheduleChange) => tasksApi.update(task.id, change),
    onSuccess: () => {
      setPicking(false)
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })
  // The question takes the place of the picker; the picker closes once the change is saved.
  const change = (next: ScheduleChange) => {
    if (!asksSeriesScope(task, next)) return save.mutate(next)
    setPicking(false)
    setScoping(next)
  }

  const day = task.scheduled_on
  const time = task.scheduled_time
  let text = t('schedule.notScheduled')
  if (day !== null) {
    const date = longDay(day, t, language)
    text = date.charAt(0).toLocaleUpperCase() + date.slice(1)
    if (time !== null) {
      text += ` · ${time} – ${endOf(time, task.estimate_minutes ?? 60)}`
      if (task.estimate_minutes === null) text += ` ${t('schedule.oneHourDefault')}`
    }
  }
  const rule = task.series ? recurrenceSummary(task.series.rule, t, language) : null

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">{t('schedule.field')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <p data-testid="schedule-text" className="text-sm">
          {text}
          {rule && (
            <span className="text-muted-foreground">
              {' · '}
              <Repeat size={12} role="img" aria-label={t('schedule.repeatIcon')} className="inline align-[-1px]" />{' '}
              {rule.charAt(0).toLocaleLowerCase() + rule.slice(1)}
            </span>
          )}
        </p>
        {canWrite && (
          <div className="flex flex-wrap gap-1">
            <Popover open={picking} onOpenChange={setPicking}>
              <PopoverTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <CalendarClock size={14} /> {day === null ? t('schedule.menu') : t('schedule.change')}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto">
                <SchedulePicker
                  value={{ on: day, time, recurrence: task.series?.rule ?? null }}
                  timeZone={timeZone}
                  pending={save.isPending}
                  onCancel={() => setPicking(false)}
                  onSubmit={(value) => {
                    const picked: ScheduleChange = { scheduled_on: value.on, scheduled_time: value.time }
                    if (JSON.stringify(value.recurrence) !== JSON.stringify(task.series?.rule ?? null)) picked.recurrence = value.recurrence
                    change(picked)
                  }}
                />
              </PopoverContent>
            </Popover>
            {time !== null && (
              <Button type="button" variant="ghost" size="sm" onClick={() => change({ scheduled_time: null })}>
                <X size={14} /> {t('schedule.clearTime')}
              </Button>
            )}
            {day !== null && (
              <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => save.mutate({ scheduled_on: null })}>
                <CalendarX size={14} /> {t('schedule.remove')}
              </Button>
            )}
          </div>
        )}
      </div>
      <SeriesScopeDialog
        open={scoping !== null}
        variant="move"
        onCancel={() => setScoping(null)}
        onChoose={(scope) => {
          if (scoping) save.mutate({ ...scoping, scope })
          setScoping(null)
        }}
      />
      {save.isError && (
        <p role="alert" className="text-sm text-destructive">
          {extractApiError(save.error, t('common.error'))}
        </p>
      )}
    </div>
  )
}
