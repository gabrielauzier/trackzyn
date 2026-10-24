/**
 * Background work: one-off jobs and fixed-interval schedules. BullMQ on Redis in
 * deployments, an in-process queue in tests and in the desktop app.
 */
export type JobHandler<P = unknown, R = unknown> = (payload: P) => Promise<R> | R

export interface JobQueue {
  register(name: string, handler: JobHandler): void
  enqueue<P = unknown>(name: string, payload?: P): Promise<void>
  /** Runs `name` every `everySeconds`, registered under the schedule's own name. */
  schedule(name: string, everySeconds: number): Promise<void>
  start(): Promise<void>
  close(): Promise<void>
}
