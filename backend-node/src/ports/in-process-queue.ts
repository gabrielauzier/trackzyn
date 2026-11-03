import type { JobHandler, JobQueue } from './job-queue.ts'

/** Handlers in memory: for tests and for runs with no Redis. Jobs run on the next tick. */
export class InProcessQueue implements JobQueue {
  private readonly handlers = new Map<string, JobHandler>()
  private readonly schedules = new Map<string, number>()
  private readonly timers: NodeJS.Timeout[] = []
  private readonly running = new Set<Promise<unknown>>()
  private started = false

  /** Every failure of a job, for a test or a log line to read. */
  readonly failures: Array<{ name: string; error: unknown }> = []

  register(name: string, handler: JobHandler): void {
    this.handlers.set(name, handler)
  }

  async enqueue<P = unknown>(name: string, payload?: P): Promise<void> {
    const handler = this.handlers.get(name)
    if (!handler) throw new Error(`no handler registered for job '${name}'`)
    const run = new Promise<void>((resolve) => setImmediate(resolve))
      .then(() => handler(payload))
      .catch((error: unknown) => {
        this.failures.push({ name, error })
      })
    this.running.add(run)
    void run.finally(() => this.running.delete(run))
  }

  async schedule(name: string, everySeconds: number): Promise<void> {
    this.schedules.set(name, everySeconds)
    if (this.started) this.arm(name, everySeconds)
  }

  private arm(name: string, everySeconds: number): void {
    const timer = setInterval(() => void this.enqueue(name), everySeconds * 1000)
    timer.unref()
    this.timers.push(timer)
  }

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    for (const [name, everySeconds] of this.schedules) this.arm(name, everySeconds)
  }

  /** Resolves when every job enqueued so far has finished. */
  async drain(): Promise<void> {
    while (this.running.size > 0) await Promise.allSettled([...this.running])
  }

  async close(): Promise<void> {
    for (const timer of this.timers.splice(0)) clearInterval(timer)
    this.started = false
    await this.drain()
  }
}
