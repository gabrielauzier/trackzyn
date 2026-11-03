import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/node-postgres'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import type { PgDatabase } from 'drizzle-orm/pg-core'
import pg from 'pg'
import * as schema from './schema.ts'

/** Every call site types the database as this, never as the type of one driver. */
export type Database = PgDatabase<any, any, any>

export interface DatabaseHandle {
  db: Database
  /** The PGlite instance behind `db`, for the local mode's export and import (undefined on PostgreSQL). */
  pglite?: PGlite
  close(): Promise<void>
}

export function connectPostgres(connectionString: string): DatabaseHandle {
  const pool = new pg.Pool({ connectionString, max: 10 })
  // An idle client dropping (database restart) must not take the process down.
  pool.on('error', () => undefined)
  return {
    db: drizzle(pool, { schema }) as unknown as Database,
    close: () => pool.end(),
  }
}

/** PGlite (PostgreSQL in WASM) in `dataDir`: the database of the desktop app's local mode. */
export async function connectPglite(dataDir: string): Promise<DatabaseHandle> {
  const client = new PGlite(dataDir)
  await client.waitReady
  return {
    db: drizzlePglite(client, { schema }) as unknown as Database,
    pglite: client,
    close: () => client.close(),
  }
}

export { schema }
