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
const TIMED = '55555555-5555-5555-5555-000000000001'
const UNTIMED = '55555555-5555-5555-5555-000000000002'

// Before 0012 the time of a series was the scheduled_time of its open occurrence; the completed ones may differ.
const SEED = `
  INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
  INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
  INSERT INTO task_series (id, workspace_id, freq, "interval", weekdays, created_at) VALUES
    ('${TIMED}', '${WORKSPACE}', 'weekly', 1, '{5}', now()),
    ('${UNTIMED}', '${WORKSPACE}', 'daily', 1, null, now());
  INSERT INTO tasks (id, list_id, title, "column", position, created_at, completed_at, scheduled_on, scheduled_time, series_id) VALUES
    ('44444444-4444-4444-4444-000000000001', '${LIST}', 'Done', 'done', 0, now(), now(), '2026-11-06', '09:00', '${TIMED}'),
    ('44444444-4444-4444-4444-000000000002', '${LIST}', 'Open', 'backlog', 0, now(), null, '2026-11-13', '14:15', '${TIMED}'),
    ('44444444-4444-4444-4444-000000000003', '${LIST}', 'Open', 'backlog', 1, now(), null, '2026-11-13', null, '${UNTIMED}');
`

let client: PGlite
let scratch: string
beforeEach(() => {
  client = new PGlite()
  scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
})
afterEach(async () => {
  await client.close()
  rmSync(scratch, { recursive: true, force: true })
})

const insertTime = (time: string) =>
  client.query(`INSERT INTO task_series (id, workspace_id, freq, "interval", "time", created_at) VALUES (gen_random_uuid(), '${WORKSPACE}', 'daily', 1, $1, now())`, [time])

describe('0012_task_series_time: the time of a series (Recorrência; D27)', () => {
  it('fills the time of each existing series from its open occurrence, and leaves it null without one', async () => {
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0012_task_series_time')
    expect(before).toBeGreaterThan(0)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(SEED)
    await applyMigrations(db)

    const found = await client.query<{ id: string; time: string | null }>(`SELECT id, "time"::text AS time FROM task_series ORDER BY id`)
    expect(found.rows).toEqual([
      { id: TIMED, time: '14:15:00' },
      { id: UNTIMED, time: null },
    ])
  })

  it('takes a time at any minute and refuses one with seconds (D34)', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await client.exec(SEED)
    await insertTime('00:00')
    await insertTime('23:45')
    await insertTime('14:10')
    await expect(insertTime('14:15:30')).rejects.toThrow(/ck_task_series_time_minute/)
  })
})
