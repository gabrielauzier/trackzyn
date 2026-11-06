import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { MIGRATIONS_FOLDER, applyMigrations } from '../../src/db/migrate.ts'
import { focusSessions } from '../../src/db/schema.ts'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const LIST = '33333333-3333-3333-3333-333333333333'
const TASK = '44444444-4444-4444-4444-444444444444'
const BEFORE = '55555555-5555-5555-5555-000000000001'
const MANUAL = '55555555-5555-5555-5555-000000000002'

const SEED = `
  INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
  INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
  INSERT INTO tasks (id, list_id, title, "column", position, created_at) VALUES ('${TASK}', '${LIST}', 'Write', 'today', 0, now());
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

const originOf = async (id: string) =>
  (await client.query<{ origin: string }>(`SELECT origin FROM focus_sessions WHERE id = '${id}'`)).rows[0]?.origin

describe('focus_sessions.origin (AD-008)', () => {
  it('AGENDA-27 a session recorded before the migration reads origin = focus', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0005_session_origin')
    expect(before).toBeGreaterThan(0)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(SEED)
    await client.query(
      `INSERT INTO focus_sessions (id, user_id, workspace_id, list_id, task_id, kind, device_id, started_at, ended_at, end_reason, last_seen_at)
       VALUES ('${BEFORE}', '${USER}', '${WORKSPACE}', '${LIST}', '${TASK}', 'task', 'device-a', now() - interval '1 hour', now(), 'pause', now())`,
    )

    await applyMigrations(db)
    expect(await originOf(BEFORE)).toBe('focus')
  })

  it('AGENDA-20 stores a manual session with origin = manual and end_reason = manual', async () => {
    const db = drizzle(client) as unknown as Database
    await applyMigrations(db)
    await client.exec(SEED)
    const startedAt = new Date('2026-11-03T17:30:00Z')
    const endedAt = new Date('2026-11-03T18:45:00Z')
    await db.insert(focusSessions).values({
      id: MANUAL,
      userId: USER,
      workspaceId: WORKSPACE,
      listId: LIST,
      taskId: TASK,
      kind: 'task',
      deviceId: 'agenda',
      startedAt,
      endedAt,
      lastSeenAt: endedAt,
      endReason: 'manual',
      origin: 'manual',
    })
    const { rows } = await client.query<{ origin: string; end_reason: string }>(
      `SELECT origin, end_reason FROM focus_sessions WHERE id = '${MANUAL}'`,
    )
    expect(rows).toEqual([{ origin: 'manual', end_reason: 'manual' }])
  })
})
