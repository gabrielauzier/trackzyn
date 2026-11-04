import { describe, expect, it } from 'vitest'

import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { DEFAULT_ZOOM, ZOOMS, pxPerMinuteAt } from './zoom'

describe('agenda zoom', () => {
  it('has exactly 1x, 2x and 3x, with an hour 48, 96 and 144 px tall', () => {
    expect(ZOOMS).toEqual([1, 2, 3])
    expect(ZOOMS.map((zoom) => pxPerMinuteAt(zoom) * 60)).toEqual([48, 96, 144])
  })

  it('opens at 3x, the scale the grid uses without a zoom', () => {
    expect(DEFAULT_ZOOM).toBe(3)
    expect(pxPerMinuteAt(DEFAULT_ZOOM)).toBe(PX_PER_MINUTE)
  })
})
