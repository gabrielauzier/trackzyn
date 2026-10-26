import { describe, expect, it } from 'vitest'

import { dropTarget } from '@/components/board/drop-target'
import type { Board, TaskCardView } from '@/types'

const card = (id: string, position: number): TaskCardView => ({
  id,
  title: id,
  estimate_minutes: null,
  spent_seconds: 0,
  position,
  subtasks: { done: 0, total: 0 },
})

// Backlog is empty; Today has three cards, This week one, Concluídas one.
const board: Board = {
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
