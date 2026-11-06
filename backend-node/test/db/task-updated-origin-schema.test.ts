import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { MIGRATIONS_FOLDER, applyMigrations } from '../../src/db/migrate.ts'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const LIST = '33333333-3333-3333-3333-333333333333'
const OPEN = '44444444-4444-4444-4444-000000000001'
const DONE = '44444444-4444-4444-4444-000000000002'

const SEED = `
  INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
  INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
`

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

const row = async (id: string) =>
  (await client.query<{ updated_at: Date; created_from: string | null }>(`SELECT updated_at, created_from FROM tasks WHERE id = '${id}'`)).rows[0]!

describe('tasks.updated_at and tasks.created_from (#27)', () => {
  it('PICK-02 an open task reads its creation as its last update, and a concluded one its completion', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0009_task_updated_and_origin')
    expect(before).toBeGreaterThan(0)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(SEED)
    await client.exec(`
      INSERT INTO tasks (id, list_id, title, "column", position, created_at) VALUES ('${OPEN}', '${LIST}', 'Open', 'today', 0, '2026-10-01T10:00:00Z');
      INSERT INTO tasks (id, list_id, title, "column", position, created_at, completed_at, completed_by_user_id)
        VALUES ('${DONE}', '${LIST}', 'Done', 'done', 0, '2026-10-01T10:00:00Z', '2026-10-05T18:30:00Z', '${USER}');
    `)
    await applyMigrations(db)

    expect((await row(OPEN)).updated_at.toISOString()).toBe('2026-10-01T10:00:00.000Z')
    expect((await row(DONE)).updated_at.toISOString()).toBe('2026-10-05T18:30:00.000Z')
    expect((await row(OPEN)).created_from).toBeNull()
  })

  it('PICK-17 takes agenda as the origin and refuses any other', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await client.exec(SEED)
    await client.exec(`INSERT INTO tasks (id, list_id, title, "column", position, created_at) VALUES ('${OPEN}', '${LIST}', 'Open', 'today', 0, now())`)
    await client.query(`UPDATE tasks SET created_from = 'agenda' WHERE id = '${OPEN}'`)
    expect((await row(OPEN)).created_from).toBe('agenda')
    await expect(client.query(`UPDATE tasks SET created_from = 'other' WHERE id = '${OPEN}'`)).rejects.toThrow(/ck_tasks_created_from/)
  })
})
