import { afterEach, describe, expect, it, vi } from 'vitest'

import { ALL_DAYS, DAYS_STORAGE_KEY, WORK_DAYS, readShownDays, saveShownDays, toggleDay } from './week-days'

describe('shown week days', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('DAYS-15 reads the seven days with nothing stored, junk, an empty list or a day out of the week', () => {
    expect(readShownDays()).toEqual([0, 1, 2, 3, 4, 5, 6])
    for (const value of ['junk', '[]', '{"a":1}', '[0,7]', '[1.5]', '"0,1"']) {
      localStorage.setItem(DAYS_STORAGE_KEY, value)
      expect(readShownDays()).toEqual([0, 1, 2, 3, 4, 5, 6])
    }
  })

  it('DAYS-15 reads the days saved last, in week order and without repeats', () => {
    saveShownDays([0, 1, 2, 3, 4])
    expect(readShownDays()).toEqual([0, 1, 2, 3, 4])
    localStorage.setItem(DAYS_STORAGE_KEY, '[4,0,4,2]')
    expect(readShownDays()).toEqual([0, 2, 4])
  })

  it('DAYS-15 reads the seven days and saves nothing, without throwing, when storage is off', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readShownDays()).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(() => saveShownDays([0])).not.toThrow()
  })

  it('DAYS-11 DAYS-12 has Mon – Fri as Monday to Friday and All as the seven days', () => {
    expect(WORK_DAYS).toEqual([0, 1, 2, 3, 4])
    expect(ALL_DAYS).toEqual([0, 1, 2, 3, 4, 5, 6])
  })

  it('DAYS-13 unchecks a day, checks it back in its place, and never leaves the week empty', () => {
    expect(toggleDay([0, 1, 2, 3, 4, 5, 6], 5)).toEqual([0, 1, 2, 3, 4, 6])
    expect(toggleDay([0, 2, 4], 1)).toEqual([0, 1, 2, 4])
    expect(toggleDay([3], 3)).toEqual([3])
  })
})
