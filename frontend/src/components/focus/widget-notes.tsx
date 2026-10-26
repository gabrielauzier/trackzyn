import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { NoteEditor } from '@/components/board/note-editor'
import { useTask } from '@/components/board/use-task'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { resizeWidget } from '@/lib/desktop/focus-window'

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
      <NoteEditor
        id="widget-notes"
        autoFocus
        value={value}
        aria-label={t('focus.widget.notes')}
        aria-invalid={error !== null}
        aria-describedby={error ? 'widget-notes-error' : undefined}
        onChange={(notes) => {
          setText(notes)
          setError(null)
        }}
        onBlur={onBlur}
        className="min-h-0 flex-1 overflow-y-auto"
      />
      {error && (
        <p id="widget-notes-error" role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
