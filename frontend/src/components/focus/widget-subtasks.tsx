import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { SubtaskList } from '@/components/board/subtask-list'
import { useTask } from '@/components/board/use-task'
import { resizeWidget } from '@/lib/desktop/focus-window'
import { useSubtasksChanged } from '@/lib/focus/use-subtasks-changed'

interface WidgetSubtasksProps {
  taskId: string
  canWrite: boolean
}

/**
 * The subtasks of the task in focus, in the widget under its controls (canvas #16, form C): opening
 * grows the widget to the size of the notes panel; only ticking, nothing else. A tick is told to the
 * main window once answered, so its card and the widget's counter read it.
 */
export function WidgetSubtasks({ taskId, canWrite }: WidgetSubtasksProps) {
  const { t } = useTranslation()
  const { data: task } = useTask(taskId)
  const changed = useSubtasksChanged()

  useEffect(() => {
    void resizeWidget('notes')
  }, [])

  const items = task?.subtasks ?? []
  const done = items.filter((item) => item.done).length

  return (
    <div
      role="region"
      aria-label={t('focus.widget.subtasks')}
      className="min-h-0 flex-1 overflow-y-auto border-t px-3 py-1.5 [-webkit-app-region:no-drag]"
    >
      {task && (
        <>
          <p className="py-1 text-xs font-semibold text-muted-foreground">{t('focus.subtasks.summary', { done, total: items.length })}</p>
          <SubtaskList taskId={taskId} canWrite={canWrite} showSummary={false} toggleOnly onSettled={changed} />
        </>
      )}
    </div>
  )
}
