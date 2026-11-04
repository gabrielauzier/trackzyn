import type { FocusState } from '@/types'

export type NextTask = FocusState['today']['tasks'][number]

/** The droppable id of the card in focus: dropping a next task on it focuses on that task (#15, rule 2). */
export const FOCUS_DROP_ID = 'focus:card'

/**
 * The ids of the queue in the order the screen shows: the order a reorder asked for (`override`) while
 * the server has not answered it, then any task the server has and that order lacks, in board order.
 */
export function arrangeQueue(tasks: NextTask[], override: string[] | null): NextTask[] {
  if (!override) return tasks
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const first = override.flatMap((id) => byId.get(id) ?? [])
  const placed = new Set(first.map((task) => task.id))
  return [...first, ...tasks.filter((task) => !placed.has(task.id))]
}
