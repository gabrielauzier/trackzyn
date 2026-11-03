// Background worker: `npm run worker`. Runs the jobs and the schedules on the queue.
import { loadConfig } from './config.ts'
import { buildContext } from './context.ts'
import { registerJobs } from './jobs.ts'

async function main(): Promise<void> {
  const config = loadConfig()
  if (!config.redisUrl) throw new Error('REDIS_URL is required to run the worker')
  const { ctx, close } = await buildContext(config)

  await registerJobs(ctx.jobQueue, { db: ctx.db, logger: { info: (message) => console.log(message) } })
  await ctx.jobQueue.start()
  console.log('worker started')

  const shutdown = async () => {
    await close()
    process.exit(0)
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
