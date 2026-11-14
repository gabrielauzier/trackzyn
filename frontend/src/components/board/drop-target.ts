import { arrayMove } from '@dnd-kit/sortable'
import type { Board, TaskColumn } from '@/types'

export type PendingColumn = Exclude<TaskColumn, 'done'>

/** Prefix of a column's droppable id, so a drop on the column's own area reads as `column:<id>`. */
export const COLUMN_PREFIX = 'column:'

/** Prefix of a group container's droppable area: `group:<group id>:<column>`. */
export const GROUP_PREFIX = 'group:'
/** Prefix of a group container's title, which drags the whole container: `container:<group id>:<column>`. */
export const CONTAINER_PREFIX = 'container:'

/**
 * Where a dropped task goes: a pending column right before `before` (null = last), or into Concluídas.
 * `group` is the group it ends in: an id puts it in, null takes it out, left out it keeps its group (GRP-06..08).
 */
export type DropTarget =
  | { column: PendingColumn; before: string | null; group?: string | null }
  | { column: 'done'; before: null }

/** A whole group's block moved from one column to another, right before `before` (GRP-09). */
export interface GroupDropTarget {
  group: string
  from: TaskColumn
  to: TaskColumn
  before: string | null
}

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

/** The group and column of a `group:<id>:<col>` or `container:<id>:<col>` id; null for any other id. */
export function containerOf(id: string): { kind: 'group' | 'container'; group: string; column: TaskColumn } | null {
  const kind = id.startsWith(GROUP_PREFIX) ? 'group' : id.startsWith(CONTAINER_PREFIX) ? 'container' : null
  if (!kind) return null
  const [, group, name] = id.split(':')
  const column = columnNamed(name ?? '')
  return group && column ? { kind, group, column } : null
}

/** The column a drop over `overId` lands in: a card's, a column area's or a container's. */
export function columnOver(board: Board, overId: string, taskColumns = columnsOf(board)): TaskColumn | undefined {
  if (overId.startsWith(COLUMN_PREFIX)) return columnNamed(overId.slice(COLUMN_PREFIX.length))
  return containerOf(overId)?.column ?? taskColumns.get(overId)
}

const tasksIn = (board: Board, column: TaskColumn) =>
  column === 'done' ? board.columns.done.days.flatMap((day) => day.tasks) : board.columns[column].tasks

/**
 * Where the task `activeId` lands when dropped over `overId` (a card, a `column:<col>` area, a container's
 * `group:<id>:<col>` area or its `container:<id>:<col>` title), and in which group, or null when the drop
 * changes nothing.
 */
export function dropTarget(board: Board, activeId: string, overId: string): DropTarget | null {
  const taskColumns = columnsOf(board)
  const from = taskColumns.get(activeId)
  const to = columnOver(board, overId, taskColumns)
  if (!from || !to) return null
  if (to === 'done') {
    // Concluídas is ordered by day, so a task only enters it, at no particular place, keeping its group.
    return from === 'done' ? null : { column: 'done', before: null }
  }
  const tasks = tasksIn(board, to)
  const groupOf = (id: string) => tasks.find((task) => task.id === id)?.group_id ?? null
  const active = tasksIn(board, from).find((task) => task.id === activeId)
  // Out of every container: a task of a group leaves it (GRP-07); a loose task stays loose.
  const outside = active?.group_id ? null : undefined

  // A reminder lands where it is dropped but never joins a group (MODAL-06).
  const joins = (group: string | null | undefined) => (active?.kind === 'reminder' ? undefined : group)
  const container = containerOf(overId)
  if (container) {
    // Its title is the start of the block; its area, the end of it (GRP-06, GRP-08).
    const others = tasks.filter((task) => task.id !== activeId)
    const inGroup = others.map((task) => task.group_id === container.group)
    const first = inGroup.indexOf(true)
    const last = inGroup.lastIndexOf(true)
    const before = container.kind === 'container' ? (others[first]?.id ?? null) : last < 0 ? null : (others[last + 1]?.id ?? null)
    return { column: to, before, group: joins(container.group) }
  }
  if (overId.startsWith(COLUMN_PREFIX)) return { column: to, before: null, group: outside }
  // Dropped on a card: the group of that card, or out of any (GRP-06..08).
  const group = joins(groupOf(overId) ?? outside)
  if (from !== to) return { column: to, before: overId, group }
  if (activeId === overId) return null
  const ids = tasks.map((task) => task.id)
  const order = arrayMove(ids, ids.indexOf(activeId), ids.indexOf(overId))
  return { column: to, before: order[order.indexOf(activeId) + 1] ?? null, group }
}

/**
 * Where the container `activeId` (`container:<id>:<col>`), dragged by its title, takes the group's tasks of its
 * column (GRP-09): another column's end, right before the card it is dropped on, or before the first task of the
 * container it is dropped on. Null within its own column or over unknown ids.
 */
export function groupDropTarget(board: Board, activeId: string, overId: string): GroupDropTarget | null {
  const dragged = containerOf(activeId)
  if (dragged?.kind !== 'container') return null
  const to = columnOver(board, overId)
  if (!to || to === dragged.column) return null
  const at = { group: dragged.group, from: dragged.column, to }
  if (to === 'done' || overId.startsWith(COLUMN_PREFIX)) return { ...at, before: null }
  const over = containerOf(overId)
  if (over) return { ...at, before: tasksIn(board, to).find((task) => task.group_id === over.group)?.id ?? null }
  return { ...at, before: overId }
}
