import type { KeyValueStore } from './key-value-store.ts'

interface Entry {
  value: string
  expiresAt: number | null
}

export class MemoryStore implements KeyValueStore {
  private readonly entries = new Map<string, Entry>()
  private readonly windows = new Map<string, { scores: number[]; expiresAt: number }>()

  private live(key: string): Entry | undefined {
    const entry = this.entries.get(key)
    if (!entry) return undefined
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    return entry
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null
  }

  async set(key: string, value: string, options: { ttlSeconds?: number } = {}): Promise<void> {
    const expiresAt = options.ttlSeconds === undefined ? null : Date.now() + options.ttlSeconds * 1000
    this.entries.set(key, { value, expiresAt })
  }

  async getdel(key: string): Promise<string | null> {
    const entry = this.live(key)
    this.entries.delete(key)
    return entry?.value ?? null
  }

  async del(key: string): Promise<void> {
    this.entries.delete(key)
  }

  async rateLimitHit(key: string, nowSeconds: number, windowSeconds: number): Promise<number> {
    const current = this.windows.get(key)
    const windowStart = nowSeconds - windowSeconds
    // Like the Redis key, the window disappears once nothing was recorded for `windowSeconds`.
    const scores = current && current.expiresAt > Date.now() ? current.scores : []
    const kept = scores.filter((score) => score > windowStart)
    const count = kept.length
    kept.push(nowSeconds)
    this.windows.set(key, { scores: kept, expiresAt: Date.now() + windowSeconds * 1000 })
    return count
  }

  async close(): Promise<void> {
    this.entries.clear()
    this.windows.clear()
  }
}
