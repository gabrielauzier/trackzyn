import { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryStore } from '../../src/ports/memory-store.ts'
import { RedisStore } from '../../src/ports/redis-store.ts'
import type { KeyValueStore } from '../../src/ports/key-value-store.ts'

// The contract every KeyValueStore implementation must satisfy.
function describeStore(name: string, make: () => Promise<{ store: KeyValueStore; cleanup: () => Promise<void> }>, real = false) {
  describe(name, () => {
    let store: KeyValueStore
    let cleanup: () => Promise<void>
    const key = (suffix: string) => `test:${name}:${suffix}:${Math.random().toString(36).slice(2)}`

    beforeEach(async () => {
      ;({ store, cleanup } = await make())
    })
    afterEach(async () => {
      await cleanup()
    })

    it('C39 get returns null for a missing key and the value after set', async () => {
      const k = key('basic')
      expect(await store.get(k)).toBeNull()
      await store.set(k, 'value')
      expect(await store.get(k)).toBe('value')
    })

    it('C39 del removes a key', async () => {
      const k = key('del')
      await store.set(k, 'v')
      await store.del(k)
      expect(await store.get(k)).toBeNull()
    })

    it('C39 getdel returns the value once', async () => {
      const k = key('getdel')
      await store.set(k, 'once')
      expect(await store.getdel(k)).toBe('once')
      expect(await store.getdel(k)).toBeNull()
    })

    it('C39 rateLimitHit returns the count before the call and counts only the window', async () => {
      const k = key('rl')
      const now = 1_000_000
      expect(await store.rateLimitHit(k, now, 60)).toBe(0)
      expect(await store.rateLimitHit(k, now + 1, 60)).toBe(1)
      expect(await store.rateLimitHit(k, now + 2, 60)).toBe(2)
      // 61 s later the first three have left the window; only the call at +61 s itself remains.
      expect(await store.rateLimitHit(k, now + 63, 60)).toBe(0)
      expect(await store.rateLimitHit(k, now + 64, 60)).toBe(1)
    })

    it('C39 rateLimitHit counts two hits at the same instant twice', async () => {
      const k = key('same-instant')
      const now = 2_000_000.123
      expect(await store.rateLimitHit(k, now, 60)).toBe(0)
      expect(await store.rateLimitHit(k, now, 60)).toBe(1)
      expect(await store.rateLimitHit(k, now, 60)).toBe(2)
    })

    if (!real) {
      it('C39 a value with a TTL expires', async () => {
        vi.useFakeTimers()
        try {
          const k = key('ttl')
          await store.set(k, 'short', { ttlSeconds: 5 })
          vi.advanceTimersByTime(4_000)
          expect(await store.get(k)).toBe('short')
          vi.advanceTimersByTime(2_000)
          expect(await store.get(k)).toBeNull()
        } finally {
          vi.useRealTimers()
        }
      })
    } else {
      it('C39 a value with a TTL carries that TTL', async () => {
        const k = key('ttl')
        await store.set(k, 'short', { ttlSeconds: 300 })
        const direct = new Redis(process.env.REDIS_URL as string)
        try {
          const ttl = await direct.ttl(k)
          expect(ttl).toBeGreaterThan(290)
          expect(ttl).toBeLessThanOrEqual(300)
        } finally {
          await direct.quit()
        }
      })
    }
  })
}

describeStore('MemoryStore', async () => ({ store: new MemoryStore(), cleanup: async () => undefined }))

describe.runIf(process.env.REDIS_URL)('RedisStore', () => {
  describeStore(
    'RedisStore',
    async () => {
      const store = new RedisStore(process.env.REDIS_URL as string)
      await store.ready()
      return { store, cleanup: () => store.close() }
    },
    true,
  )
})
