import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import type { JobHandler, JobQueue } from './job-queue.ts'

export const QUEUE_NAME = 'launchkit'

/** BullMQ on Redis: one queue, one worker per `start()`, schedules kept in Redis by name. */
export class BullMqQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler>()
  private readonly connection: Redis
  private readonly queue: Queue
  private worker: Worker | undefined

  constructor(redisUrl: string, queueName = QUEUE_NAME) {
    // BullMQ blocks on Redis commands, which a retry limit would abort.
    this.connection = new Redis(redisUrl, { maxRetriesPerRequest: null })
    this.connection.on('error', () => undefined)
    this.queue = new Queue(queueName, { connection: this.connection })
    this.queue.on('error', () => undefined)
  }

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler)
  }

  async enqueue<P = unknown>(name: string, payload?: P): Promise<void> {
    await this.queue.add(name, payload ?? {}, { removeOnComplete: 100, removeOnFail: 100 })
  }

  async schedule(name: string, everySeconds: number): Promise<void> {
    await this.queue.upsertJobScheduler(name, { every: everySeconds * 1000 }, { name, data: {} })
  }

  async start(): Promise<void> {
    if (this.worker) return
    this.worker = new Worker(
      this.queue.name,
      async (job) => {
        const handler = this.handlers.get(job.name)
        if (!handler) throw new Error(`no handler registered for job '${job.name}'`)
        return handler(job.data)
      },
      { connection: this.connection.duplicate({ maxRetriesPerRequest: null }) },
    )
    this.worker.on('error', () => undefined)
    await this.worker.waitUntilReady()
  }

  async close(): Promise<void> {
    await this.worker?.close()
    await this.queue.close()
    await this.connection.quit().catch(() => undefined)
  }
}
