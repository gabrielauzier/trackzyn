import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { tasks as tasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { NoteEditor } from '@/components/board/note-editor'
import { useTask } from '@/components/board/use-task'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const NOTES_MAX = 10_000
/** How long the note waits after the last keystroke before it is saved. */
const SAVE_DELAY_MS = 800

interface QuickNoteProps {
  taskId: string
  /** False for a `viewer`: the note is read-only. */
  canWrite: boolean
  onClose: () => void
}

/** The notes of a task, written on its card on the board: saved as you go, and when the field is left or closed. */
export function QuickNote({ taskId, canWrite, onClose }: QuickNoteProps) {
  const { t, i18n } = useTranslation()
  const queryClient = useQueryClient()
  const { data: task } = useTask(taskId)
  // What was typed and not saved yet; null while the saved note is what is shown.
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  // The last text sent, so leaving the field and closing the note do not send it twice.
  const sent = useRef<string | null>(null)

  const save = useMutation({
    mutationFn: (notes: string) => tasksApi.update(taskId, { notes }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['lists'] }),
    onError: (e) => {
      sent.current = null
      setError(extractApiError(e, t('common.error')))
    },
  })

  const flush = (notes: string | null) => {
    clearTimeout(timer.current)
    if (notes === null || notes === task?.notes || notes === sent.current) return
    if (notes.length > NOTES_MAX) {
      setError(t('board.notesTooLong', { max: NOTES_MAX.toLocaleString(i18n.language) }))
      return
    }
    sent.current = notes
    save.mutate(notes)
  }

  // The latest text goes out when the note is closed by closing the card's panel, too.
  const latest = useRef<{ draft: string | null; flush: typeof flush }>({ draft, flush })
  useEffect(() => {
    latest.current = { draft, flush }
  })
  useEffect(() => () => latest.current.flush(latest.current.draft), [])
  useEffect(() => () => clearTimeout(timer.current), [])

  if (!task) return <Skeleton className="h-28 w-full" />

  return (
    <div className="space-y-1">
      <div className="relative">
        <NoteEditor
          value={draft ?? task.notes}
          editable={canWrite}
          aria-label={t('board.notes')}
          aria-invalid={error !== null}
          onChange={(notes) => {
            setDraft(notes)
            setError(null)
            clearTimeout(timer.current)
            timer.current = setTimeout(() => flush(notes), SAVE_DELAY_MS)
          }}
          onBlur={() => flush(draft)}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute right-1 bottom-1"
          aria-label={t('board.closeNotes')}
          onClick={onClose}
        >
          <X size={14} />
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
