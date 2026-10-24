import { Queue, QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { REPORT_USER_COUNT, registerJobs } from '../src/jobs.ts'
import { BullMqQueue } from '../src/ports/bullmq-queue.ts'
import { type TestApp, bootstrapAdmin, createTestApp } from './support/test-app.ts'

// BullMQ needs a real Redis: these run when REDIS_URL points at the test one.
describe.runIf(process.env.REDIS_URL)('worker on BullMQ', () => {
  let t: TestApp
  let queue: BullMqQueue
  let raw: Queue
  let events: QueueEvents
  let connection: Redis
  let name: string
  const lines: string[] = []

  beforeEach(async () => {
    lines.length = 0
    name = `launchkit-test-${Math.random().toString(36).slice(2)}`
    t = await createTestApp()
    queue = new BullMqQueue(process.env.REDIS_URL as string, name)
    connection = new Redis(process.env.REDIS_URL as string, { maxRetriesPerRequest: null })
    raw = new Queue(name, { connection })
    events = new QueueEvents(name, { connection: connection.duplicate() })
    await events.waitUntilReady()
    await registerJobs(queue, { db: t.ctx.db, logger: { info: (m) => lines.push(m) } })
    await queue.start()
  })

  afterEach(async () => {
    await queue.close()
    await raw.obliterate({ force: true }).catch(() => undefined)
    await raw.close()
    await events.close()
    await connection.quit()
    await t.close()
  })

  it('C35 ping returns pong', async () => {
    const job = await raw.add('ping', {})
    expect(await job.waitUntilFinished(events, 10_000)).toBe('pong')
  })

  it('C35 the scheduler registers report-user-count-hourly every 3600 s', async () => {
    const schedulers = await raw.getJobSchedulers()
    const found = schedulers.find((s) => s.key === REPORT_USER_COUNT)
    expect(found?.every).toBe(3_600_000)
  })

  it('C35 each run logs There are <N> users', async () => {
    await bootstrapAdmin(t)
    const job = await raw.add(REPORT_USER_COUNT, {})
    expect(await job.waitUntilFinished(events, 10_000)).toBe(1)
    expect(lines).toContain('There are 1 users')
  })
})
