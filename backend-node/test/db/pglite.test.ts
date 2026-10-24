import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/pglite'
import { describe, expect, it } from 'vitest'
import { connectPglite, type Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'

const SIX_TABLES = ['app_settings', 'files', 'user_passkeys', 'users', 'workspace_members', 'workspaces']

async function rows<T>(db: Database, query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows
}

describe('the Drizzle schema on PGlite', () => {
  it('creates the six tables', async () => {
    const client = new PGlite()
    const db = drizzle(client) as unknown as Database
    await applyMigrations(db)
    const tables = await rows<{ table_name: string }>(
      db,
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )
    expect(tables.map((row) => row.table_name)).toEqual(SIX_TABLES)
    await client.close()
  })

  it('matches the PostgreSQL column catalog', async () => {
    // pg-columns.json was read once from information_schema.columns of a PostgreSQL 16
    // that ran the same migrations (npm run migrate).
    const expected = JSON.parse(readFileSync(join(import.meta.dirname, '../fixtures/pg-columns.json'), 'utf8')) as Record<
      string,
      Array<{ column: string; type: string; nullable: boolean; maxLength: number | null }>
    >
    const client = new PGlite()
    const db = drizzle(client) as unknown as Database
    await applyMigrations(db)
    const found = await rows<{
      table_name: string
      column_name: string
      data_type: string
      is_nullable: string
      character_maximum_length: number | null
    }>(
      db,
      sql`select table_name, column_name, data_type, is_nullable, character_maximum_length
          from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`,
    )
    const actual: typeof expected = {}
    for (const row of found) {
      ;(actual[row.table_name] ??= []).push({
        column: row.column_name,
        type: row.data_type,
        nullable: row.is_nullable === 'YES',
        maxLength: row.character_maximum_length,
      })
    }
    expect(actual).toEqual(expected)
    await client.close()
  })

  it('applies the migrations to a PGlite directory on disk', async () => {
    const root = mkdtempSync(join(tmpdir(), 'trackzyn-pglite-'))
    const dir = join(root, 'db')
    const first = await connectPglite(dir)
    await applyMigrations(first.db)
    await first.close()
    expect(existsSync(join(dir, 'PG_VERSION'))).toBe(true)

    const second = await connectPglite(dir)
    const tables = await rows<{ table_name: string }>(
      second.db,
      sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`,
    )
    expect(tables.map((row) => row.table_name)).toEqual(SIX_TABLES)
    await second.close()
    rmSync(root, { recursive: true, force: true })
  })
})
