import { describe, expect, it } from 'vitest'

import type { PlanBlock, PlanTaskRef } from '@/types'
import { clampBreak, clampTask, draftReducer, emptyDraft, isDirty, toInput, type DraftState } from './draft'

const list = { id: 'l1', name: 'Work', color: 3 }
const otherList = { id: 'l2', name: 'Home', color: 5 }
const task = (id: string, estimate: number | null): PlanTaskRef => ({
  id,
  title: `Task ${id}`,
  list,
  done: false,
  scheduled_on: null,
  estimate_minutes: estimate,
})
const at = (hours: number, minutes = 0) => hours * 60 + minutes

const saved: PlanBlock[] = [
  { id: 'b1', kind: 'task', start: '09:00', minutes: 90, task: task('t1', 90) },
  { id: 'b2', kind: 'break', start: '12:00', minutes: 60, name: 'Almoço', list },
]

const reset = (blocks: PlanBlock[] = saved): DraftState => draftReducer(emptyDraft, { type: 'reset', saved: blocks })
const keyOf = (state: DraftState, index: number) => state.blocks[index]!.key

describe('draftReducer add (PLAN-04, PLAN-15)', () => {
  it('drops a task without an estimate as a 1h block at the quarter of the pointer', () => {
    const state = draftReducer(emptyDraft, { type: 'add', item: { kind: 'task', task: task('t1', null) }, start: at(10, 37) })
    expect(state.blocks).toEqual([expect.objectContaining({ kind: 'task', start: at(10, 30), minutes: 60, task: task('t1', null) })])
  })

  it('drops a task with an estimate for the estimate', () => {
    const state = draftReducer(emptyDraft, { type: 'add', item: { kind: 'task', task: task('t1', 25) }, start: at(14, 0) })
    expect(state.blocks[0]).toMatchObject({ start: at(14, 0), minutes: 25 })
  })

  it('drops a break with its name, length and list', () => {
    const state = draftReducer(emptyDraft, { type: 'add', item: { kind: 'break', name: 'Café', minutes: 15, list }, start: at(10, 5) })
    expect(state.blocks).toEqual([expect.objectContaining({ kind: 'break', name: 'Café', minutes: 15, list, start: at(10, 0) })])
  })

  it('takes the same task twice as two blocks', () => {
    let state = draftReducer(emptyDraft, { type: 'add', item: { kind: 'task', task: task('t1', 60) }, start: at(9) })
    state = draftReducer(state, { type: 'add', item: { kind: 'task', task: task('t1', 60) }, start: at(15) })
    expect(state.blocks).toHaveLength(2)
    expect(keyOf(state, 0)).not.toBe(keyOf(state, 1))
  })
})

describe('draftReducer move and resize (PLAN-05)', () => {
  it('moves a block in steps of 15 min', () => {
    const state = reset()
    const moved = draftReducer(state, { type: 'move', key: keyOf(state, 0), start: at(10, 52) })
    expect(moved.blocks[0]).toMatchObject({ start: at(10, 45), minutes: 90 })
  })

  it('pulls the bottom edge in steps of 15 min, keeping the estimate of the task', () => {
    const state = reset()
    const resized = draftReducer(state, { type: 'resize', key: keyOf(state, 0), minutes: 128 })
    expect(resized.blocks[0]).toMatchObject({ start: at(9), minutes: 135 })
    expect(resized.blocks[0]).toMatchObject({ task: { estimate_minutes: 90 } })
  })

  it('keeps a task block at most 24 h long', () => {
    const state = reset()
    const resized = draftReducer(state, { type: 'resize', key: keyOf(state, 0), minutes: 2000 })
    expect(resized.blocks[0]).toMatchObject({ minutes: 1440 })
  })

  it('refuses a break pulled past 2h and keeps its length (PLAN-17)', () => {
    const state = reset()
    const resized = draftReducer(state, { type: 'resize', key: keyOf(state, 1), minutes: 135 })
    expect(resized.blocks[1]).toMatchObject({ minutes: 60 })
    expect(resized.error).toBe('break_range')
  })
})

describe('draftReducer edit and remove (PLAN-06, PLAN-18)', () => {
  it('takes any minute for the start and the length typed in HH:MM', () => {
    const state = reset()
    const edited = draftReducer(state, { type: 'edit', key: keyOf(state, 0), start: at(10, 7), minutes: 37 })
    expect(edited.blocks[0]).toMatchObject({ start: at(10, 7), minutes: 37 })
  })

  it('refuses a break typed under 5 min, keeping the length, and clears the error on the next change (PLAN-17)', () => {
    const state = reset()
    const refused = draftReducer(state, { type: 'edit', key: keyOf(state, 1), minutes: 4 })
    expect(refused.blocks[1]).toMatchObject({ minutes: 60 })
    expect(refused.error).toBe('break_range')
    const next = draftReducer(refused, { type: 'edit', key: keyOf(state, 1), minutes: 120 })
    expect(next.blocks[1]).toMatchObject({ minutes: 120 })
    expect(next.error).toBeNull()
  })

  it('changes the list of a break', () => {
    const state = reset()
    const edited = draftReducer(state, { type: 'edit', key: keyOf(state, 1), list: otherList })
    expect(edited.blocks[1]).toMatchObject({ list: otherList })
  })

  it('removes a block from the draft', () => {
    const state = reset()
    const removed = draftReducer(state, { type: 'remove', key: keyOf(state, 0) })
    expect(removed.blocks).toEqual([expect.objectContaining({ kind: 'break', name: 'Almoço' })])
  })
})

describe('isDirty (PLAN-07, PLAN-11)', () => {
  it('is false right after reset(saved), with the saved blocks in the draft', () => {
    const state = reset()
    expect(isDirty(state)).toBe(false)
    expect(state.blocks.map((block) => [block.kind, block.start, block.minutes])).toEqual([
      ['task', at(9), 90],
      ['break', at(12), 60],
    ])
  })

  it('is true after any change', () => {
    const state = reset()
    const key = keyOf(state, 0)
    expect(isDirty(draftReducer(state, { type: 'add', item: { kind: 'task', task: task('t2', null) }, start: at(15) }))).toBe(true)
    expect(isDirty(draftReducer(state, { type: 'move', key, start: at(10) }))).toBe(true)
    expect(isDirty(draftReducer(state, { type: 'resize', key, minutes: 120 }))).toBe(true)
    expect(isDirty(draftReducer(state, { type: 'edit', key, start: at(9, 1) }))).toBe(true)
    expect(isDirty(draftReducer(state, { type: 'remove', key }))).toBe(true)
  })

  it('is false again once the block is put back where it was saved', () => {
    const state = reset()
    const key = keyOf(state, 0)
    const back = draftReducer(draftReducer(state, { type: 'move', key, start: at(10) }), { type: 'move', key, start: at(9) })
    expect(isDirty(back)).toBe(false)
  })
})

describe('toInput', () => {
  it('gives the body of PUT /api/plans/:day, with HH:MM starts and the id of a saved break (PLAN-49)', () => {
    expect(toInput(reset().blocks)).toEqual([
      { kind: 'task', task_id: 't1', start: '09:00', minutes: 90 },
      { kind: 'break', id: 'b2', name: 'Almoço', list_id: 'l1', start: '12:00', minutes: 60 },
    ])
  })

  it('PLAN-49 sends a new break without an id', () => {
    const added = draftReducer(emptyDraft, { type: 'add', item: { kind: 'break', name: 'Café', minutes: 15, list: { id: 'l1', name: 'Work', color: 3 } }, start: 600 })
    expect(toInput(added.blocks)).toEqual([{ kind: 'break', name: 'Café', list_id: 'l1', start: '10:00', minutes: 15 }])
  })
})

describe('clampTask and clampBreak (PLAN-05, PLAN-17)', () => {
  it('keeps a task block from 5 min to 24 h', () => {
    expect([clampTask(3), clampTask(5), clampTask(1440), clampTask(1500)]).toEqual([5, 5, 1440, 1440])
  })

  it('takes a break from 5 to 120 min and refuses anything else with an error', () => {
    expect([clampBreak(5), clampBreak(120)]).toEqual([
      { ok: true, minutes: 5 },
      { ok: true, minutes: 120 },
    ])
    expect([clampBreak(4), clampBreak(121)]).toEqual([
      { ok: false, error: 'break_range' },
      { ok: false, error: 'break_range' },
    ])
  })
})
