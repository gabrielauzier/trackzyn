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
const OLD = '33333333-3333-3333-3333-000000000001'
const NEW = '33333333-3333-3333-3333-000000000002'
const MOVED = '44444444-4444-4444-4444-000000000001'
const STAYED = '44444444-4444-4444-4444-000000000002'
const S_MOVED = '55555555-5555-5555-5555-000000000001'
const S_STAYED = '55555555-5555-5555-5555-000000000002'
const S_BREAK = '55555555-5555-5555-5555-000000000003'

// The state #21 left behind: MOVED now lives in NEW, but its session still points at OLD.
const SEED = `
  INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
  INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES
    ('${OLD}', '${WORKSPACE}', 'Frete', 1, 0, '${USER}', now()),
    ('${NEW}', '${WORKSPACE}', 'ADSet', 2, 1, '${USER}', now());
  INSERT INTO tasks (id, list_id, title, "column", position, created_at) VALUES
    ('${MOVED}', '${NEW}', 'Moved', 'today', 0, now()),
    ('${STAYED}', '${OLD}', 'Stayed', 'today', 0, now());
  INSERT INTO focus_sessions (id, user_id, workspace_id, list_id, task_id, kind, device_id, started_at, ended_at, end_reason, last_seen_at, planned_seconds) VALUES
    ('${S_MOVED}', '${USER}', '${WORKSPACE}', '${OLD}', '${MOVED}', 'task', 'd', now() - interval '3 hours', now() - interval '2 hours', 'pause', now(), null),
    ('${S_STAYED}', '${USER}', '${WORKSPACE}', '${OLD}', '${STAYED}', 'task', 'd', now() - interval '2 hours', now() - interval '1 hour', 'pause', now(), null),
    ('${S_BREAK}', '${USER}', '${WORKSPACE}', '${OLD}', null, 'break', 'd', now() - interval '1 hour', now() - interval '50 minutes', 'pause', now(), 600);
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

describe('0006_session_list_follows_task (#21)', () => {
  it('points each task session at its task list, and leaves breaks and unmoved tasks alone', async () => {
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0006_session_list_follows_task')
    expect(before).toBeGreaterThan(0)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(SEED)
    await applyMigrations(db)

    const { rows } = await client.query<{ id: string; list_id: string }>(`SELECT id, list_id FROM focus_sessions ORDER BY id`)
    expect(rows).toEqual([
      { id: S_MOVED, list_id: NEW },
      { id: S_STAYED, list_id: OLD },
      { id: S_BREAK, list_id: OLD },
    ])
  })
})
