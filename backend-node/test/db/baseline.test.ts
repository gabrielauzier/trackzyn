import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { afterEach, describe, expect, it } from 'vitest'
import { applyMigrations, MIGRATIONS_FOLDER } from '../../src/db/migrate.ts'

const TABLES = ['app_settings', 'files', 'user_passkeys', 'users', 'workspace_members', 'workspaces']
const NEW_TABLES = ['lists', 'subtasks', 'tasks']
const ALL_TABLES = [...TABLES, ...NEW_TABLES].sort()
const MIGRATIONS = readMigrationFiles({ migrationsFolder: MIGRATIONS_FOLDER })
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
  it('C38 an alembic 001 database records 0000 as applied and gets only the DDL of the later migrations', async () => {
    const { client, db } = newDb()
    await client.exec(ALEMBIC_DUMP)
    // The dump empties search_path for its own session; a server connection starts with the default.
    await client.exec('RESET search_path')
    const tablesBefore = await publicTables(client)
    const columnsBefore = await columnSignature(client)
    expect(tablesBefore.map((t) => t.relname)).toEqual(['alembic_version', ...TABLES])

    await applyMigrations(db)

    // The original tables keep their oids (nothing was dropped or recreated) and their columns.
    const tablesAfter = await publicTables(client)
    expect(tablesAfter.filter((t) => !NEW_TABLES.includes(t.relname))).toEqual(tablesBefore)
    expect(tablesAfter.map((t) => t.relname)).toEqual(['alembic_version', ...ALL_TABLES])
    const original = new Set(['alembic_version', ...TABLES])
    const columnsAfter = (await columnSignature(client)).filter((c) => original.has(String((c as { table_name: string }).table_name)))
    expect(columnsAfter).toEqual(columnsBefore)

    const { rows } = await client.query<{ hash: string; created_at: string }>(
      'SELECT hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id',
    )
    expect(MIGRATIONS.length).toBeGreaterThan(1)
    expect(rows.map((row) => row.hash)).toEqual(MIGRATIONS.map((m) => m.hash))
    expect(Number(rows[0]?.created_at)).toBe(MIGRATIONS[0]?.folderMillis)

    // Booting again changes nothing.
    await applyMigrations(db)
    expect((await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0]).toEqual({
      n: MIGRATIONS.length,
    })
  })

  it('C38 an empty database gets the 6 original tables and the new ones', async () => {
    const { client, db } = newDb()
    await applyMigrations(db)

    expect((await publicTables(client)).map((t) => t.relname)).toEqual(ALL_TABLES)
    expect((await client.query('SELECT count(*)::int AS n FROM drizzle.__drizzle_migrations')).rows[0]).toEqual({
      n: MIGRATIONS.length,
    })
  })

  it('an alembic database at a revision other than 001 is not adopted', async () => {
    const { client, db } = newDb()
    await client.exec(ALEMBIC_DUMP.replace("VALUES ('001')", "VALUES ('002')"))
    await expect(applyMigrations(db)).rejects.toThrow()
  })
})
