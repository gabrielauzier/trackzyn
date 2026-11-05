import { afterEach, describe, expect, it, vi } from 'vitest'

import { HIDE_BREAKS_STORAGE_KEY, readHideBreaks, saveHideBreaks } from './hide-breaks'

describe('hide breaks choice', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('ADJ-21 ADJ-25 reads off with nothing stored or with junk', () => {
    expect(readHideBreaks()).toBe(false)
    for (const value of ['junk', '1', 'TRUE', '{"a":1}', 'false']) {
      localStorage.setItem(HIDE_BREAKS_STORAGE_KEY, value)
      expect(readHideBreaks()).toBe(false)
    }
  })

  it('ADJ-25 reads the choice saved last', () => {
    saveHideBreaks(true)
    expect(localStorage.getItem(HIDE_BREAKS_STORAGE_KEY)).toBe('true')
    expect(readHideBreaks()).toBe(true)
    saveHideBreaks(false)
    expect(readHideBreaks()).toBe(false)
  })

  it('ADJ-25 reads off and saves nothing, without throwing, when storage is off', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('blocked', 'SecurityError')
    })
    expect(readHideBreaks()).toBe(false)
    expect(() => saveHideBreaks(true)).not.toThrow()
  })
})
