import { describe, expect, it } from 'vitest'

import { parseDuration, toDuration } from '@/components/board/estimate'

describe('estimate in HH:MM', () => {
  it('parses HH:MM within 00:01 and 24:00', () => {
    expect(parseDuration('01:30')).toEqual({ minutes: 90 })
    expect(parseDuration('00:01')).toEqual({ minutes: 1 })
    expect(parseDuration('24:00')).toEqual({ minutes: 1440 })
    expect(parseDuration('00:59')).toEqual({ minutes: 59 })
    // Empty means no estimate.
    expect(parseDuration('')).toEqual({ minutes: null })
    expect(parseDuration('  ')).toEqual({ minutes: null })

    // Minutes above 59.
    expect(parseDuration('01:75')).toEqual({ error: 'minutes' })
    expect(parseDuration('00:60')).toEqual({ error: 'minutes' })
    // Outside 00:01 to 24:00.
    expect(parseDuration('24:01')).toEqual({ error: 'limit' })
    expect(parseDuration('25:00')).toEqual({ error: 'limit' })
    expect(parseDuration('00:00')).toEqual({ error: 'limit' })
    // Not a whole HH:MM.
    expect(parseDuration('01:3')).toEqual({ error: 'format' })
    expect(parseDuration('01')).toEqual({ error: 'format' })
    expect(parseDuration('ab:cd')).toEqual({ error: 'format' })
  })

  it('writes minutes as HH:MM, and no estimate as empty', () => {
    expect(toDuration(90)).toBe('01:30')
    expect(toDuration(1)).toBe('00:01')
    expect(toDuration(1440)).toBe('24:00')
    expect(toDuration(null)).toBe('')
  })
})
