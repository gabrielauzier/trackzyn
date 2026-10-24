import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations, MIGRATIONS_FOLDER } from '../../src/db/migrate.ts'

const TABLES = ['app_settings', 'files', 'user_passkeys', 'users', 'workspace_members', 'workspaces']
const ALEMBIC_DUMP = readFileSync(resolve(import.meta.dirname, '../fixtures/alembic-001.sql'), 'utf8')

const clients: PGlite[] = []
function newDb() {
  const client = new PGlite()
  clients.push(client)
  return { client, db: drizzle(client) }
}
afterEach(async () => {
  await Promise.all(clients.splice(0).map((c) => c.close()))
})

async function publicTables(client: PGlite) {
  const { rows } = await client.query<{ relname: string; oid: number }>(
    `SELECT c.relname, c.oid FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname`,
  )
  return rows
}

async function columnSignature(client: PGlite) {
  const { rows } = await client.query(
    `SELECT table_name, column_name, data_type, character_maximum_length, is_nullable, column_default, ordinal_position
     FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
  )
  return rows
}

describe('migration baseline', () => {
  it('C38 an alembic 001 database gets no DDL and the initial migration is recorded', async () => {
    const { client, db } = newDb()
    await client.exec(ALEMBIC_DUMP)
    const tablesBefore = await publicTables(client)
    const columnsBefore = await columnSignature(client)
    expect(tablesBefore.map((t) => t.relname)).toEqual(['alembic_version', ...TABLES])

    await applyMigrations(db)

    // Same tables (same oids: nothing was dropped or recreated) with the same columns.
    expect(await publicTables(client)).toEqual(tablesBefore)
    expect(await columnSignature(client)).toEqual(columnsBefore)

    const [initial] = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })
    const { rows } = await client.query<{ hash: string; created_at: string }>(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations',
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]?.hash).toBe(initial?.hash)
    expect(Number(rows[0]?.created_at)).toBe(initial?.folderMillis)

    // Booting again changes nothing.
    await applyMigrations(db)
    expect((await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0]).toEqual({ n: 1 })
  })

  it('C38 an empty database gets the 6 tables', async () => {
    const { client, db } = newDb()
    await applyMigrations(db)

    expect((await publicTables(client)).map((t) => t.relname)).toEqual(TABLES)
    expect((await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0]).toEqual({ n: 1 })
  })

  it('an alembic database at a revision other than 001 is not adopted', async () => {
    const { client, db } = newDb()
    await client.exec(ALEMBIC_DUMP.replace("VALUES ('001')", "VALUES ('002')"))
    await expect(applyMigrations(db)).rejects.toThrow()
  })
})
