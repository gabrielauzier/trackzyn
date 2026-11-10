import { describe, expect, it } from 'vitest'

import type { PlanTaskRef } from '@/types'
import { capacity, type FixedTimed } from './capacity'
import type { DraftBlock } from './draft'

const list = { id: 'l1', name: 'Work', color: 3 }
const workday = { start: '09:00', end: '18:00' }
const at = (hours: number, minutes = 0) => hours * 60 + minutes
const ref = (id: string): PlanTaskRef => ({ id, title: id, list, done: false, scheduled_on: null, estimate_minutes: null })
const taskBlock = (id: string, start: number, minutes: number): DraftBlock => ({ key: `k-${id}-${start}`, kind: 'task', start, minutes, task: ref(id) })
const breakBlock = (start: number, minutes: number): DraftBlock => ({ key: `b-${start}`, kind: 'break', start, minutes, name: 'Almoço', list })

/** 9h of tasks: 09:00–12:00, 13:00–18:00 and 18:00–19:00. */
const nineHours = [taskBlock('a', at(9), 180), taskBlock('b', at(13), 300), taskBlock('c', at(18), 60)]
const lunch = breakBlock(at(12), 60)

describe('capacity (PLAN-19, PLAN-20, PLAN-D7)', () => {
  it('gives 9h planned of 8h free, 1h in breaks and 1h over with a lunch of 1h', () => {
    expect(capacity([...nineHours, lunch], [], workday)).toEqual({ planned: 540, breaks: 60, scheduled: 0, free: 480, over: 60 })
  })

  it('takes a timed task without a block out of the free time: 9h of 7h free, 1h scheduled, 2h over', () => {
    const meeting: FixedTimed = { id: 'm', scheduled_time: '13:00', estimate_minutes: 60 }
    expect(capacity([...nineHours, lunch], [meeting], workday)).toEqual({ planned: 540, breaks: 60, scheduled: 60, free: 420, over: 120 })
  })

  it('counts a timed task without an estimate as 1h', () => {
    expect(capacity([], [{ id: 'm', scheduled_time: '10:00', estimate_minutes: null }], workday)).toMatchObject({ scheduled: 60, free: 480 })
  })

  it('counts a timed task that has a block only by the block', () => {
    const planned = [taskBlock('m', at(15), 30)]
    expect(capacity(planned, [{ id: 'm', scheduled_time: '13:00', estimate_minutes: 60 }], workday)).toEqual({
      planned: 30,
      breaks: 0,
      scheduled: 0,
      free: 540,
      over: 0,
    })
  })

  it('counts only the part of a break inside the workday', () => {
    expect(capacity([breakBlock(at(8, 30), 60)], [], workday)).toMatchObject({ breaks: 30, free: 510 })
    expect(capacity([breakBlock(at(19), 30)], [], workday)).toMatchObject({ breaks: 0, free: 540 })
  })

  it('counts only the part of a timed task inside the workday', () => {
    expect(capacity([], [{ id: 'm', scheduled_time: '17:30', estimate_minutes: 90 }], workday)).toMatchObject({ scheduled: 30, free: 510 })
  })

  it('has nothing over while the planned time fits', () => {
    expect(capacity([taskBlock('a', at(9), 480)], [], workday)).toMatchObject({ planned: 480, over: 0 })
  })
})

describe('capacity in net hours (#42)', () => {
  // The spec example: blocks 10:00–12:00 and 11:00–13:00 and a lunch 12:00–13:00.
  const overlapping = [taskBlock('a', at(10), 120), taskBlock('b', at(11), 120), lunch]

  it('HOURS-27 HOURS-29 HOURS-30 gives 3h planned of 9h free, with the lunch under a block out of the breaks', () => {
    expect(capacity(overlapping, [], workday, 'net')).toEqual({ planned: 180, breaks: 0, scheduled: 0, free: 540, over: 0 })
  })

  it('HOURS-31 keeps 4h planned of 8h free and 1h in breaks in gross, with or without the mode', () => {
    const gross = { planned: 240, breaks: 60, scheduled: 0, free: 480, over: 0 }
    expect(capacity(overlapping, [], workday, 'gross')).toEqual(gross)
    expect(capacity(overlapping, [], workday)).toEqual(gross)
  })

  it('HOURS-28 leaves a timed task without a block out of the scheduled time where a task block covers it', () => {
    const meeting: FixedTimed = { id: 'm', scheduled_time: '13:00', estimate_minutes: 60 }
    expect(capacity([taskBlock('a', at(13), 30)], [meeting], workday, 'net')).toEqual({ planned: 30, breaks: 0, scheduled: 30, free: 510, over: 0 })
  })

  it('HOURS-28 counts two timed tasks that overlap once', () => {
    const first: FixedTimed = { id: 'm1', scheduled_time: '10:00', estimate_minutes: 60 }
    const second: FixedTimed = { id: 'm2', scheduled_time: '10:30', estimate_minutes: 60 }
    expect(capacity([], [first, second], workday, 'net')).toMatchObject({ scheduled: 90, free: 450 })
  })

  it('HOURS-29 takes a break under a timed task out of the breaks', () => {
    const meeting: FixedTimed = { id: 'm', scheduled_time: '12:00', estimate_minutes: 60 }
    expect(capacity([lunch], [meeting], workday, 'net')).toEqual({ planned: 0, breaks: 0, scheduled: 60, free: 480, over: 0 })
  })

  it('HOURS-29 counts two breaks that overlap once, and only inside the workday', () => {
    expect(capacity([breakBlock(at(8, 30), 60), breakBlock(at(9), 60)], [], workday, 'net')).toMatchObject({ breaks: 60, free: 480 })
  })

  it('HOURS-30 measures the excess from the union in net: 8h 30min fits in 9h free, and a block to 19:00 makes it 10h, 1h over', () => {
    const blocks = [taskBlock('a', at(9), 300), taskBlock('b', at(13), 270), lunch]
    // Union 09:00–17:30 is 8h 30min; the lunch lies under the tasks, so 9h are free.
    expect(capacity(blocks, [], workday, 'net')).toEqual({ planned: 510, breaks: 0, scheduled: 0, free: 540, over: 0 })
    expect(capacity([...blocks, taskBlock('c', at(17), 120)], [], workday, 'net')).toEqual({ planned: 600, breaks: 0, scheduled: 0, free: 540, over: 60 })
  })
})
