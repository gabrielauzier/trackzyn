import { describe, expect, it } from 'vitest'

import { measure, merge } from './intervals'

describe('merge', () => {
  it('sorts the intervals and joins the ones that overlap or touch', () => {
    expect(
      merge([
        [300, 360],
        [0, 60],
        [30, 90],
        [90, 120],
      ]),
    ).toEqual([
      [0, 120],
      [300, 360],
    ])
  })

  it('leaves out empty and inverted intervals', () => {
    expect(
      merge([
        [10, 10],
        [50, 40],
        [0, 5],
      ]),
    ).toEqual([[0, 5]])
  })
})

describe('measure', () => {
  it('HOURS-09 counts 09:00–11:00 and 10:00–12:00 as 3h', () => {
    expect(
      measure([
        [540, 660],
        [600, 720],
      ]),
    ).toBe(180)
  })

  it('HOURS-32 counts two intervals that only touch in full', () => {
    expect(
      measure([
        [0, 60],
        [60, 90],
      ]),
    ).toBe(90)
  })

  it('HOURS-33 counts an interval inside another as the longer one', () => {
    expect(
      measure([
        [0, 120],
        [30, 60],
      ]),
    ).toBe(120)
  })

  it('HOURS-34 counts a chain of three from the first start to the last end, in any order', () => {
    expect(
      measure([
        [110, 150],
        [0, 60],
        [45, 120],
      ]),
    ).toBe(150)
  })

  it('counts nothing for no intervals, and keeps fractions', () => {
    expect(measure([])).toBe(0)
    expect(measure([[0.5, 2.25]])).toBe(1.75)
  })

  it('HOURS-28 cuts the union to `within` at both ends', () => {
    expect(measure([[480, 600], [1020, 1140]], { within: [540, 1080] })).toBe(60 + 60)
  })

  it('HOURS-29 takes out only the part covered by `exclude`', () => {
    expect(measure([[720, 780]], { exclude: [[600, 750]] })).toBe(30)
    expect(measure([[720, 780]], { exclude: [[600, 700], [800, 900]] })).toBe(60)
    expect(measure([[720, 780]], { exclude: [[700, 800]] })).toBe(0)
  })

  it('HOURS-29 cuts to `within` and takes out `exclude` together, counting overlapping excludes once', () => {
    // Workday 09:00–18:00, a break 12:00–14:00, task blocks 11:00–12:30 and 12:15–13:00: 1h left.
    expect(
      measure([[720, 840]], {
        within: [540, 1080],
        exclude: [
          [660, 750],
          [735, 780],
        ],
      }),
    ).toBe(60)
  })
})
