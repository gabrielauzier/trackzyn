import { mkdirSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import type { FastifyServerOptions } from 'fastify'
import { buildApp } from '../app.ts'
import { loadConfig } from '../config.ts'
import type { AppContext } from '../context.ts'
import { connectPglite } from '../db/client.ts'
import { MIGRATIONS_FOLDER, applyMigrations } from '../db/migrate.ts'
import { type JobLogger, registerJobs } from '../jobs.ts'
import { InProcessQueue } from '../ports/in-process-queue.ts'
import { LocalStorageProvider } from '../ports/local-storage.ts'
import { MemoryStore } from '../ports/memory-store.ts'
import { type DataDump, checkDump, dumpData, hasImport, restoreData } from './data-transfer.ts'
import { requireLocalToken } from './token-guard.ts'

export interface LocalServerOptions {
  /** Directory of the PGlite database. */
  dataDir: string
  /** Directory the uploaded files live in. */
  filesDir: string
  secretKey: string
  /** Secret every request must carry in `X-Trackzyn-Local-Token`. */
  sessionToken: string
  migrationsFolder?: string
  logger?: FastifyServerOptions['logger']
  jobLogger?: JobLogger
  /** 0 picks a free port. */
  port?: number
}

export interface LocalServer {
  port: number
  address: string
  ctx: AppContext
  /** How many migrations this start applied (0 when the schema was current). */
  migrationsApplied: number
  /** A data-only dump of the database (the desktop app's export). */
  dump(): Promise<DataDump>
  /** Restores a dump into a database without users; throws `NotANewInstallationError` or `InvalidDumpError`. */
  restore(dump: DataDump, importId?: string): Promise<void>
  /** The refusals of `restore` without changing anything. */
  check(dump: DataDump): Promise<void>
  /** Whether the import with this id committed. */
  hasImport(id: string): Promise<boolean>
  close(): Promise<void>
}

const HOST = '127.0.0.1'

async function appliedMigrations(db: AppContext['db']): Promise<number> {
  try {
    const result = (await db.execute(sql`SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"`)) as unknown as {
      rows: Array<{ n: number }>
    }
    return result.rows[0]?.n ?? 0
  } catch {
    return 0
  }
}

/**
 * The backend of the desktop app's local mode: the same application as `server.ts`, on a PGlite
 * database, with in-memory ports (no Redis), listening on loopback behind a session token.
 * The configuration is built from an explicit environment, so nothing of the host's (`REDIS_URL`,
 * a `.env`, secrets directories) leaks in.
 */
export async function startLocalServer(options: LocalServerOptions): Promise<LocalServer> {
  const config = loadConfig(
    {
      SECRET_KEY: options.secretKey,
      REDIS_URL: '',
      HOST,
      PORT: String(options.port ?? 0),
      STORAGE_LOCAL_PATH: options.filesDir,
      FRONTEND_URL: 'app://trackzyn',
    },
    { envFiles: [], secretsDirs: [] },
  )

  mkdirSync(options.filesDir, { recursive: true })
  const database = await connectPglite(options.dataDir)
  const pglite = database.pglite!
  const migrationsFolder = options.migrationsFolder ?? MIGRATIONS_FOLDER
  let migrationsApplied: number
  try {
    const before = await appliedMigrations(database.db)
    await applyMigrations(database.db, migrationsFolder)
    migrationsApplied = (await appliedMigrations(database.db)) - before
  } catch (error) {
    await database.close()
    throw error
  }

  const keyValueStore = new MemoryStore()
  const jobQueue = new InProcessQueue()
  const ctx: AppContext = {
    config,
    db: database.db,
    keyValueStore,
    jobQueue,
    storage: new LocalStorageProvider(options.filesDir),
  }
  await registerJobs(jobQueue, { db: database.db, logger: options.jobLogger ?? { info: () => undefined } })
  await jobQueue.start()

  const app = await buildApp(ctx, { logger: options.logger ?? false }, requireLocalToken(options.sessionToken))
  try {
    await app.listen({ host: HOST, port: options.port ?? 0 })
  } catch (error) {
    await app.close()
    await jobQueue.close()
    await database.close()
    throw error
  }
  const bound = app.server.address()
  if (bound === null || typeof bound === 'string') throw new Error('the local server has no TCP address')

  return {
    port: bound.port,
    address: bound.address,
    ctx,
    migrationsApplied,
    dump: () => dumpData(pglite),
    restore: (dump, importId) => restoreData(pglite, dump, importId),
    check: async (dump) => void (await checkDump(pglite, dump)),
    hasImport: (id) => hasImport(pglite, id),
    close: async () => {
      await app.close()
      await jobQueue.close()
      await keyValueStore.close()
      await database.close()
    },
  }
}
