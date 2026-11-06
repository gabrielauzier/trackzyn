import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { NotebookPen } from 'lucide-react'

import { NoteEditor } from '@/components/board/note-editor'
import { useTask } from '@/components/board/use-task'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { NOTES_MAX, notesToText } from '@/lib/notes'
import { cn } from '@/lib/utils'

interface FocusNotesProps {
  taskId: string
  /** False for a `viewer`: the notes are read, never edited. */
  canWrite: boolean
}

/** The first line of a note with text, as plain text. */
function firstLine(notes: string): string {
  return (
    notesToText(notes)
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line !== '') ?? ''
  )
}

/**
 * The notes of the task in focus, in its card under the subtasks, past a line (#33): `Anotação`, in grey
 * without notes and with its icon in the primary colour and the start of the text with them. A click opens
 * the editor with the text, focused; leaving it saves, at most `NOTES_MAX` characters, like the widget.
 *
 * Mounted once per task in focus: when the task changes with the editor open, the text written is saved
 * for the task it was written for and the editor goes away with it.
 */
export function FocusNotes({ taskId, canWrite }: FocusNotesProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: task } = useTask(taskId)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lists'] })
  const save = useMutation({
    mutationFn: (notes: string) => tasksApi.update(taskId, { notes }),
    onSuccess: () => {
      void refresh()
      setText(null)
      setOpen(false)
    },
    onError: (e) => setError(extractApiError(e, t('common.error'))),
  })

  // What is written and not saved yet, read when the task in focus changes under an open editor.
  const unsaved = useRef<string | null>(null)
  // The last text sent on leaving the editor: a task change right behind that blur sends it no second time.
  const sent = useRef<string | null>(null)
  const pending = open && task && text !== null && text !== task.notes && !save.isPending ? text : null
  useEffect(() => {
    unsaved.current = pending
  })
  useEffect(
    () => () => {
      const left = unsaved.current
      if (left === null || left === sent.current || left.length > NOTES_MAX) return
      void tasksApi.update(taskId, { notes: left }).then(refresh, () => undefined)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once, when this task leaves the focus
    [],
  )

  if (!task) return null
  const value = text ?? task.notes
  const line = firstLine(task.notes)
  const hasNotes = line !== ''

  const onBlur = () => {
    if (value.length > NOTES_MAX) {
      setError(t('board.notesTooLong', { max: NOTES_MAX.toLocaleString(i18n.language) }))
      return
    }
    if (value === task.notes) {
      setText(null)
      setOpen(false)
    } else {
      sent.current = value
      save.mutate(value)
    }
  }

  const label = (
    <>
      <NotebookPen size={16} aria-hidden className={cn('shrink-0', hasNotes ? 'text-primary' : 'text-muted-foreground')} />
      <span className={cn('shrink-0 text-xs font-semibold', !hasNotes && 'text-muted-foreground')}>{t('focus.notes.title')}</span>
      {hasNotes && !open && <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{line}</span>}
    </>
  )

  return (
    <div data-focus-notes className="-mx-4 mt-3 space-y-2 border-t px-3 pt-3">
      {canWrite ? (
        <button
          type="button"
          aria-expanded={open}
          data-muted={!hasNotes || undefined}
          title={hasNotes ? notesToText(task.notes) : undefined}
          className="flex w-full min-w-0 items-center gap-2 rounded-sm px-1 py-0.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => {
            setError(null)
            setOpen(true)
          }}
        >
          {label}
        </button>
      ) : hasNotes ? (
        // A viewer opens the whole text to read it, with no editor.
        <button
          type="button"
          aria-expanded={open}
          title={notesToText(task.notes)}
          className="flex w-full min-w-0 items-center gap-2 rounded-sm px-1 py-0.5 text-left outline-none hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring/50"
          onClick={() => setOpen((current) => !current)}
        >
          {label}
        </button>
      ) : (
        <div data-muted className="flex min-w-0 items-center gap-2 px-1 py-0.5">
          {label}
        </div>
      )}
      {!canWrite && open && (
        <p data-notes-text className="px-1 text-sm whitespace-pre-line">
          {notesToText(task.notes)}
        </p>
      )}
      {canWrite && open && (
        <div className="space-y-1 px-1">
          <NoteEditor
            id={`focus-notes-${taskId}`}
            autoFocus
            value={value}
            aria-label={t('focus.notes.editor')}
            aria-invalid={error !== null}
            aria-describedby={error ? `focus-notes-error-${taskId}` : `focus-notes-hint-${taskId}`}
            onChange={(notes) => {
              setText(notes)
              setError(null)
            }}
            onBlur={onBlur}
            className="max-h-60 overflow-y-auto"
          />
          {error ? (
            <p id={`focus-notes-error-${taskId}`} role="alert" className="text-xs text-destructive">
              {error}
            </p>
          ) : (
            <p id={`focus-notes-hint-${taskId}`} className="text-xs text-muted-foreground">
              {t('focus.notes.hint')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
