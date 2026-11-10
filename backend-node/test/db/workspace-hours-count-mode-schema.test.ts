import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { MIGRATIONS_FOLDER, applyMigrations } from '../../src/db/migrate.ts'

const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const modeOf = async () =>
  (await client.query<{ hours_count_mode: string }>(`SELECT hours_count_mode FROM workspaces WHERE id = '${WORKSPACE}'`)).rows[0]
    ?.hours_count_mode
const setMode = (value: string) => client.query(`UPDATE workspaces SET hours_count_mode = '${value}' WHERE id = '${WORKSPACE}'`)
const insertWorkspace = () =>
  client.exec(`INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now())`)

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

describe('workspaces.hours_count_mode (#42)', () => {
  it('HOURS-01 a workspace created before the migration reads gross', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0016_workspace_hours_count_mode')
    expect(before).toBe(16)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await insertWorkspace()
    await applyMigrations(db)

    expect(await modeOf()).toBe('gross')
  })

  it('HOURS-01 a new workspace reads gross, takes net and refuses any other value', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await insertWorkspace()
    expect(await modeOf()).toBe('gross')

    await setMode('net')
    expect(await modeOf()).toBe('net')
    await expect(setMode('total')).rejects.toThrow(/ck_workspaces_hours_count_mode/)
    await expect(client.query(`UPDATE workspaces SET hours_count_mode = NULL WHERE id = '${WORKSPACE}'`)).rejects.toThrow(/null/i)
    expect(await modeOf()).toBe('net')
  })
})
