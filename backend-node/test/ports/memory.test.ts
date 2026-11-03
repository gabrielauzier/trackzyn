import { describe, expect, it } from 'vitest'
import { registerJobs } from '../../src/jobs.ts'
import { InProcessQueue } from '../../src/ports/in-process-queue.ts'
import { MemoryStore } from '../../src/ports/memory-store.ts'
import { createTestApp } from '../support/test-app.ts'

describe('C39 MemoryStore and InProcessQueue satisfy the port contracts', () => {
  it('C39 MemoryStore and InProcessQueue satisfy the port contracts: store round trip', async () => {
    const store = new MemoryStore()
    await store.set('k', 'v', { ttlSeconds: 60 })
    expect(await store.get('k')).toBe('v')
    expect(await store.getdel('k')).toBe('v')
    expect(await store.get('k')).toBeNull()
    expect(await store.rateLimitHit('r', 1000, 60)).toBe(0)
    expect(await store.rateLimitHit('r', 1001, 60)).toBe(1)
  })

  it('C39 MemoryStore and InProcessQueue satisfy the port contracts: queue runs registered jobs', async () => {
    const queue = new InProcessQueue()
    const seen: unknown[] = []
    queue.register('echo', (payload) => void seen.push(payload))
    await queue.start()
    await queue.enqueue('echo', { n: 1 })
    await queue.drain()
    expect(seen).toEqual([{ n: 1 }])
    await expect(queue.enqueue('unknown')).rejects.toThrow(/no handler/)
    await queue.close()
  })

  it('C39 MemoryStore and InProcessQueue satisfy the port contracts: schedules fire after start', async () => {
    const queue = new InProcessQueue()
    let runs = 0
    queue.register('tick', () => void runs++)
    await queue.schedule('tick', 0.02)
    await new Promise((r) => setTimeout(r, 80))
    expect(runs).toBe(0)
    await queue.start()
    await new Promise((r) => setTimeout(r, 120))
    await queue.close()
    expect(runs).toBeGreaterThanOrEqual(2)
  })

  it('C39 MemoryStore and InProcessQueue satisfy the port contracts: the app jobs run on it', async () => {
    const t = await createTestApp()
    try {
      const lines: string[] = []
      const queue = new InProcessQueue()
      await registerJobs(queue, { db: t.ctx.db, logger: { info: (m) => lines.push(m) } })
      await queue.enqueue('report-user-count-hourly')
      await queue.drain()
      expect(lines).toEqual(['There are 0 users'])
      await queue.close()
    } finally {
      await t.close()
    }
  })
})
