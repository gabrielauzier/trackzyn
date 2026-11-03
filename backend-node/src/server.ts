import { buildApp } from './app.ts'
import { loadConfig } from './config.ts'
import { buildContext } from './context.ts'

async function main(): Promise<void> {
  const config = loadConfig()
  const { ctx, close } = await buildContext(config)

  const app = await buildApp(ctx, { logger: { level: config.debug ? 'debug' : 'info' } })

  const shutdown = async () => {
    await app.close()
    await close()
    process.exit(0)
  }
  process.once('SIGTERM', shutdown)
  process.once('SIGINT', shutdown)

  await app.listen({ host: config.host, port: config.port })
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
