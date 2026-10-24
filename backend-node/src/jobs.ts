import { count } from 'drizzle-orm'
import type { Database } from './db/client.ts'
import { users } from './db/schema.ts'
import type { JobQueue } from './ports/job-queue.ts'

export interface JobLogger {
  info(message: string): void
}

export const REPORT_USER_COUNT = 'report-user-count-hourly'
const HOUR_SECONDS = 60 * 60

/** The Node counterpart of `app/tasks/example_tasks.py`. */
export async function registerJobs(
  queue: JobQueue,
  deps: { db: Database; logger: JobLogger },
  options: { schedule?: boolean } = {},
): Promise<void> {
  queue.register('ping', () => 'pong')
  queue.register(REPORT_USER_COUNT, async () => {
    const [row] = await deps.db.select({ n: count() }).from(users)
    const total = row?.n ?? 0
    deps.logger.info(`There are ${total} users`)
    return total
  })
  if (options.schedule ?? true) await queue.schedule(REPORT_USER_COUNT, HOUR_SECONDS)
}
