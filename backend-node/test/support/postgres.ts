import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { type Database, connectPostgres } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'

/** A new, migrated database on the PostgreSQL of `TEST_POSTGRES_URL`; `close` drops it. */
export async function migratedPostgres(): Promise<{ db: Database; close(): Promise<void> }> {
  const admin = process.env.TEST_POSTGRES_URL as string
  const name = `trackzyn_test_${randomUUID().replaceAll('-', '')}`
  const run = async (statement: string) => {
    const client = new pg.Client({ connectionString: admin })
    await client.connect()
    await client.query(statement)
    await client.end()
  }

  await run(`CREATE DATABASE ${name}`)
  const url = new URL(admin)
  url.pathname = `/${name}`
  const handle = connectPostgres(url.toString())
  await applyMigrations(handle.db)
  return {
    db: handle.db,
    close: async () => {
      await handle.close()
      await run(`DROP DATABASE ${name} WITH (FORCE)`)
    },
  }
}
