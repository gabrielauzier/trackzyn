import { randomUUID } from 'node:crypto'
import { Redis } from 'ioredis'
import type { KeyValueStore } from './key-value-store.ts'

export class RedisStore implements KeyValueStore {
  private readonly redis: Redis

  constructor(urlOrClient: string | Redis) {
    this.redis =
      typeof urlOrClient === 'string'
        ? new Redis(urlOrClient, {
            // A Redis that does not answer must fail the request (HTTP 500, as in the Python
            // backend) instead of queueing commands forever.
            maxRetriesPerRequest: 1,
            enableOfflineQueue: false,
            lazyConnect: false,
            connectTimeout: 2000,
            retryStrategy: (attempt) => Math.min(attempt * 200, 2000),
          })
        : urlOrClient
    // Connection errors surface through each command; this keeps them from crashing the process.
    this.redis.on('error', () => undefined)
  }

  /** Resolves once the connection is up (a command sent before that fails: the offline queue is off). */
  async ready(timeoutMs = 5000): Promise<void> {
    if (this.redis.status === 'ready') return
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('redis did not become ready')), timeoutMs)
      this.redis.once('ready', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key)
  }

  async set(key: string, value: string, options: { ttlSeconds?: number } = {}): Promise<void> {
    if (options.ttlSeconds === undefined) await this.redis.set(key, value)
    else await this.redis.set(key, value, 'EX', options.ttlSeconds)
  }

  async getdel(key: string): Promise<string | null> {
    return this.redis.getdel(key)
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key)
  }

  async rateLimitHit(key: string, nowSeconds: number, windowSeconds: number): Promise<number> {
    const results = await this.redis
      .multi()
      .zremrangebyscore(key, 0, nowSeconds - windowSeconds)
      .zcard(key)
      // A unique member: two hits in the same millisecond must both count.
      .zadd(key, nowSeconds, `${nowSeconds}:${randomUUID()}`)
      .expire(key, windowSeconds)
      .exec()
    if (!results) throw new Error('rate limit transaction was discarded')
    for (const [error] of results) if (error) throw error
    return Number(results[1]?.[1] ?? 0)
  }

  async close(): Promise<void> {
    await this.redis.quit().catch(() => undefined)
  }
}
