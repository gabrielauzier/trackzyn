import { resolve } from 'node:path'
import { sql } from 'drizzle-orm'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { Database } from './client.ts'

export const MIGRATIONS_FOLDER = resolve(import.meta.dirname, '../../drizzle')

/** The only Alembic revision the Node schema is known to match. */
const ALEMBIC_BASELINE_REVISION = '001'

async function rows<T>(db: Database, query: ReturnType<typeof sql>): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] }
  return result.rows
}

/**
 * Brings the database to the current schema.
 *
 * A database created by Alembic (`alembic_version` holding `001`) already has the schema the
 * initial migration would create, so the migration is recorded as applied without running it.
 * Any other Alembic revision is refused: the Node build cannot know what it contains.
 */
export async function applyMigrations(db: Database, migrationsFolder = MIGRATIONS_FOLDER): Promise<void> {
  const [alembic] = await rows<{ present: boolean }>(
    db,
    sql`SELECT to_regclass('public.alembic_version') IS NOT NULL AS present`,
  )

  if (alembic?.present) {
    const versions = await rows<{ version_num: string }>(db, sql`SELECT version_num FROM public.alembic_version`)
    const revision = versions[0]?.version_num
    if (revision !== ALEMBIC_BASELINE_REVISION) {
      throw new Error(
        `alembic revision ${revision ?? '(none)'} is not known to this build; expected ${ALEMBIC_BASELINE_REVISION}`,
      )
    }
    await recordInitialMigrationAsApplied(db, migrationsFolder)
  }

  await migrate(db as never, { migrationsFolder })
}

async function recordInitialMigrationAsApplied(db: Database, migrationsFolder: string): Promise<void> {
  const [initial] = readMigrationFiles({ migrationsFolder })
  if (!initial) throw new Error(`no migrations found in ${migrationsFolder}`)

  // Same bookkeeping table drizzle's migrator creates, so its own run finds the row.
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      id SERIAL PRIMARY KEY,
      hash text NOT NULL,
      created_at bigint
    )
  `)
  const applied = await rows<{ n: number }>(db, sql`SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"`)
  if ((applied[0]?.n ?? 0) === 0) {
    await db.execute(
      sql`INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES (${initial.hash}, ${initial.folderMillis})`,
    )
  }
}
