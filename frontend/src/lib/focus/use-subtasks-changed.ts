import { useQueryClient } from '@tanstack/react-query'

import { notifyFocusChanged } from '@/lib/desktop/focus-window'

/**
 * Every focus state counts the subtasks of its tasks (#16): once a subtask change was answered, the
 * focus is read again here and the other desktop window is told to read it too.
 */
export function useSubtasksChanged(): () => void {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['focus'] })
    notifyFocusChanged()
  }
}
