import type { PGlite } from '@electric-sql/pglite'
import { getTableName, is } from 'drizzle-orm'
import { PgTable } from 'drizzle-orm/pg-core'
import * as schema from '../db/schema.ts'

/** Raised by `restoreData` when the database already holds users: import is for new installations only. */
export class NotANewInstallationError extends Error {
  constructor() {
    super('Import is only available on a new installation')
    this.name = 'NotANewInstallationError'
  }
}

/** The dump cannot be applied: its schema is newer than this build's, or the SQL does not run. */
export class InvalidDumpError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidDumpError'
  }
}

export interface DataDump {
  sql: string
  schemaRevision: number
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`
const ident = (name: string) => `"${name.replaceAll('"', '""')}"`

/** The number of applied migrations: what the dump's `schemaRevision` means. */
export async function schemaRevision(client: PGlite): Promise<number> {
  try {
    const result = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM "drizzle"."__drizzle_migrations"')
    return result.rows[0]?.n ?? 0
  } catch {
    return 0
  }
}

/** Tables of `public`, parents before the tables that reference them. */
async function orderedTables(client: PGlite): Promise<string[]> {
  const tables = (await client.query<{ name: string }>(`SELECT tablename AS name FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`)).rows.map(
    (row) => row.name,
  )
  const edges = (
    await client.query<{ child: string; parent: string }>(
      `SELECT c.conrelid::regclass::text AS child, c.confrelid::regclass::text AS parent
       FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'f' AND n.nspname = 'public'`,
    )
  ).rows
  const parents = new Map<string, Set<string>>(tables.map((table) => [table, new Set<string>()]))
  for (const { child, parent } of edges) if (child !== parent) parents.get(child.replaceAll('"', ''))?.add(parent.replaceAll('"', ''))
  const ordered: string[] = []
  while (ordered.length < tables.length) {
    const next = tables.find((table) => !ordered.includes(table) && [...(parents.get(table) ?? [])].every((parent) => ordered.includes(parent)))
    if (!next) throw new Error('the foreign keys of the schema form a cycle')
    ordered.push(next)
  }
  return ordered
}

/**
 * A data-only dump of the `public` schema: a `TRUNCATE` and one `INSERT` per row, with every value
 * read as text and written as a quoted literal (PostgreSQL converts it to the column's type).
 */
export async function dumpData(client: PGlite): Promise<DataDump> {
  const tables = await orderedTables(client)
  const lines = [`TRUNCATE ${[...tables].reverse().map(ident).join(', ')} CASCADE;`]
  for (const table of tables) {
    const columns = (
      await client.query<{ name: string }>(
        `SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1 ORDER BY ordinal_position`,
        [table],
      )
    ).rows.map((row) => row.name)
    const selected = columns.map((column) => `${ident(column)}::text AS ${ident(column)}`).join(', ')
    const result = await client.query<Record<string, string | null>>(`SELECT ${selected} FROM ${ident(table)}`)
    for (const row of result.rows) {
      const values = columns.map((column) => (row[column] == null ? 'NULL' : quote(row[column])))
      lines.push(`INSERT INTO ${ident(table)} (${columns.map(ident).join(', ')}) VALUES (${values.join(', ')});`)
    }
  }
  return { sql: `${lines.join('\n')}\n`, schemaRevision: await schemaRevision(client) }
}

export type Statement =
  | { kind: 'truncate'; tables: string[] }
  | { kind: 'insert'; table: string; columns: string[]; values: Array<string | null> }

/** What a dump may name: the tables of the app's schema that exist in `public`, and their columns. */
async function allowlist(client: PGlite): Promise<Map<string, Set<string>>> {
  const known = new Set(Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable)).map((table) => getTableName(table)))
  const columns = await client.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'`,
  )
  const tables = await client.query<{ tablename: string }>(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`)
  const allowed = new Map<string, Set<string>>()
  for (const { tablename } of tables.rows) if (known.has(tablename)) allowed.set(tablename, new Set())
  for (const row of columns.rows) allowed.get(row.table_name)?.add(row.column_name)
  return allowed
}

/**
 * Reads a dump with a closed grammar: exactly what `dumpData` writes, one statement per line, single
 * spaces, no comment of any kind. Every table and column must be in the allowlist. The text is only
 * ever read here; what runs later is built from the parsed names and values, never from the file.
 */
function parseDump(sql: string, allowed: Map<string, Set<string>>): Statement[] {
  let at = 0
  const fail = (what: string): never => {
    throw new InvalidDumpError(`the dump is not a dump of this app: ${what} at ${at}`)
  }
  const expect = (text: string) => {
    if (!sql.startsWith(text, at)) fail(`expected ${JSON.stringify(text)}`)
    at += text.length
  }
  const ident = (): string => {
    expect('"')
    const end = sql.indexOf('"', at)
    if (end < 0) return fail('an unterminated identifier')
    const name = sql.slice(at, end)
    at = end + 1
    return name
  }
  const list = <T>(item: () => T): T[] => {
    const items = [item()]
    while (sql.startsWith(', ', at)) {
      at += 2
      items.push(item())
    }
    return items
  }
  const value = (): string | null => {
    if (sql.startsWith('NULL', at)) {
      at += 4
      return null
    }
    expect("'")
    let out = ''
    for (;;) {
      const quote = sql.indexOf("'", at)
      if (quote < 0) return fail('an unterminated literal')
      out += sql.slice(at, quote)
      if (sql[quote + 1] === "'") {
        out += "'"
        at = quote + 2
      } else {
        at = quote + 1
        return out
      }
    }
  }
  const table = (): string => {
    const name = ident()
    if (!allowed.has(name)) fail(`a table that is not the app's: ${JSON.stringify(name)}`)
    return name
  }

  const statements: Statement[] = []
  while (at < sql.length) {
    if (sql.startsWith('TRUNCATE ', at)) {
      at += 9
      const tables = list(table)
      expect(' CASCADE;\n')
      statements.push({ kind: 'truncate', tables })
    } else if (sql.startsWith('INSERT INTO ', at)) {
      at += 12
      const name = table()
      expect(' (')
      const columns = list(() => {
        const column = ident()
        if (!allowed.get(name)?.has(column)) fail(`a column that is not the table's: ${JSON.stringify(column)}`)
        return column
      })
      expect(') VALUES (')
      const values = list(value)
      expect(');\n')
      if (values.length !== columns.length) fail('a different number of columns and values')
      statements.push({ kind: 'insert', table: name, columns, values })
    } else fail('a statement that is not a TRUNCATE or an INSERT')
  }
  return statements
}

const quoted = (name: string) => `"${name}"`

/** Everything that can refuse a dump, without changing anything: its text, its schema and the users. */
export async function checkDump(client: PGlite, dump: DataDump): Promise<Statement[]> {
  if (dump.schemaRevision > (await schemaRevision(client))) throw new InvalidDumpError('the export comes from a newer version')
  // The dump is judged on its own text first, whatever the database holds.
  const statements = parseDump(dump.sql, await allowlist(client))
  const users = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM "users"')
  if ((users.rows[0]?.n ?? 0) > 0) throw new NotANewInstallationError()
  return statements
}

/** Whether the import `id` committed: the marker is written inside the restore transaction. */
export async function hasImport(client: PGlite, id: string): Promise<boolean> {
  try {
    const result = await client.query<{ n: number }>('SELECT count(*)::int AS n FROM "launchkit_internal"."imports" WHERE "id" = $1', [id])
    return (result.rows[0]?.n ?? 0) > 0
  } catch (error) {
    // "No marker table yet" is a real answer (no import ever committed); anything else means "could not ask".
    const code = (error as { code?: string }).code
    if (code === '42P01' || code === '3F000') return false
    throw error
  }
}

/**
 * Restores a dump into a database with no users, all or nothing, in one transaction: TRUNCATEs of
 * allowlisted tables and parameterised INSERTs, plus the import marker. Refuses a dump that is not
 * the grammar above or comes from a newer schema; either leaves the database as it was.
 */
export async function restoreData(client: PGlite, dump: DataDump, importId = 'unmarked', hooks: { beforeCommit?: () => void | Promise<void>; afterStatement?: (index: number, statement: Statement) => void | Promise<void> } = {}): Promise<void> {
  const statements = await checkDump(client, dump)
  try {
    await client.transaction(async (tx) => {
      for (const [index, statement] of statements.entries()) {
        if (statement.kind === 'truncate') await tx.query(`TRUNCATE ${statement.tables.map(quoted).join(', ')} CASCADE`)
        else {
          const placeholders = statement.values.map((_, index) => `$${index + 1}`).join(', ')
          await tx.query(`INSERT INTO ${quoted(statement.table)} (${statement.columns.map(quoted).join(', ')}) VALUES (${placeholders})`, statement.values)
        }
        await hooks.afterStatement?.(index, statement)
      }
      await tx.query('CREATE SCHEMA IF NOT EXISTS "launchkit_internal"')
      await tx.query('CREATE TABLE IF NOT EXISTS "launchkit_internal"."imports" ("id" text PRIMARY KEY)')
      await tx.query('INSERT INTO "launchkit_internal"."imports" ("id") VALUES ($1)', [importId])
      await hooks.beforeCommit?.()
    })
  } catch (error) {
    throw new InvalidDumpError(error instanceof Error ? error.message : String(error))
  }
}
