import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Plus, X } from 'lucide-react'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { DURATION_ERROR_KEY, durationMinutes, parseDuration } from '@/components/board/estimate'
import { Button } from '@/components/ui/button'
import { DurationInput } from '@/components/ui/duration-input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { TaskColumn } from '@/types'


interface AddTaskFormProps {
  listId: string
  column: TaskColumn
  /** Creates the task at the end of this group's block (GRP-10). */
  groupId?: string
  /** Starts as the open form, and closing it calls `onClose`. */
  defaultOpen?: boolean
  onClose?: () => void
}

/** `+ Add task` at the end of a column, which opens into an inline form. */
export function AddTaskForm({ listId, column, groupId, defaultOpen = false, onClose }: AddTaskFormProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(defaultOpen)

  if (!open) {
    return (
      <Button
        variant="ghost"
        className="w-full justify-start text-muted-foreground uppercase"
        onClick={() => setOpen(true)}
      >
        <Plus size={16} /> {t('board.addTask')}
      </Button>
    )
  }
  return (
    <TaskForm
      listId={listId}
      column={column}
      groupId={groupId}
      onClose={() => {
        setOpen(false)
        onClose?.()
      }}
    />
  )
}

function TaskForm({ listId, column, groupId, onClose }: Omit<AddTaskFormProps, 'onClose'> & { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const schema = z.object({
    title: z.string().trim().min(1, t('board.titleRequired')).max(255, t('board.titleTooLong')),
    // HH:MM, from 00:01 to 24:00 with minutes up to 59; empty for no estimate.
    estimate: z.string().superRefine((value, ctx) => {
      const parsed = parseDuration(value)
      if ('error' in parsed) ctx.addIssue({ code: 'custom', message: t(DURATION_ERROR_KEY[parsed.error]) })
    }),
  })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: '', estimate: '' } })

  const create = useMutation({
    mutationFn: (values: Values) =>
      tasksApi.create({
        list_id: listId,
        title: values.title,
        estimate_minutes: durationMinutes(values.estimate),
        column,
        ...(groupId === undefined ? {} : { group_id: groupId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
      onClose()
    },
    onError: (e) => form.setError('root.server', { message: extractApiError(e, t('common.error')) }),
  })

  const serverError = form.formState.errors.root?.server?.message

  return (
    <Form {...form}>
      <form className="space-y-2 rounded-lg border p-3" onSubmit={form.handleSubmit((values) => create.mutate(values))} noValidate>
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
            // The card's inline HH:MM field, with no label: the placeholder says the format and, while
            // it is empty, a tooltip says what it is. Cancel and Add sit at the end of its row as icons,
            // so the form fits a narrow column without cutting a button.
            <FormItem className="gap-1">
              <div data-slot="estimate-row" className="flex items-center gap-1.5">
                <TooltipProvider>
                  <Tooltip open={field.value === '' ? undefined : false}>
                    <TooltipTrigger asChild>
                      <FormControl>
                        <DurationInput aria-label={t('board.estimate')} {...field} />
                      </FormControl>
                    </TooltipTrigger>
                    {/* Below the field: its right side holds the two buttons. */}
                    <TooltipContent side="bottom" align="start" className="flex flex-col">
                      <span className="font-semibold">{t('board.estimate')}</span>
                      <span>{t('board.estimateEmptyHint')}</span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <span className="flex-1" />
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t('common.cancel')}
                  title={t('common.cancel')}
                  onClick={onClose}
                >
                  <X size={16} />
                </Button>
                <Button
                  type="submit"
                  size="icon-sm"
                  aria-label={t('board.add')}
                  title={t('board.add')}
                  disabled={create.isPending}
                >
                  <Check size={16} />
                </Button>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
        {serverError && (
          <p role="alert" className="text-sm text-destructive">
            {serverError}
          </p>
        )}
      </form>
    </Form>
  )
}

