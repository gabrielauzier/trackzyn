import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { updateOffset } from '@/lib/focus/clock'
import { nowMinuteIn, useNowMinute } from './use-now-minute'

const TZ = 'America/Sao_Paulo'
const SP = (local: string) => new Date(`${local}-03:00`)

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  updateOffset(new Date().toISOString())
  vi.useRealTimers()
})

describe('useNowMinute (HOJE-04, HOJE-70)', () => {
  it('at 14:19:59 in America/Sao_Paulo, one second later the minute is 860', async () => {
    vi.setSystemTime(SP('2026-11-11T14:19:59'))
    updateOffset(new Date().toISOString())
    const { result } = renderHook(() => useNowMinute(TZ))
    expect(result.current).toEqual({ minute: 859, day: '2026-11-11' })
    await advance(1_000)
    expect(result.current).toEqual({ minute: 860, day: '2026-11-11' })
  })

  it("reads the minute in the workspace's timezone, not the device's", () => {
    vi.setSystemTime(SP('2026-11-11T14:20:00'))
    updateOffset(new Date().toISOString())
    const { result } = renderHook(() => useNowMinute('Asia/Tokyo'))
    // 17:20 UTC is 02:20 of the next day in Tokyo (UTC+9).
    expect(result.current).toEqual({ minute: 2 * 60 + 20, day: '2026-11-12' })
  })

  it("follows the server's clock when the device's is off", () => {
    vi.setSystemTime(SP('2026-11-11T14:20:00'))
    // The server is 5 minutes ahead of this device.
    updateOffset(SP('2026-11-11T14:25:00').toISOString())
    const { result } = renderHook(() => useNowMinute(TZ))
    expect(result.current.minute).toBe(14 * 60 + 25)
  })

  it('renders again only when the minute turns', async () => {
    vi.setSystemTime(SP('2026-11-11T14:20:01'))
    updateOffset(new Date().toISOString())
    let renders = 0
    renderHook(() => {
      renders += 1
      return useNowMinute(TZ)
    })
    const first = renders
    await advance(58_000)
    expect(renders).toBe(first)
    await advance(1_000)
    expect(renders).toBe(first + 1)
  })

  it('HOJE-70 passing from 23:59 to 00:00 calls onDayChange once with the new day', async () => {
    vi.setSystemTime(SP('2026-11-11T23:59:30'))
    updateOffset(new Date().toISOString())
    const onDayChange = vi.fn()
    const { result } = renderHook(() => useNowMinute(TZ, onDayChange))
    expect(result.current).toEqual({ minute: 23 * 60 + 59, day: '2026-11-11' })
    await advance(29_000)
    expect(onDayChange).not.toHaveBeenCalled()
    await advance(1_000)
    expect(result.current).toEqual({ minute: 0, day: '2026-11-12' })
    expect(onDayChange).toHaveBeenCalledOnce()
    expect(onDayChange).toHaveBeenCalledWith('2026-11-12')
    await advance(120_000)
    expect(onDayChange).toHaveBeenCalledOnce()
  })
})

describe('nowMinuteIn', () => {
  it('answers 0 at midnight and 1439 a minute before', () => {
    expect(nowMinuteIn(TZ, SP('2026-11-12T00:00:00').getTime())).toEqual({ minute: 0, day: '2026-11-12' })
    expect(nowMinuteIn(TZ, SP('2026-11-11T23:59:59').getTime())).toEqual({ minute: 1439, day: '2026-11-11' })
  })
})
