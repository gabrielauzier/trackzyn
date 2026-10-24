import { afterEach, describe, expect, it, vi } from 'vitest'

import { deviceId } from '@/lib/focus/device-id'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('deviceId (SYNC-02)', () => {
  it('answers the same UUID on every call and keeps it in localStorage', () => {
    const first = deviceId()

    expect(first).toMatch(UUID)
    expect(deviceId()).toBe(first)
    expect(localStorage.getItem('trackzyn.device')).toBe(first)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('works outside a secure context, where crypto.randomUUID is missing', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })

    const id = deviceId()

    expect(id).toMatch(UUID)
    expect(deviceId()).toBe(id)
  })

  it('generates another id once localStorage is cleared', () => {
    const first = deviceId()
    localStorage.clear()

    const second = deviceId()

    expect(second).toMatch(UUID)
    expect(second).not.toBe(first)
  })
})
