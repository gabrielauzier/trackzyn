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
const TASK = '44444444-4444-4444-4444-444444444444'

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

const completedBy = async () =>
  (await client.query<{ by: string | null }>(`SELECT completed_by_user_id AS by FROM tasks WHERE id = '${TASK}'`)).rows[0]?.by

describe('tasks.completed_by_user_id (AD-006)', () => {
  it('keeps who completed a done task, becomes null when that user is deleted, and is refused outside done', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await client.exec(SEED)
    await client.query(
      `INSERT INTO tasks (id, list_id, title, "column", position, completed_at, completed_by_user_id, created_at)
       VALUES ('${TASK}', '${LIST}', 'Done', 'done', 0, now(), '${USER}', now())`,
    )
    expect(await completedBy()).toBe(USER)

    await expect(
      client.query(`UPDATE tasks SET "column" = 'today', completed_at = NULL WHERE id = '${TASK}'`),
    ).rejects.toThrow(/ck_tasks_completed_by_done/)

    await client.query(`DELETE FROM users WHERE id = '${USER}'`)
    expect(await completedBy()).toBeNull()
    expect((await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM tasks`)).rows[0]?.n).toBe(1)
  })

  it('leaves the tasks completed before the migration without an owner', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0003_tasks_completed_by')
    expect(before).toBeGreaterThan(0)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(SEED)
    await client.query(
      `INSERT INTO tasks (id, list_id, title, "column", position, completed_at, created_at)
       VALUES ('${TASK}', '${LIST}', 'Done earlier', 'done', 0, now(), now())`,
    )

    await applyMigrations(db)
    expect(await completedBy()).toBeNull()
    expect((await client.query<{ column: string }>(`SELECT "column" FROM tasks WHERE id = '${TASK}'`)).rows[0]?.column).toBe('done')
  })
})
