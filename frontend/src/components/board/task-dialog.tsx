import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { isValidEstimate, toEstimate } from '@/components/board/estimate'
import { NoteEditor } from '@/components/board/note-editor'
import { SubtaskList } from '@/components/board/subtask-list'
import { useTask } from '@/components/board/use-task'
import { DeleteConfirmationDialog } from '@/components/delete-confirmation-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import type { Task } from '@/types'

const NOTES_MAX = 10_000

interface TaskDialogProps {
  /** The task to show; null keeps the dialog closed. */
  taskId: string | null
  /** False for a `viewer`: the fields are read-only and nothing can be saved or deleted. */
  canWrite: boolean
  onClose: () => void
}

export function TaskDialog({ taskId, canWrite, onClose }: TaskDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={!!taskId} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('board.editTask')}</DialogTitle>
        </DialogHeader>
        {taskId && <TaskDetails taskId={taskId} canWrite={canWrite} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  )
}

function TaskDetails({ taskId, canWrite, onDone }: { taskId: string; canWrite: boolean; onDone: () => void }) {
  const { data: task } = useTask(taskId)
  if (!task) return <Skeleton className="h-48 w-full" />
  return (
    <div className="space-y-4">
      {/* Keyed by id so the form starts from this task's saved values. */}
      <TaskForm key={task.id} task={task} canWrite={canWrite} onDone={onDone} />
      <SubtaskList taskId={task.id} canWrite={canWrite} />
    </div>
  )
}

function TaskForm({ task, canWrite, onDone }: { task: Task; canWrite: boolean; onDone: () => void }) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const schema = z.object({
    title: z.string().trim().min(1, t('board.titleRequired')).max(255, t('board.titleTooLong')),
    estimate: z.string().refine(isValidEstimate, t('board.estimateRange')),
    notes: z
      .string()
      .max(NOTES_MAX, t('board.notesTooLong', { max: NOTES_MAX.toLocaleString(i18n.language) })),
  })
  type Values = z.infer<typeof schema>
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: task.title,
      estimate: task.estimate_minutes === null ? '' : String(task.estimate_minutes),
      notes: task.notes,
    },
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lists'] })

  const save = useMutation({
    mutationFn: (payload: { title?: string; estimate_minutes?: number | null; notes?: string }) =>
      tasksApi.update(task.id, payload),
    onSuccess: () => {
      void refresh()
      onDone()
    },
    onError: (e) => form.setError('root.server', { message: extractApiError(e, t('common.error')) }),
  })
  const remove = useMutation({
    mutationFn: () => tasksApi.remove(task.id),
    onSuccess: () => {
      setConfirmDelete(false)
      void refresh()
      onDone()
    },
    onError: (e) => form.setError('root.server', { message: extractApiError(e, t('common.error')) }),
  })

  const onSubmit = (values: Values) => {
    // Only what changed goes to the server.
    const payload: { title?: string; estimate_minutes?: number | null; notes?: string } = {}
    if (values.title !== task.title) payload.title = values.title
    const estimate = toEstimate(values.estimate)
    if (estimate !== task.estimate_minutes) payload.estimate_minutes = estimate
    if (values.notes !== task.notes) payload.notes = values.notes
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
        <FormField
          control={form.control}
          name="estimate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('board.estimateMinutes')}</FormLabel>
              <FormControl>
                <Input inputMode="numeric" disabled={!canWrite} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
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
      <DeleteConfirmationDialog
        open={confirmDelete}
        title={t('board.deleteTask')}
        description={t('board.deleteTaskDescription', { title: task.title })}
        isPending={remove.isPending}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
      />
    </Form>
  )
}
