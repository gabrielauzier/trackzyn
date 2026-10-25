import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { useTask } from '@/components/board/use-task'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { resizeWidget } from '@/lib/desktop/focus-window'
import { cn } from '@/lib/utils'

const NOTES_MAX = 10_000

interface WidgetNotesProps {
  taskId: string
  /** Called once the notes were saved (or nothing changed) and the widget is compact again. */
  onClose: () => void
}

/**
 * The notes of the task in focus, in the widget: opening grows the widget (WIDGET-14); leaving the
 * field saves the text, at most 10 000 characters, and shrinks it back (WIDGET-15).
 */
export function WidgetNotes({ taskId, onClose }: WidgetNotesProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: task } = useTask(taskId)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void resizeWidget('notes')
  }, [])

  const close = () => {
    void resizeWidget('compact')
    onClose()
  }

  const save = useMutation({
    mutationFn: (notes: string) => tasksApi.update(taskId, { notes }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
      close()
    },
    onError: (e) => setError(extractApiError(e, t('common.error'))),
  })

  if (!task) return null
  const value = text ?? task.notes
  const tooLong = value.length > NOTES_MAX

  const onBlur = () => {
    if (tooLong) {
      setError(t('board.notesTooLong', { max: NOTES_MAX.toLocaleString(i18n.language) }))
      return
    }
    if (value === task.notes) close()
    else save.mutate(value)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1 px-3 pb-3 [-webkit-app-region:no-drag]">
      <label htmlFor="widget-notes" className="sr-only">
        {t('focus.widget.notes')}
      </label>
      <textarea
        id="widget-notes"
        autoFocus
        value={value}
        aria-invalid={error !== null}
        aria-describedby={error ? 'widget-notes-error' : undefined}
        onChange={(event) => {
          setText(event.target.value)
          setError(null)
        }}
        onBlur={onBlur}
        className={cn(
          'border-input dark:bg-input/30 min-h-0 w-full flex-1 resize-none rounded-md border bg-card px-2 py-1.5 text-sm outline-none',
          'focus-visible:border-ring focus-visible:ring-ring/30 focus-visible:ring-[2px] aria-invalid:border-destructive',
        )}
      />
      {error && (
        <p id="widget-notes-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
