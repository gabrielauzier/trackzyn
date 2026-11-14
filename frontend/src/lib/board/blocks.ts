import type { Board, TaskCardView } from '@/types'

export type BoardGroup = Board['groups'][number]

/** A task and its 0-based place in the column. */
export interface PlacedTask {
  task: TaskCardView
  index: number
}

/** What a column draws: a loose card, or a group's container with its cards. */
export type ColumnItem = ({ type: 'task' } & PlacedTask) | { type: 'group'; group: BoardGroup; tasks: PlacedTask[] }

/**
 * The tasks of a column, in order, as cards and containers: the consecutive tasks of one group make a
 * container (GRP-04, AD-013); the others stay loose. A task whose group the board does not list is loose.
 */
export function columnItems(tasks: readonly TaskCardView[], groups: readonly BoardGroup[]): ColumnItem[] {
  const byId = new Map(groups.map((group) => [group.id, group]))
  const items: ColumnItem[] = []
  tasks.forEach((task, index) => {
    const group = task.group_id === null ? undefined : byId.get(task.group_id)
    const last = items.at(-1)
    if (!group) items.push({ type: 'task', task, index })
    else if (last?.type === 'group' && last.group.id === group.id) last.tasks.push({ task, index })
    else items.push({ type: 'group', group, tasks: [{ task, index }] })
  })
  return items
}
