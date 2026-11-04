import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'

import { SubtaskList } from '@/components/board/subtask-list'
import { useTask } from '@/components/board/use-task'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { useSubtasksChanged } from '@/lib/focus/use-subtasks-changed'

interface FocusSubtasksProps {
  taskId: string
  /** False for a `viewer`: the subtasks show read-only. */
  canWrite: boolean
  /** `Concluir tarefa`, once every subtask is done. */
  onComplete: () => void
}

/**
 * The subtasks of the task in focus, in its card past a line (canvas #16): `Subtarefas` with a bar and
 * `<feitas>/<total>`, the list with its checkboxes and `Nova subtarefa`; only `Adicionar subtarefa`
 * without any; `Tudo feito por aqui.` with `Concluir tarefa` once all are done; the first 5 pending
 * of a longer list until `Mostrar todas`.
 */
export function FocusSubtasks({ taskId, canWrite, onComplete }: FocusSubtasksProps) {
  const { t } = useTranslation()
  const { data: task } = useTask(taskId)
  const changed = useSubtasksChanged()
  if (!task) return null

  const total = task.subtasks.length
  const done = task.subtasks.filter((item) => item.done).length
  if (total === 0 && !canWrite) return null
  const allDone = total > 0 && done === total
  const percent = total > 0 ? Math.round((done / total) * 100) : 0

  return (
    <div className="-mx-4 mt-3 space-y-2 border-t px-3 pt-3">
      {total > 0 && (
        <div className="flex items-center gap-2.5 px-1">
          <span className="text-xs font-semibold text-muted-foreground">{t('focus.subtasks.title')}</span>
          <Progress value={percent} aria-label={t('focus.subtasks.title')} className="h-1 flex-1" />
          <span className="text-xs text-muted-foreground tabular-nums">
            {done}/{total}
          </span>
        </div>
      )}
      {allDone ? (
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-sm">{t('focus.subtasks.allDone')}</span>
          {canWrite && (
            <Button size="sm" onClick={onComplete}>
              <Check /> {t('focus.subtasks.completeTask')}
            </Button>
          )}
        </div>
      ) : (
        <SubtaskList taskId={taskId} canWrite={canWrite} showSummary={false} limit={5} addCollapsed onSettled={changed} />
      )}
    </div>
  )
}
