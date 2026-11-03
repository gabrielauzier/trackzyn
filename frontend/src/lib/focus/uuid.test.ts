import { afterEach, describe, expect, it, vi } from 'vitest'

import { uuid } from '@/lib/focus/uuid'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('uuid', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('uses crypto.randomUUID when the context has it', () => {
    const randomUUID = vi.fn(() => '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: crypto.getRandomValues.bind(crypto) })

    expect(uuid()).toBe('1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed')
  })

  it('builds a v4 UUID from crypto.getRandomValues outside a secure context, where randomUUID is missing', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })

    const ids = Array.from({ length: 50 }, () => uuid())

    for (const id of ids) expect(id).toMatch(UUID_V4)
    expect(new Set(ids).size).toBe(50)
  })
})
