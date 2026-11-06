import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { MIGRATIONS_FOLDER, applyMigrations } from '../../src/db/migrate.ts'

const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const gapOf = async () =>
  (await client.query<{ merge_gap_minutes: number | null }>(`SELECT merge_gap_minutes FROM workspaces WHERE id = '${WORKSPACE}'`))
    .rows[0]?.merge_gap_minutes
const setGap = (value: number) => client.query(`UPDATE workspaces SET merge_gap_minutes = ${value} WHERE id = '${WORKSPACE}'`)

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

describe('workspaces.merge_gap_minutes (#23)', () => {
  it('MERGE-01 a workspace created before the migration reads null, the join off', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0008_workspace_merge_gap')
    expect(before).toBeGreaterThan(0)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(`INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now())`)
    await applyMigrations(db)

    expect(await gapOf()).toBeNull()
  })

  it('MERGE-01 takes 1 and 60 and refuses 0 and 61', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await client.exec(`INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now())`)

    await setGap(1)
    expect(await gapOf()).toBe(1)
    await setGap(60)
    expect(await gapOf()).toBe(60)
    await expect(setGap(0)).rejects.toThrow(/ck_workspaces_merge_gap_minutes/)
    await expect(setGap(61)).rejects.toThrow(/ck_workspaces_merge_gap_minutes/)
    expect(await gapOf()).toBe(60)
  })
})
