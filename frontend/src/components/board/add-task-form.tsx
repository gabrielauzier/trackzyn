import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { isValidEstimate, toEstimate } from '@/components/board/estimate'
import { Button } from '@/components/ui/button'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import type { TaskColumn } from '@/types'

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
    estimate: z.string().refine(isValidEstimate, t('board.estimateRange')),
  })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { title: '', estimate: '' } })

  const create = useMutation({
    mutationFn: (values: Values) =>
      tasksApi.create({ list_id: listId, title: values.title, estimate_minutes: toEstimate(values.estimate), column }),
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
            <FormItem>
              <FormLabel>{t('board.estimateMinutes')}</FormLabel>
              <FormControl>
                <Input inputMode="numeric" {...field} />
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
