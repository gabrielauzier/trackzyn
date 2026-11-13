import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckSquare, FolderKanban, X } from 'lucide-react'
import { toast } from 'sonner'

import { inbox as inboxApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { todayInTimezone } from '@/lib/date-utils'
import { inboxAge, inboxOrigin } from '@/lib/inbox/age'
import { parseTaskLine, targetColumn } from '@/lib/inbox/decision'
import { sendRefusal } from '@/lib/inbox/errors'
import { useWritableLists } from '@/lib/inbox/use-writable-lists'
import { cn } from '@/lib/utils'
import { DURATION_ERROR_KEY, parseDuration, toDuration } from '@/components/board/estimate'
import { PrioritySelect } from '@/components/board/priority'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { DurationInput } from '@/components/ui/duration-input'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Decision, InboxItem, Priority, TaskColumn } from '@/types'

type Kind = 'task' | 'reminder' | 'group'
type GroupTask = { title: string; estimate_minutes: number | null }

/** A task title holds 255 characters (PROC-01). */
const MAX_NAME = 255
/** The columns `Vai para` offers; Concluídas is reached by `Já fiz`. */
const COLUMNS: TaskColumn[] = ['backlog', 'this_week', 'today']

interface FormState {
  kind: Kind
  name: string
  listId: string
  priority: Priority
  dueOn: string
  estimate: string
  scheduledOn: string
  scheduledTime: string
  notes: string
  /** The column chosen in `Vai para`; null follows the schedule (PROC-04). */
  column: TaskColumn | null
  tasks: GroupTask[]
}

/** The form as it opens (PROC-01): a task named after the text, with the list and the estimate of the row. */
function initialForm(item: InboxItem): FormState {
  return {
    kind: 'task',
    name: item.text.slice(0, MAX_NAME),
    listId: item.list_id ?? '',
    priority: 'none',
    dueOn: '',
    estimate: toDuration(item.estimate_minutes),
    scheduledOn: '',
    scheduledTime: '',
    notes: '',
    column: null,
    tasks: [],
  }
}

/** The decision of a filled form; the column goes only when it was chosen (PROC-04). */
function decisionOf(form: FormState, estimateMinutes: number | null): Decision {
  const common = {
    name: form.name.trim(),
    list_id: form.listId,
    priority: form.priority,
    ...(form.column ? { column: form.column } : {}),
  }
  if (form.kind === 'group') {
    return { type: 'group', ...common, due_on: form.dueOn || null, tasks: form.tasks }
  }
  const schedule = {
    scheduled_on: form.scheduledOn || null,
    scheduled_time: form.scheduledOn && form.scheduledTime ? form.scheduledTime : null,
  }
  if (form.kind === 'reminder') return { type: 'reminder', ...common, ...schedule }
  return {
    type: 'task',
    ...common,
    ...schedule,
    due_on: form.dueOn || null,
    estimate_minutes: estimateMinutes,
    ...(form.notes.trim() ? { notes: form.notes } : {}),
  }
}

const KINDS: { kind: Kind; Icon: typeof Bell }[] = [
  { kind: 'task', Icon: CheckSquare },
  { kind: 'reminder', Icon: Bell },
  { kind: 'group', Icon: FolderKanban },
]

function Field({ label, htmlFor, required, children, hint }: { label: string; htmlFor: string; required?: boolean; children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
        {required && <span aria-hidden className="text-primary">*</span>}
      </Label>
      {children}
      {hint}
    </div>
  )
}

const Missing = ({ id, children }: { id: string; children: ReactNode }) => (
  <span id={id} className="text-xs text-destructive">
    {children}
  </span>
)

export interface ProcessFormProps {
  item: InboxItem
  timeZone: string | undefined
  /** The error of the last save, shown in the form with the values kept (PROC-08). */
  error: string | null
  pending: boolean
  onSave: (decision: Decision) => void
  onDone: (decision: Decision) => void
  onDiscard: () => void
  /** Offered in Processar tudo (ALL-03). */
  onSkip?: () => void
}

/**
 * The decision of one item (PROC-01 to PROC-07, REM-01, REM-02, GRP-02, GRP-03): a task, a reminder or a group,
 * with the list and the column it goes to; `Já fiz` and `Descartar` close it otherwise.
 */
export function ProcessForm({ item, timeZone, error, pending, onSave, onDone, onDiscard, onSkip }: ProcessFormProps) {
  const { t } = useTranslation()
  const lists = useWritableLists()
  const [form, setForm] = useState(() => initialForm(item))
  const [newTask, setNewTask] = useState('')
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((current) => ({ ...current, [key]: value }))

  const list = lists.find((candidate) => candidate.id === form.listId)
  const today = todayInTimezone(timeZone)
  const column = targetColumn(form.kind === 'group' ? null : form.scheduledOn, today, form.column)
  const name = form.name.trim()
  const nameError = name === '' ? 'process.nameMissing' : name.length > MAX_NAME ? 'process.nameTooLong' : null
  const estimate = form.kind === 'task' ? parseDuration(form.estimate) : { minutes: null }
  const estimateError = 'error' in estimate ? t(DURATION_ERROR_KEY[estimate.error]) : null
  const noFirstTask = form.kind === 'group' && form.tasks.length === 0
  const canDecide = !nameError && !!list
  const canSave = canDecide && !estimateError && !noFirstTask && !pending

  const save = () => {
    if (canSave) onSave(decisionOf(form, 'minutes' in estimate ? estimate.minutes : null))
  }
  const addTask = () => {
    if (!newTask.trim()) return
    set('tasks', [...form.tasks, parseTaskLine(newTask)])
    setNewTask('')
  }

  const nameLabel = form.kind === 'group' ? t('process.groupName') : t('process.name')
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
      className="flex min-h-0 flex-col"
    >
      <p className="border-b border-border px-6 pb-4 text-sm text-foreground">
        <span className="text-muted-foreground">
          {t('process.captured', { age: inboxAge(item.created_at, new Date(), timeZone, t), origin: inboxOrigin(item, t) })}
        </span>{' '}
        “{item.text}”
      </p>

      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-6 py-5">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-xs text-muted-foreground">{t('process.becomes')}</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {KINDS.map(({ kind, Icon }) => (
              <button
                key={kind}
                type="button"
                aria-pressed={form.kind === kind}
                onClick={() => set('kind', kind)}
                className={cn(
                  'flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors',
                  form.kind === kind ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent',
                )}
              >
                <Icon size={18} aria-hidden className={form.kind === kind ? 'text-primary' : 'text-muted-foreground'} />
                <span className="flex flex-col">
                  <span className="text-sm font-semibold">{t(`process.type_${kind}`)}</span>
                  <span className="text-xs text-muted-foreground">{t(`process.type_${kind}_hint`)}</span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_14rem]">
          <Field
            label={nameLabel}
            htmlFor="process-name"
            required
            hint={nameError && <Missing id="process-name-error">{t(nameError)}</Missing>}
          >
            <Input
              id="process-name"
              value={form.name}
              onChange={(event) => set('name', event.target.value)}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'process-name-error' : undefined}
            />
          </Field>
          <Field
            label={t('process.list')}
            htmlFor="process-list"
            required
            hint={!list && <Missing id="process-list-error">{t('process.listMissing')}</Missing>}
          >
            {/* Radix answers '' while the lists load, in a form: that never clears the list of the row. */}
            <Select value={list ? list.id : ''} onValueChange={(listId) => listId && set('listId', listId)}>
              <SelectTrigger
                id="process-list"
                className="w-full"
                aria-invalid={!list ? true : undefined}
                aria-describedby={!list ? 'process-list-error' : undefined}
              >
                <SelectValue placeholder={t('inbox.listPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {lists.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: `var(--chart-${option.color})` }} />
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={t('process.priority')} htmlFor="process-priority">
            <PrioritySelect id="process-priority" value={form.priority} onChange={(priority) => set('priority', priority)} />
          </Field>
          {form.kind !== 'reminder' && (
            <Field label={form.kind === 'group' ? t('process.groupDue') : t('process.due')} htmlFor="process-due">
              <Input id="process-due" type="date" value={form.dueOn} onChange={(event) => set('dueOn', event.target.value)} />
            </Field>
          )}
          {/* A reminder has no estimate (REM-02). */}
          {form.kind === 'task' && (
            <Field
              label={t('process.estimate')}
              htmlFor="process-estimate"
              hint={estimateError && <Missing id="process-estimate-error">{estimateError}</Missing>}
            >
              <DurationInput
                id="process-estimate"
                variant="field"
                value={form.estimate}
                onChange={(value) => set('estimate', value)}
                aria-invalid={estimateError ? true : undefined}
                aria-describedby={estimateError ? 'process-estimate-error' : undefined}
              />
            </Field>
          )}
        </div>

        {form.kind !== 'group' && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label={form.kind === 'reminder' ? t('process.day') : t('process.scheduleOn')} htmlFor="process-day">
              <Input id="process-day" type="date" value={form.scheduledOn} onChange={(event) => set('scheduledOn', event.target.value)} />
            </Field>
            <Field label={t('process.time')} htmlFor="process-time">
              <Input
                id="process-time"
                type="time"
                step={900}
                disabled={!form.scheduledOn}
                value={form.scheduledTime}
                onChange={(event) => set('scheduledTime', event.target.value)}
              />
            </Field>
          </div>
        )}

        {form.kind === 'reminder' && <p className="text-xs text-muted-foreground">{t('process.reminderNote')}</p>}

        {form.kind === 'task' && (
          <Field label={t('process.notes')} htmlFor="process-notes">
            <textarea
              id="process-notes"
              rows={2}
              value={form.notes}
              onChange={(event) => set('notes', event.target.value)}
              className="min-h-16 rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30"
            />
          </Field>
        )}

        {form.kind === 'group' && (
          <section aria-labelledby="process-group-tasks" className="flex flex-col gap-2">
            <p id="process-group-tasks" className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{t('process.groupTasks')}</span> · {t('process.groupTasksHint')}
            </p>
            <ol className="flex flex-col gap-1.5">
              {form.tasks.map((task, index) => (
                <li key={index} className="flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-sm">
                  <span className="w-4 text-xs text-muted-foreground tabular-nums">{index + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{task.title}</span>
                  {index === 0 && (
                    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{t('process.nextAction')}</span>
                  )}
                  {task.estimate_minutes !== null && (
                    <span className="font-mono text-xs text-muted-foreground tabular-nums">{toDuration(task.estimate_minutes)}</span>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={t('process.removeGroupTask', { title: task.title })}
                    onClick={() => set('tasks', form.tasks.filter((_, at) => at !== index))}
                  >
                    <X />
                  </Button>
                </li>
              ))}
            </ol>
            <Input
              aria-label={t('process.newGroupTask')}
              placeholder={t('process.newGroupTaskPlaceholder')}
              value={newTask}
              onChange={(event) => setNewTask(event.target.value)}
              onKeyDown={(event) => {
                // Enter adds the task, and never saves the form (GRP-03).
                if (event.key === 'Enter') {
                  event.preventDefault()
                  addTask()
                }
              }}
              onBlur={addTask}
              aria-describedby={noFirstTask ? 'process-first-task' : undefined}
            />
            {noFirstTask && <Missing id="process-first-task">{t('process.firstTask')}</Missing>}
          </section>
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-muted/50 px-3 py-2.5 text-sm">
          <output aria-live="polite" className="font-medium">
            {list
              ? t('process.goesTo', { list: list.name, column: t(`board.columns.${column}`) })
              : t('process.goesToNoList')}
          </output>
          <span className="flex-1" />
          <div role="group" aria-label={t('process.column')} className="flex gap-1">
            {COLUMNS.map((option) => (
              <Button
                key={option}
                type="button"
                size="xs"
                variant={column === option ? 'default' : 'ghost'}
                aria-pressed={column === option}
                onClick={() => set('column', option)}
              >
                {t(`board.columns.${option}`)}
              </Button>
            ))}
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <footer className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="ghost" disabled={pending} onClick={onDiscard}>
          {t('process.discard')}
        </Button>
        {form.kind !== 'group' && (
          <Button
            type="button"
            variant="outline"
            disabled={!canDecide || pending}
            onClick={() => onDone({ type: 'done', name, list_id: form.listId })}
          >
            {t('process.done')}
          </Button>
        )}
        <span className="flex-1" />
        {onSkip && (
          <Button type="button" variant="ghost" disabled={pending} onClick={onSkip}>
            {t('process.skip')}
          </Button>
        )}
        <Button type="submit" disabled={!canSave} title={noFirstTask ? t('process.firstTask') : undefined}>
          {t('process.save')}
        </Button>
      </footer>
    </form>
  )
}

/** The message of a refused send, kept in the form (PROC-08). */
function sendError(error: unknown, t: (key: string) => string): string {
  const reason = sendRefusal(error)
  return reason ? t(`inbox.refusal.${reason}`) : extractApiError(error, t('inbox.actionFailed'))
}

/**
 * The Processar of one item, over the inbox (`?process=<id>`): saving sends the item at once (PROC-05), `Já fiz`
 * sends it as done (PROC-06) and `Descartar` sends it to the trash (PROC-07); then `onNext` moves on.
 */
export function ProcessDialog({
  item,
  timeZone,
  onClose,
  onNext,
}: {
  item: InboxItem
  timeZone: string | undefined
  onClose: () => void
  onNext: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const lists = useWritableLists()
  const [error, setError] = useState<string | null>(null)

  const changed = () => {
    void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    void queryClient.invalidateQueries({ queryKey: ['lists'] })
  }
  const send = useMutation({
    mutationFn: (decision: Decision) => inboxApi.send(item.id, decision),
    onMutate: () => setError(null),
    onSuccess: (result, decision) => {
      const column = result.tasks[0]?.column
      if (decision.type !== 'discard' && column) {
        const listName = lists.find((list) => list.id === decision.list_id)?.name ?? ''
        toast.success(t('process.sent', { list: listName, column: t(`board.columns.${column}`) }))
      }
      changed()
      onNext()
    },
    onError: (failure) => {
      setError(sendError(failure, t))
      changed()
    },
  })
  const discard = useMutation({
    mutationFn: () => inboxApi.discard(item.id),
    onMutate: () => setError(null),
    onSuccess: () => {
      changed()
      onNext()
    },
    onError: (failure) => setError(extractApiError(failure, t('inbox.actionFailed'))),
  })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent showCloseButton={false} className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <header className="flex items-center gap-3 px-6 pt-5 pb-3">
          <DialogTitle className="text-base">{t('process.title')}</DialogTitle>
          <DialogDescription className="sr-only">{item.text}</DialogDescription>
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t('process.close')} onClick={onClose}>
            <X />
          </Button>
        </header>
        <ProcessForm
          key={item.id}
          item={item}
          timeZone={timeZone}
          error={error}
          pending={send.isPending || discard.isPending}
          onSave={(decision) => send.mutate(decision)}
          onDone={(decision) => send.mutate(decision)}
          onDiscard={() => discard.mutate()}
        />
      </DialogContent>
    </Dialog>
  )
}
