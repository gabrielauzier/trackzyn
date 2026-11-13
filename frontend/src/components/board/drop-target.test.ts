import { describe, expect, it } from 'vitest'

import { dropTarget, groupDropTarget } from '@/components/board/drop-target'
import type { Board, TaskCardView } from '@/types'
import { PLAIN_TASK_FIELDS } from '@/test/utils'

const card = (id: string, position: number): TaskCardView => ({ ...PLAIN_TASK_FIELDS,
  id,
  title: id,
  estimate_minutes: null,
  spent_seconds: 0,
  position,
  subtasks: { done: 0, total: 0 },
  created_via: null,
  scheduled_on: null,
  scheduled_time: null,
  series: null,
})

// Backlog is empty; Today has three cards, This week one, Concluídas one.
const board: Board = { groups: [],
  list: { id: 'list', name: 'List', color: 0 },
  timezone: 'America/Sao_Paulo',
  pending: { count: 4, estimate_minutes: 0 },
  columns: {
    backlog: { tasks: [], estimate_minutes: 0 },
    this_week: { tasks: [card('w1', 1)], estimate_minutes: 0, done: 0, total: 1 },
    today: { tasks: [card('t1', 1), card('t2', 2), card('t3', 3)], estimate_minutes: 0, done: 0, total: 3 },
    done: { today_count: 1, days: [{ date: '2026-10-25', tasks: [card('d1', 1)] }] },
  },
}

describe('dropTarget', () => {
  it('sends a task dropped on the area of a column with cards to the end of it (BOARD-03)', () => {
    expect(dropTarget(board, 'w1', 'column:today')).toEqual({ column: 'today', before: null })
    expect(dropTarget(board, 't1', 'column:today')).toEqual({ column: 'today', before: null })
  })

  it('sends a task dropped on an empty column to the end of it', () => {
    expect(dropTarget(board, 't2', 'column:backlog')).toEqual({ column: 'backlog', before: null })
  })

  it('sends a task dropped on the This week area to the end of This week (BOARD-03)', () => {
    expect(dropTarget(board, 't1', 'column:this_week')).toEqual({ column: 'this_week', before: null })
    expect(dropTarget(board, 'w1', 'column:this_week')).toEqual({ column: 'this_week', before: null })
  })

  it('reorders a task down within the same column, before the card that follows the target', () => {
    expect(dropTarget(board, 't1', 't2')).toEqual({ column: 'today', before: 't3' })
    expect(dropTarget(board, 't1', 't3')).toEqual({ column: 'today', before: null })
  })

  it('reorders a task up within the same column, before the target card', () => {
    expect(dropTarget(board, 't3', 't2')).toEqual({ column: 'today', before: 't2' })
    expect(dropTarget(board, 't3', 't1')).toEqual({ column: 'today', before: 't1' })
  })

  it('puts a task dropped on a card of another column right before that card', () => {
    expect(dropTarget(board, 'w1', 't2')).toEqual({ column: 'today', before: 't2' })
    expect(dropTarget(board, 't3', 'w1')).toEqual({ column: 'this_week', before: 'w1' })
  })

  it('sends a pending task dropped on Concluídas, or on one of its cards, into done', () => {
    expect(dropTarget(board, 't1', 'column:done')).toEqual({ column: 'done', before: null })
    expect(dropTarget(board, 'w1', 'd1')).toEqual({ column: 'done', before: null })
  })

  it('takes a task out of Concluídas into the pending column it lands on', () => {
    expect(dropTarget(board, 'd1', 'column:today')).toEqual({ column: 'today', before: null })
    expect(dropTarget(board, 'd1', 't2')).toEqual({ column: 'today', before: 't2' })
  })

  it('changes nothing for a drop on itself, inside Concluídas, or on unknown ids', () => {
    expect(dropTarget(board, 't2', 't2')).toBeNull()
    expect(dropTarget(board, 'd1', 'column:done')).toBeNull()
    expect(dropTarget(board, 'missing', 't1')).toBeNull()
    expect(dropTarget(board, 't1', 'missing')).toBeNull()
    expect(dropTarget(board, 't1', 'column:nowhere')).toBeNull()
  })
})

describe('dropTarget with groups (GRP-06, GRP-07, GRP-08)', () => {
  const inGroup = (id: string, position: number, group_id: string | null) => ({ ...card(id, position), group_id })
  // Today: t1, then the block of g1 (a1, a2), then t2. This week: w1 and a3 of g1. Backlog: b1 of g2. Done: d1 of g1.
  const grouped: Board = {
    ...board,
    groups: [
      { id: 'g1', name: 'Pipeline', priority: 'none', due_on: null },
      { id: 'g2', name: 'Portal', priority: 'none', due_on: null },
    ],
    columns: {
      backlog: { tasks: [inGroup('b1', 0, 'g2')], estimate_minutes: 0 },
      this_week: { tasks: [inGroup('w1', 0, null), inGroup('a3', 1, 'g1')], estimate_minutes: 0, done: 0, total: 2 },
      today: { tasks: [inGroup('t1', 0, null), inGroup('a1', 1, 'g1'), inGroup('a2', 2, 'g1'), inGroup('t2', 3, null)], estimate_minutes: 0, done: 0, total: 4 },
      done: { today_count: 1, days: [{ date: '2026-10-25', tasks: [inGroup('d1', 0, 'g1')] }] },
    },
  }

  it('GRP-06 a task of the group dropped on a card of its container in another column keeps the group', () => {
    expect(dropTarget(grouped, 'a3', 'a1')).toEqual({ column: 'today', before: 'a1', group: 'g1' })
  })

  it('GRP-06 a task of the group reordered inside its container keeps the group', () => {
    expect(dropTarget(grouped, 'a1', 'a2')).toEqual({ column: 'today', before: 't2', group: 'g1' })
  })

  it('GRP-08 a loose task dropped on a card of a container enters the group, at that place', () => {
    expect(dropTarget(grouped, 't2', 'a2')).toEqual({ column: 'today', before: 'a2', group: 'g1' })
    expect(dropTarget(grouped, 'w1', 'a1')).toEqual({ column: 'today', before: 'a1', group: 'g1' })
  })

  it('a task of one group dropped on a card of another group moves to that group', () => {
    expect(dropTarget(grouped, 'a3', 'b1')).toEqual({ column: 'backlog', before: 'b1', group: 'g2' })
  })

  it('GRP-07 a task of the group dropped on a loose card leaves the group, at that place', () => {
    expect(dropTarget(grouped, 'a1', 't1')).toEqual({ column: 'today', before: 't1', group: null })
    expect(dropTarget(grouped, 'a3', 'w1')).toEqual({ column: 'this_week', before: 'w1', group: null })
  })

  it('a loose task dropped on a loose card keeps having no group, with the group left out', () => {
    expect(dropTarget(grouped, 'w1', 't1')).toEqual({ column: 'today', before: 't1', group: undefined })
  })

  it('GRP-06, GRP-08 a drop on the area of a container, group:<id>:<col>, goes to the end of its block in that column', () => {
    expect(dropTarget(grouped, 'w1', 'group:g1:today')).toEqual({ column: 'today', before: 't2', group: 'g1' })
    expect(dropTarget(grouped, 'a3', 'group:g1:today')).toEqual({ column: 'today', before: 't2', group: 'g1' })
  })

  it('GRP-08 a drop on the title of a container, container:<id>:<col>, goes to the start of its block', () => {
    expect(dropTarget(grouped, 'w1', 'container:g1:today')).toEqual({ column: 'today', before: 'a1', group: 'g1' })
  })

  it('GRP-07 a task of the group dropped on the column area, column:<col>, leaves the group at the end of the column', () => {
    expect(dropTarget(grouped, 'a3', 'column:today')).toEqual({ column: 'today', before: null, group: null })
    expect(dropTarget(grouped, 'w1', 'column:today')).toEqual({ column: 'today', before: null, group: undefined })
  })

  it('into Concluídas a task keeps its group', () => {
    expect(dropTarget(grouped, 'a1', 'column:done')).toEqual({ column: 'done', before: null })
    expect(dropTarget(grouped, 'a1', 'group:g1:done')).toEqual({ column: 'done', before: null })
  })

  it('changes nothing for an area of an unknown column', () => {
    expect(dropTarget(grouped, 'w1', 'group:g1:nowhere')).toBeNull()
  })
})

describe('groupDropTarget: the whole container dragged by its title (GRP-09)', () => {
  const inGroup = (id: string, group_id: string | null) => ({ ...card(id, 0), group_id })
  const grouped: Board = {
    ...board,
    groups: [{ id: 'g1', name: 'Pipeline', priority: 'none', due_on: null }],
    columns: {
      backlog: { tasks: [], estimate_minutes: 0 },
      this_week: { tasks: [inGroup('a1', 'g1'), inGroup('a2', 'g1'), inGroup('w1', null)], estimate_minutes: 0, done: 0, total: 3 },
      today: { tasks: [inGroup('t1', null), inGroup('a3', 'g1'), inGroup('t2', null)], estimate_minutes: 0, done: 0, total: 3 },
      done: { today_count: 0, days: [] },
    },
  }

  it('moves the block of the column it came from to the end of the column it is dropped on', () => {
    expect(groupDropTarget(grouped, 'container:g1:this_week', 'column:backlog')).toEqual({ group: 'g1', from: 'this_week', to: 'backlog', before: null })
  })

  it('moves the block right before the card it is dropped on', () => {
    expect(groupDropTarget(grouped, 'container:g1:this_week', 't1')).toEqual({ group: 'g1', from: 'this_week', to: 'today', before: 't1' })
  })

  it('dropped on a container of another column, goes before the first task of that block', () => {
    expect(groupDropTarget(grouped, 'container:g1:this_week', 'group:g1:today')).toEqual({ group: 'g1', from: 'this_week', to: 'today', before: 'a3' })
    expect(groupDropTarget(grouped, 'container:g1:this_week', 'container:g1:today')).toEqual({ group: 'g1', from: 'this_week', to: 'today', before: 'a3' })
  })

  it('goes into Concluídas at no particular place', () => {
    expect(groupDropTarget(grouped, 'container:g1:today', 'column:done')).toEqual({ group: 'g1', from: 'today', to: 'done', before: null })
  })

  it('changes nothing in its own column or over unknown ids', () => {
    expect(groupDropTarget(grouped, 'container:g1:this_week', 'w1')).toBeNull()
    expect(groupDropTarget(grouped, 'container:g1:this_week', 'column:this_week')).toBeNull()
    expect(groupDropTarget(grouped, 'container:g1:this_week', 'missing')).toBeNull()
    expect(groupDropTarget(grouped, 'a1', 'column:today')).toBeNull()
  })
})
