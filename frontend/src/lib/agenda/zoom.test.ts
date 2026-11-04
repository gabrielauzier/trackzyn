import { afterEach, describe, expect, it, vi } from 'vitest'

import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { DEFAULT_ZOOM, ZOOMS, ZOOM_STORAGE_KEY, pxPerMinuteAt, readZoom, saveZoom } from './zoom'

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

describe('the remembered zoom', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads 3x when nothing is stored, and the level saved last otherwise', () => {
    expect(readZoom()).toBe(3)
    saveZoom(1)
    expect(localStorage.getItem(ZOOM_STORAGE_KEY)).toBe('1')
    expect(readZoom()).toBe(1)
    saveZoom(2)
    expect(readZoom()).toBe(2)
  })

  it('reads 3x for a stored value that is not 1, 2 or 3', () => {
    for (const value of ['4', '0', '1.5', 'big', '']) {
      localStorage.setItem(ZOOM_STORAGE_KEY, value)
      expect(readZoom()).toBe(3)
    }
  })

  it('reads 3x and saves nothing, without throwing, when storage is off', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readZoom()).toBe(3)
    expect(() => saveZoom(1)).not.toThrow()
  })
})
