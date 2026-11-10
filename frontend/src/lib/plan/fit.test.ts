import { describe, expect, it } from 'vitest'

import { fit } from './fit'

const workday = { start: '09:00', end: '18:00' }
const task = (id: string, minutes: number) => ({ id, minutes })
const at = (hours: number, minutes = 0) => hours * 60 + minutes

describe('fit (PLAN-32, PLAN-33)', () => {
  it('puts three tasks of 1h in a free workday at 09:00, 10:00 and 11:00, in the order given', () => {
    const result = fit([task('a', 60), task('b', 60), task('c', 60)], [], workday)

    expect(result.placed).toEqual([
      { task: task('a', 60), start: at(9) },
      { task: task('b', 60), start: at(10) },
      { task: task('c', 60), start: at(11) },
    ])
    expect(result.left).toEqual([])
  })

  it('skips the taken time: blocks, sessions and timed tasks, and a gap too short for the task', () => {
    const occupied = [
      { start: at(9), minutes: 30 }, // a session 09:00–09:30
      { start: at(10), minutes: 60 }, // a timed task 10:00–11:00
      { start: at(12), minutes: 60 }, // a block of the draft 12:00–13:00
    ]
    const result = fit([task('long', 60), task('short', 30)], occupied, workday)

    // 09:30–10:00 is too short for 1h; 11:00–12:00 holds it. The 30 min then takes 09:30.
    expect(result.placed).toEqual([
      { task: task('long', 60), start: at(11) },
      { task: task('short', 30), start: at(9, 30) },
    ])
  })

  it('starts on the next quarter after a time that ends off the grid step', () => {
    const result = fit([task('a', 30)], [{ start: at(9), minutes: 50 }], workday)

    expect(result.placed).toEqual([{ task: task('a', 30), start: at(10) }])
  })

  it('stays inside the workday and gives back a task bigger than every gap in left', () => {
    const occupied = [{ start: at(12), minutes: 60 }]
    const result = fit([task('huge', 5 * 60), task('fits', 3 * 60)], occupied, workday)

    // 09:00–12:00 holds 3h and 13:00–18:00 holds 5h: the 5h takes the afternoon, the 3h the morning.
    expect(result.placed).toEqual([
      { task: task('huge', 5 * 60), start: at(13) },
      { task: task('fits', 3 * 60), start: at(9) },
    ])
    expect(fit([task('too big', 6 * 60)], occupied, workday)).toEqual({ placed: [], left: [task('too big', 6 * 60)] })
  })

  it('ignores the time taken outside the workday and never places past its end', () => {
    const result = fit([task('a', 60), task('b', 60)], [{ start: at(7), minutes: 60 }], { start: '16:00', end: '18:00' })
    expect(result.placed.map(({ start }) => start)).toEqual([at(16), at(17)])

    expect(fit([task('c', 90)], [], { start: '17:00', end: '18:00' }).left).toEqual([task('c', 90)])
  })
})
