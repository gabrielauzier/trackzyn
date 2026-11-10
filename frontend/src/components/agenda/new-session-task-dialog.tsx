import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Info } from 'lucide-react'

import { DURATION_ERROR_KEY, durationMinutes, parseDuration } from '@/components/board/estimate'
import { NoteEditor } from '@/components/board/note-editor'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DurationInput } from '@/components/ui/duration-input'
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { sessions as sessionsApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import type { AgendaTaskInput, ListCard, Task } from '@/types'

interface NewSessionTaskDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The active lists the task can go to. */
  lists: Pick<ListCard, 'id' | 'name' | 'color'>[]
  /** The list it starts on: the one the agenda filters, else the first (PICK-12). */
  defaultListId: string | null
  /** The title it starts with: the search text, or empty (PICK-12). */
  defaultTitle: string
  /** The `HH:MM` estimate it starts with; empty by default. */
  defaultEstimate?: string
  /** The line under the title; the agenda's by default. */
  hint?: string
  /**
   * Creates the task elsewhere than the agenda (the plan, PLAN-48); then the notice that it goes to Concluídas does not
   * show. By default the agenda's route creates it concluded.
   */
  onSubmit?: (input: AgendaTaskInput) => Promise<Task>
  onCreated: (task: Task) => void
}

/**
 * `Nova tarefa` of the agenda (PICK-12 to PICK-19): the list, the title and the estimate of the board form, and the
 * notes of `Editar tarefa` behind `Adicionar anotações`. The task is created concluded, from the agenda.
 */
export function NewSessionTaskDialog({
  open,
  onOpenChange,
  lists,
  defaultListId,
  defaultTitle,
  defaultEstimate,
  hint,
  onSubmit,
  onCreated,
}: NewSessionTaskDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('agenda.newTask.title')}</DialogTitle>
          <DialogDescription>{hint ?? t('agenda.newTask.hint')}</DialogDescription>
        </DialogHeader>
        {/* Mounted with the dialog, so every opening starts from the list and the title given. */}
        {open && (
          <NewTaskForm
            lists={lists}
            defaultListId={defaultListId}
            defaultTitle={defaultTitle}
            defaultEstimate={defaultEstimate}
            onSubmit={onSubmit}
            onCancel={() => onOpenChange(false)}
            onCreated={onCreated}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function NewTaskForm({
  lists,
  defaultListId,
  defaultTitle,
  defaultEstimate = '',
  onSubmit,
  onCancel,
  onCreated,
}: Omit<NewSessionTaskDialogProps, 'open' | 'onOpenChange' | 'hint'> & { onCancel: () => void }) {
  const { t } = useTranslation()
  const id = useId()
  const queryClient = useQueryClient()
  const [withNotes, setWithNotes] = useState(false)
  const schema = z.object({
    listId: z.string().min(1),
    title: z.string().trim().min(1, t('board.titleRequired')).max(255, t('board.titleTooLong')),
    // HH:MM, from 00:01 to 24:00 with minutes up to 59; empty for no estimate, as on the board.
    estimate: z.string().superRefine((value, ctx) => {
      const parsed = parseDuration(value)
      if ('error' in parsed) ctx.addIssue({ code: 'custom', message: t(DURATION_ERROR_KEY[parsed.error]) })
    }),
    notes: z.string(),
  })
  type Values = z.infer<typeof schema>
  const startList = lists.some((list) => list.id === defaultListId) ? defaultListId! : (lists[0]?.id ?? '')
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { listId: startList, title: defaultTitle, estimate: defaultEstimate, notes: '' },
  })

  const create = useMutation({
    mutationFn: (values: Values) => {
      const input: AgendaTaskInput = { list_id: values.listId, title: values.title, estimate_minutes: durationMinutes(values.estimate) }
      // The switch decides what is saved: off, no notes, whatever was typed (PICK-15).
      if (withNotes) input.notes = values.notes
      return (onSubmit ?? sessionsApi.createTask)(input)
    },
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] })
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
      onCreated(task)
    },
    onError: (error) => form.setError('root.server', { message: extractApiError(error, t('common.error')) }),
  })
  const serverError = form.formState.errors.root?.server?.message

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={form.handleSubmit((values) => create.mutate(values))} noValidate>
        <FormField
          control={form.control}
          name="listId"
          render={({ field }) => (
            <FormItem>
              <Label id={`${id}-list`}>{t('agenda.newTask.list')}</Label>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger aria-labelledby={`${id}-list`} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {lists.map((list) => (
                    <SelectItem key={list.id} value={list.id}>
                      <span className="size-2.5 rounded-sm" style={{ backgroundColor: `var(--chart-${list.color})` }} aria-hidden />
                      {list.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('board.taskTitle')}</FormLabel>
              <FormControl>
                <Input autoFocus {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="estimate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('board.estimate')}</FormLabel>
              <FormControl>
                <DurationInput variant="field" {...field} />
              </FormControl>
              <FormDescription>{t('board.estimateHint')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <Switch id={`${id}-notes`} aria-labelledby={`${id}-notes-label`} checked={withNotes} onCheckedChange={setWithNotes} />
            <Label id={`${id}-notes-label`} htmlFor={`${id}-notes`}>
              {t('agenda.newTask.addNotes')}
            </Label>
          </div>
          {withNotes && (
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <NoteEditor value={field.value} onChange={field.onChange} onBlur={field.onBlur} aria-label={t('board.notes')} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </div>
        {/* The agenda's task is created concluded; a task created elsewhere is not (PLAN-48). */}
        {!onSubmit && (
          <div className="flex gap-2.5 rounded-lg border bg-muted/40 px-3 py-2.5">
            <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="flex flex-col gap-1.5">
              <p className="text-sm text-muted-foreground">{t('agenda.newTask.info')}</p>
              <span className="flex gap-1.5">
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  {t('agenda.picker.done')}
                </span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground">{t('board.createdVia', { name: 'Agenda' })}</span>
              </span>
            </div>
          </div>
        )}
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {t('board.add')}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  )
}
