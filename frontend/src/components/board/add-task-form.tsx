import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { parseDuration, type DurationError } from '@/components/board/estimate'
import { Button } from '@/components/ui/button'
import { DurationInput } from '@/components/ui/duration-input'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { TaskColumn } from '@/types'

const ESTIMATE_ERROR: Record<DurationError, string> = {
  format: 'board.estimateFormat',
  minutes: 'board.estimateMinutesRange',
  limit: 'board.estimateLimit',
}

interface AddTaskFormProps {
  listId: string
  column: TaskColumn
}

/** `+ Add task` at the end of a column, which opens into an inline form. */
export function AddTaskForm({ listId, column }: AddTaskFormProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

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
  return <TaskForm listId={listId} column={column} onClose={() => setOpen(false)} />
}

function TaskForm({ listId, column, onClose }: AddTaskFormProps & { onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const schema = z.object({
    title: z.string().trim().min(1, t('board.titleRequired')).max(255, t('board.titleTooLong')),
    // HH:MM, from 00:01 to 24:00 with minutes up to 59; empty for no estimate.
    estimate: z.string().superRefine((value, ctx) => {
      const parsed = parseDuration(value)
      if ('error' in parsed) ctx.addIssue({ code: 'custom', message: t(ESTIMATE_ERROR[parsed.error]) })
    }),
  })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: '', estimate: '' } })

  const create = useMutation({
    mutationFn: (values: Values) =>
      tasksApi.create({ list_id: listId, title: values.title, estimate_minutes: toMinutes(values.estimate), column }),
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
            // The card's inline HH:MM field on a row of its own, with no label: the placeholder says
            // the format and, while it is empty, a tooltip says what it is.
            <FormItem className="gap-1">
              <div data-slot="estimate-row" className="flex">
                <TooltipProvider>
                  <Tooltip open={field.value === '' ? undefined : false}>
                    <TooltipTrigger asChild>
                      <FormControl>
                        <DurationInput aria-label={t('board.estimate')} {...field} />
                      </FormControl>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="flex flex-col">
                      <span className="font-semibold">{t('board.estimate')}</span>
                      <span>{t('board.estimateEmptyHint')}</span>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
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
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={create.isPending}>
            {t('board.add')}
          </Button>
        </div>
      </form>
    </Form>
  )
}

/** The validated HH:MM text as the API takes it: minutes, or null when empty. */
function toMinutes(value: string): number | null {
  const parsed = parseDuration(value)
  return 'minutes' in parsed ? parsed.minutes : null
}
