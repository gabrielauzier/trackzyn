import { describe, expect, it } from 'vitest'

import { type BlockInput, type PendingInput, capacity, groupPending, suggestedBlock } from './rules'

const NOW = 14 * 60 + 20

type Task = PendingInput & { id: string }
const task = (id: string, given: Partial<PendingInput> = {}): Task => ({
  id,
  estimate_minutes: null,
  position: 0,
  scheduled_minute: null,
  plan_minute: null,
  has_session_today: false,
  days_late: null,
  ...given,
})
const groups = (tasks: Task[], now = NOW) => groupPending(tasks, now).map((group) => [group.key, group.tasks.map((item) => item.id)])

describe('groupPending (HOJE-25, HOJE-26)', () => {
  it('puts each task in its own group, in the order Atrasada, Com horário, No plano, Veio de dias anteriores, Sem plano', () => {
    expect(
      groups([
        task('unplanned'),
        task('carried', { days_late: 3 }),
        task('planned', { plan_minute: 16 * 60 }),
        task('timed', { scheduled_minute: 17 * 60 }),
        task('late', { scheduled_minute: 13 * 60 }),
      ]),
    ).toEqual([
      ['late', ['late']],
      ['timed', ['timed']],
      ['planned', ['planned']],
      ['carried', ['carried']],
      ['unplanned', ['unplanned']],
    ])
  })

  it('puts a task that fits two groups only in the first one', () => {
    // Late, timed, planned and carried at once: only Atrasada.
    const all = task('all', { scheduled_minute: 13 * 60, plan_minute: 13 * 60 + 30, days_late: 2 })
    // Timed and planned in the future, and carried: only Com horário.
    const timed = task('timed', { scheduled_minute: 16 * 60, plan_minute: 15 * 60, days_late: 1 })
    // Planned in the future and carried: only No plano.
    const planned = task('planned', { plan_minute: 15 * 60, days_late: 4 })
    expect(groups([all, timed, planned])).toEqual([
      ['late', ['all']],
      ['timed', ['timed']],
      ['planned', ['planned']],
    ])
  })

  it('leaves the empty groups out', () => {
    expect(groups([task('a'), task('b')])).toEqual([['unplanned', ['a', 'b']]])
    expect(groupPending([], NOW)).toEqual([])
  })

  it('takes the start of the first planned block as the start of a task without a scheduled time', () => {
    expect(groups([task('a', { plan_minute: 13 * 60 + 30 })])).toEqual([['late', ['a']]])
  })

  it('needs a start before now for Atrasada: a task starting now or later is not late', () => {
    expect(groups([task('now', { scheduled_minute: NOW }), task('later', { plan_minute: NOW + 1 })])).toEqual([
      ['timed', ['now']],
      ['planned', ['later']],
    ])
  })

  it('needs no session today for Atrasada: the same task with a session today goes to Com horário', () => {
    const late = { scheduled_minute: 13 * 60 }
    expect(groups([task('a', late)])).toEqual([['late', ['a']]])
    expect(groups([task('a', { ...late, has_session_today: true })])).toEqual([['timed', ['a']]])
  })

  it('a planned task past its start with a session today goes to No plano', () => {
    expect(groups([task('a', { plan_minute: 10 * 60, has_session_today: true })])).toEqual([['planned', ['a']]])
  })

  it('orders a group by the start of today, then by the position in the column', () => {
    expect(
      groups([
        task('c', { scheduled_minute: 17 * 60, position: 0 }),
        task('a', { scheduled_minute: 15 * 60, position: 5 }),
        task('b', { scheduled_minute: 16 * 60, position: 1 }),
      ]),
    ).toEqual([['timed', ['a', 'b', 'c']]])
    expect(groups([task('y', { days_late: 1, position: 2 }), task('x', { days_late: 5, position: 1 })])).toEqual([['carried', ['x', 'y']]])
    expect(groups([task('q', { position: 3 }), task('p', { position: 0 })])).toEqual([['unplanned', ['p', 'q']]])
  })
})

describe('capacity (HOJE-29 to HOJE-32)', () => {
  const end19 = 19 * 60

  it('at 14:20 with the end at 19:00, 4h estimated and 58min left of the focus: 18min over', () => {
    const pending = [task('a', { estimate_minutes: 90 }), task('b', { estimate_minutes: 150 })]
    expect(capacity(pending, 58 * 60, NOW, end19)).toEqual({
      needSeconds: (4 * 60 + 58) * 60,
      leftSeconds: (4 * 60 + 40) * 60,
      overSeconds: 18 * 60,
      freeSeconds: 0,
      withoutEstimate: 0,
    })
  })

  it('answers the free time when the work fits', () => {
    expect(capacity([task('a', { estimate_minutes: 240 })], 0, NOW, end19)).toMatchObject({ overSeconds: 0, freeSeconds: 40 * 60 })
  })

  it('answers 0 left after the end of the workday, so everything is over', () => {
    const at = 18 * 60 + 30
    expect(capacity([task('a', { estimate_minutes: 30 })], 0, at, 18 * 60)).toEqual({
      needSeconds: 30 * 60,
      leftSeconds: 0,
      overSeconds: 30 * 60,
      freeSeconds: 0,
      withoutEstimate: 0,
    })
  })

  it('counts a task without an estimate as 0 and as one withoutEstimate', () => {
    const pending = [task('a', { estimate_minutes: 60 }), task('b'), task('c')]
    expect(capacity(pending, 0, NOW, end19)).toMatchObject({ needSeconds: 3600, withoutEstimate: 2 })
  })
})

describe('suggestedBlock (HOJE-11)', () => {
  type Block = BlockInput & { id: string }
  const block = (id: string, start: number, minutes: number, given: Partial<BlockInput> = {}): Block => ({
    id,
    kind: 'task',
    start_minute: start,
    minutes,
    done: false,
    ...given,
  })

  it('answers the task block that holds now', () => {
    const write = block('write', 13 * 60 + 30, 90)
    expect(suggestedBlock([block('before', 9 * 60, 60), write, block('after', 16 * 60, 30)], NOW)).toBe(write)
  })

  it('takes the start in and leaves the end out', () => {
    const starts = block('starts', NOW, 30)
    expect(suggestedBlock([starts], NOW)).toBe(starts)
    expect(suggestedBlock([block('ends', NOW - 30, 30)], NOW)).toBeNull()
  })

  it('leaves out a break block and the block of a done task', () => {
    expect(suggestedBlock([block('lunch', 14 * 60, 60, { kind: 'break' }), block('done', 14 * 60, 60, { done: true })], NOW)).toBeNull()
  })

  it('takes the block that started last when two overlap', () => {
    const later = block('later', 14 * 60, 60)
    expect(suggestedBlock([block('earlier', 13 * 60, 120), later], NOW)).toBe(later)
    expect(suggestedBlock([later, block('earlier', 13 * 60, 120)], NOW)).toBe(later)
  })

  it('answers null outside every block', () => {
    expect(suggestedBlock([block('morning', 9 * 60, 60)], NOW)).toBeNull()
    expect(suggestedBlock([], NOW)).toBeNull()
  })
})
