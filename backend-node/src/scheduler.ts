// Scheduler: `npm run scheduler`. Registers the recurring jobs on the queue and stays up; the
// worker process is the one that runs them.
import { loadConfig } from './config.ts'
import { buildContext } from './context.ts'
import { registerJobs } from './jobs.ts'

async function main(): Promise<void> {
  const config = loadConfig()
  if (!config.redisUrl) throw new Error('REDIS_URL is required to run the scheduler')
  const { ctx, close } = await buildContext(config)

  await registerJobs(ctx.jobQueue, { db: ctx.db, logger: { info: (message) => console.log(message) } })
  console.log('scheduler started')

  const shutdown = async () => {
    await close()
    process.exit(0)
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
  setInterval(() => undefined, 1 << 30)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
