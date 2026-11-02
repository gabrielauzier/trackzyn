import { arrayMove } from '@dnd-kit/sortable'
import type { Board, TaskColumn } from '@/types'

export type PendingColumn = Exclude<TaskColumn, 'done'>

/** Prefix of a column's droppable id, so a drop on the column's own area reads as `column:<id>`. */
export const COLUMN_PREFIX = 'column:'

/** Where a dropped task goes: a pending column right before `before` (null = last), or into Concluídas. */
export type DropTarget = { column: PendingColumn; before: string | null } | { column: 'done'; before: null }

/** Every card's column, read from the board. */
export function columnsOf(board: Board): Map<string, TaskColumn> {
  const map = new Map<string, TaskColumn>()
  for (const column of ['backlog', 'this_week', 'today'] as const) {
    for (const task of board.columns[column].tasks) map.set(task.id, column)
  }
  for (const day of board.columns.done.days) for (const task of day.tasks) map.set(task.id, 'done')
  return map
}

const COLUMNS: readonly string[] = ['backlog', 'this_week', 'today', 'done'] satisfies TaskColumn[]
const columnNamed = (name: string) => (COLUMNS.includes(name) ? (name as TaskColumn) : undefined)

/**
 * Where the task `activeId` lands when dropped over `overId` (a card or a `column:<id>` area),
 * or null when the drop changes nothing.
 */
export function dropTarget(board: Board, activeId: string, overId: string): DropTarget | null {
  const taskColumns = columnsOf(board)
  const from = taskColumns.get(activeId)
  const to = overId.startsWith(COLUMN_PREFIX) ? columnNamed(overId.slice(COLUMN_PREFIX.length)) : taskColumns.get(overId)
  if (!from || !to) return null
  if (to === 'done') {
    // Concluídas is ordered by day, so a task only enters it, at no particular place.
    return from === 'done' ? null : { column: 'done', before: null }
  }
  if (overId.startsWith(COLUMN_PREFIX)) return { column: to, before: null }
  if (from !== to) return { column: to, before: overId }
  if (activeId === overId) return null
  const ids = board.columns[to].tasks.map((task) => task.id)
  const order = arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId))
  return { column: to, before: order[order.indexOf(activeId) + 1] ?? null }
}
