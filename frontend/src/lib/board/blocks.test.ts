import { describe, expect, it } from 'vitest'

import { columnItems } from '@/lib/board/blocks'
import { PLAIN_TASK_FIELDS } from '@/test/utils'
import type { TaskCardView } from '@/types'

const card = (id: string, group_id: string | null = null): TaskCardView => ({
  ...PLAIN_TASK_FIELDS,
  group_id,
  id,
  title: id,
  estimate_minutes: null,
  spent_seconds: 0,
  position: 0,
  subtasks: { done: 0, total: 0 },
  created_via: null,
  scheduled_on: null,
  scheduled_time: null,
  series: null,
})

const PIPELINE = { id: 'g1', name: 'Pipeline de scripts', priority: 'none' as const, due_on: null }
const PORTAL = { id: 'g2', name: 'Portal', priority: 'high' as const, due_on: null }

/** The shape of the items, ids only: a loose task is its id, a container is [group, ...ids]. */
const shape = (items: ReturnType<typeof columnItems>) =>
  items.map((item) => (item.type === 'task' ? item.task.id : [item.group.id, ...item.tasks.map(({ task }) => task.id)]))

describe('columnItems (GRP-04, AD-013)', () => {
  it('joins the consecutive tasks of a group in one container and leaves the loose ones', () => {
    const items = columnItems([card('a'), card('b', 'g1'), card('c', 'g1'), card('d')], [PIPELINE])

    expect(shape(items)).toEqual(['a', ['g1', 'b', 'c'], 'd'])
    expect(items[1]).toMatchObject({ type: 'group', group: PIPELINE })
  })

  it('keeps the place of each task in the column, for the numbers of Today', () => {
    const items = columnItems([card('a'), card('b', 'g1'), card('c', 'g1'), card('d')], [PIPELINE])

    expect(items.flatMap((item) => (item.type === 'task' ? [item.index] : item.tasks.map(({ index }) => index)))).toEqual([0, 1, 2, 3])
  })

  it('two groups side by side are two containers', () => {
    expect(shape(columnItems([card('a', 'g1'), card('b', 'g2'), card('c', 'g2')], [PIPELINE, PORTAL]))).toEqual([['g1', 'a'], ['g2', 'b', 'c']])
  })

  it('a group broken by a loose task, as Concluídas orders by day, is two containers', () => {
    expect(shape(columnItems([card('a', 'g1'), card('b'), card('c', 'g1')], [PIPELINE]))).toEqual([['g1', 'a'], 'b', ['g1', 'c']])
  })

  it('a column with no task of a group has no container', () => {
    expect(shape(columnItems([card('a'), card('b')], [PIPELINE]))).toEqual(['a', 'b'])
    expect(columnItems([], [PIPELINE])).toEqual([])
  })

  it('a task whose group the board does not list is shown loose', () => {
    expect(shape(columnItems([card('a', 'gone')], [PIPELINE]))).toEqual(['a'])
  })
})
