import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { serverNow, updateOffset } from '@/lib/focus/clock'

/** The server's clock at the moment of the test. */
const SERVER = new Date('2026-10-24T13:00:00.000Z').getTime()
const FIVE_MINUTES = 5 * 60_000

describe('the clock corrected against the server (FOCUS-03)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['5 minutes ahead', FIVE_MINUTES],
    ['5 minutes behind', -FIVE_MINUTES],
  ])('stays within 1 s of the server with the local clock %s', (_label, skew) => {
    vi.setSystemTime(SERVER + skew)
    updateOffset(new Date(SERVER).toISOString())

    expect(Math.abs(serverNow() - SERVER)).toBeLessThan(1000)

    // Time keeps passing on both clocks: the correction holds.
    vi.advanceTimersByTime(90_000)
    expect(Math.abs(serverNow() - (SERVER + 90_000))).toBeLessThan(1000)
  })

  it('takes the latest server answer when the local clock jumps', () => {
    vi.setSystemTime(SERVER + FIVE_MINUTES)
    updateOffset(new Date(SERVER).toISOString())

    vi.setSystemTime(SERVER - FIVE_MINUTES)
    updateOffset(new Date(SERVER).toISOString())

    expect(Math.abs(serverNow() - SERVER)).toBeLessThan(1000)
  })
})
