import type { Config } from './config.ts'
import { type Database, connectPostgres } from './db/client.ts'
import { applyMigrations } from './db/migrate.ts'
import { BullMqQueue } from './ports/bullmq-queue.ts'
import { InProcessQueue } from './ports/in-process-queue.ts'
import type { JobQueue } from './ports/job-queue.ts'
import type { KeyValueStore } from './ports/key-value-store.ts'
import { createStorageProvider } from './ports/local-storage.ts'
import { MemoryStore } from './ports/memory-store.ts'
import { RedisStore } from './ports/redis-store.ts'
import type { StorageProvider } from './ports/storage-provider.ts'

/**
 * Everything a request handler may need from the outside world. `server.ts`, `worker.ts`,
 * `cli.ts` and the test harness each build one, so every entry point assembles the app the same way.
 */
export interface AppContext {
  config: Config
  db: Database
  keyValueStore: KeyValueStore
  jobQueue: JobQueue
  storage: StorageProvider
}

export interface BuiltContext {
  ctx: AppContext
  close(): Promise<void>
}

/**
 * Connects the database, applies the migrations and picks the ports: Redis-backed when
 * `REDIS_URL` is set, in memory otherwise. `ports: false` leaves Redis alone, for one-shot commands.
 */
export async function buildContext(config: Config, options: { ports?: boolean } = {}): Promise<BuiltContext> {
  const database = connectPostgres(config.pgConnectionString)
  try {
    await applyMigrations(database.db)
  } catch (error) {
    await database.close()
    throw error
  }

  const useRedis = options.ports !== false && Boolean(config.redisUrl)
  const keyValueStore: KeyValueStore = useRedis ? new RedisStore(config.redisUrl as string) : new MemoryStore()
  const jobQueue: JobQueue = useRedis ? new BullMqQueue(config.redisUrl as string) : new InProcessQueue()

  return {
    ctx: { config, db: database.db, keyValueStore, jobQueue, storage: createStorageProvider(config) },
    close: async () => {
      await jobQueue.close()
      await keyValueStore.close()
      await database.close()
    },
  }
}
