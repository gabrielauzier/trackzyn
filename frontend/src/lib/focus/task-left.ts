import type { FocusState } from '@/types'

/**
 * Whether the task the screen showed left Today without being completed: deleted, moved out of Today
 * or its list archived (FOCUS-15).
 */
export function taskLeft(before: FocusState, after: FocusState): boolean {
  const id = before.task?.id
  if (!id || after.task?.id === id) return false
  if (after.today.tasks.some((task) => task.id === id)) return false
  return after.today.done <= before.today.done
}
