import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import type { Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'

/** A migrated in-memory PGlite for service tests. */
export async function migratedDb(): Promise<{ db: Database; client: PGlite }> {
  const client = new PGlite()
  const db = drizzle(client) as unknown as Database
  await applyMigrations(db)
  return { db, client }
}

export async function rows<T>(db: Database, query: Parameters<Database['execute']>[0]): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows
}
