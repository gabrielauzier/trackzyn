import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { subtasks as subtasksApi } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { useTask } from '@/components/board/use-task'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import type { Subtask } from '@/types'

interface SubtaskListProps {
  taskId: string
  /** False for a `viewer`: the list is read-only. */
  canWrite: boolean
}

/** Returns the translation key of what is wrong with a subtask title, or null. */
function titleError(title: string): string | null {
  const text = title.trim()
  if (text === '') return 'board.titleRequired'
  if (text.length > 255) return 'board.titleTooLong'
  return null
}

export function SubtaskList({ taskId, canWrite }: SubtaskListProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const { data: task } = useTask(taskId)
  const [newTitle, setNewTitle] = useState('')
  const [newError, setNewError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['lists'] })
  const onError = (e: unknown) => setServerError(extractApiError(e, t('common.error')))

  const create = useMutation({
    mutationFn: (title: string) => subtasksApi.create(taskId, title),
    onSuccess: () => {
      setNewTitle('')
      setServerError(null)
      void refresh()
    },
    onError,
  })
  const update = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { title?: string; done?: boolean } }) =>
      subtasksApi.update(id, payload),
    onSuccess: () => {
      setServerError(null)
      void refresh()
    },
    onError,
  })
  const remove = useMutation({
    mutationFn: (id: string) => subtasksApi.remove(id),
    onSuccess: () => void refresh(),
    onError,
  })

  const items = task?.subtasks ?? []
  const done = items.filter((item) => item.done).length

  const onAdd = (event: FormEvent) => {
    event.preventDefault()
    const error = titleError(newTitle)
    setNewError(error)
    if (!error) create.mutate(newTitle.trim())
  }

  return (
    <div className="space-y-2 text-sm">
      <p className="text-xs text-muted-foreground">{t('board.subtaskSummary', { done, total: items.length })}</p>
      <ul className="space-y-1">
        {items.map((item) => (
          <SubtaskRow
            key={item.id}
            subtask={item}
            canWrite={canWrite}
            onToggle={(value) => update.mutate({ id: item.id, payload: { done: value } })}
            onRename={(title) => update.mutate({ id: item.id, payload: { title } })}
            onDelete={() => remove.mutate(item.id)}
          />
        ))}
      </ul>
      {canWrite && (
        <form className="flex items-start gap-2" onSubmit={onAdd} noValidate>
          <div className="flex-1 space-y-1">
            <Input
              aria-label={t('board.newSubtask')}
              placeholder={t('board.newSubtask')}
              value={newTitle}
              onChange={(event) => setNewTitle(event.target.value)}
              className="h-8"
            />
            {newError && <p className="text-xs text-destructive">{t(newError)}</p>}
          </div>
          <Button type="submit" variant="ghost" size="icon-sm" aria-label={t('board.addSubtask')} disabled={create.isPending}>
            <Plus size={14} />
          </Button>
        </form>
      )}
      {serverError && (
        <p role="alert" className="text-xs text-destructive">
          {serverError}
        </p>
      )}
    </div>
  )
}

interface SubtaskRowProps {
  subtask: Subtask
  canWrite: boolean
  onToggle: (done: boolean) => void
  onRename: (title: string) => void
  onDelete: () => void
}

function SubtaskRow({ subtask, canWrite, onToggle, onRename, onDelete }: SubtaskRowProps) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(subtask.title)
  const [error, setError] = useState<string | null>(null)

  if (editing) {
    const onSave = (event: FormEvent) => {
      event.preventDefault()
      const problem = titleError(title)
      setError(problem)
      if (problem) return
      onRename(title.trim())
      setEditing(false)
    }
    return (
      <li>
        <form className="flex items-start gap-2" onSubmit={onSave} noValidate>
          <div className="flex-1 space-y-1">
            <Input
              autoFocus
              aria-label={t('board.subtaskTitle')}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-8"
            />
            {error && <p className="text-xs text-destructive">{t(error)}</p>}
          </div>
          <Button type="submit" size="sm">
            {t('common.save')}
          </Button>
        </form>
      </li>
    )
  }

  return (
    <li className="flex items-center gap-2">
      <Checkbox
        checked={subtask.done}
        disabled={!canWrite}
        aria-label={subtask.title}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      <span className={subtask.done ? 'flex-1 truncate text-muted-foreground line-through' : 'flex-1 truncate'}>
        {subtask.title}
      </span>
      {canWrite && (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('board.renameSubtask', { title: subtask.title })}
            onClick={() => {
              setTitle(subtask.title)
              setEditing(true)
            }}
          >
            <Pencil size={14} />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t('board.deleteSubtask', { title: subtask.title })}
            onClick={onDelete}
          >
            <Trash2 size={14} />
          </Button>
        </>
      )}
    </li>
  )
}
