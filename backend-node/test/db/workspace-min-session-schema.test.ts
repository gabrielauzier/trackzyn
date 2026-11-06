import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { MIGRATIONS_FOLDER, applyMigrations } from '../../src/db/migrate.ts'

const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const minOf = async () =>
  (await client.query<{ min_session_minutes: number | null }>(`SELECT min_session_minutes FROM workspaces WHERE id = '${WORKSPACE}'`))
    .rows[0]?.min_session_minutes
const setMin = (value: number) => client.query(`UPDATE workspaces SET min_session_minutes = ${value} WHERE id = '${WORKSPACE}'`)

let client: PGlite
let scratch: string | null = null
beforeEach(() => {
  client = new PGlite()
})
afterEach(async () => {
  await client.close()
  if (scratch) rmSync(scratch, { recursive: true, force: true })
  scratch = null
})

describe('workspaces.min_session_minutes (#22)', () => {
  it('HIDE-01 a workspace created before the migration reads null, the minimum off', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0007_workspace_min_session')
    expect(before).toBeGreaterThan(0)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(`INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now())`)
    await applyMigrations(db)

    expect(await minOf()).toBeNull()
  })

  it('HIDE-01 takes 1 and 60 and refuses 0 and 61', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await client.exec(`INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now())`)

    await setMin(1)
    expect(await minOf()).toBe(1)
    await setMin(60)
    expect(await minOf()).toBe(60)
    await expect(setMin(0)).rejects.toThrow(/ck_workspaces_min_session_minutes/)
    await expect(setMin(61)).rejects.toThrow(/ck_workspaces_min_session_minutes/)
    expect(await minOf()).toBe(60)
  })
})
