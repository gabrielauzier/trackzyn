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
const TASK = '44444444-4444-4444-4444-000000000001'

const SEED = `
  INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
  INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
  INSERT INTO tasks (id, list_id, title, "column", position, created_at) VALUES ('${TASK}', '${LIST}', 'Plan', 'backlog', 0, now());
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

const schedule = (on: string | null, time: string | null) =>
  client.query(`UPDATE tasks SET scheduled_on = $1, scheduled_time = $2 WHERE id = '${TASK}'`, [on, time])

const read = async () =>
  (
    await client.query<{ scheduled_on: string | null; scheduled_time: string | null; schedule_applied_at: Date | null }>(
      `SELECT scheduled_on::text, scheduled_time::text, schedule_applied_at FROM tasks WHERE id = '${TASK}'`,
    )
  ).rows[0]!

describe('the schedule columns of tasks (agendamento, data model)', () => {
  it('leaves the day, the time and the applied instant null on the tasks that existed before the migration', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0010_task_schedule')
    expect(before).toBeGreaterThan(0)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(SEED)
    await applyMigrations(db)

    expect(await read()).toEqual({ scheduled_on: null, scheduled_time: null, schedule_applied_at: null })
  })

  it('takes a day alone, and a day with a time in steps of 15 minutes', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await client.exec(SEED)

    await schedule('2026-11-13', null)
    expect(await read()).toMatchObject({ scheduled_on: '2026-11-13', scheduled_time: null })
    await schedule('2026-11-13', '14:45')
    expect(await read()).toMatchObject({ scheduled_on: '2026-11-13', scheduled_time: '14:45:00' })
    await client.query(`UPDATE tasks SET schedule_applied_at = '2026-11-13T03:00:00Z' WHERE id = '${TASK}'`)
    expect((await read()).schedule_applied_at?.toISOString()).toBe('2026-11-13T03:00:00.000Z')
  })

  it('refuses a time without a day', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await client.exec(SEED)
    await expect(schedule(null, '14:00')).rejects.toThrow(/ck_tasks_schedule_time_needs_day/)
  })

  it('refuses a time out of the 15-minute step, in minutes or in seconds', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    await client.exec(SEED)
    await expect(schedule('2026-11-13', '14:10')).rejects.toThrow(/ck_tasks_schedule_time_step/)
    await expect(schedule('2026-11-13', '14:15:30')).rejects.toThrow(/ck_tasks_schedule_time_step/)
    expect(await read()).toMatchObject({ scheduled_on: null, scheduled_time: null })
  })

  it('indexes only the candidates of the move to Today and the pending scheduled tasks', async () => {
    await applyMigrations(drizzle(client) as unknown as Database)
    const found = await client.query<{ indexname: string; indexdef: string }>(
      `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'tasks' AND indexname IN ('ix_tasks_schedule_due', 'ix_tasks_scheduled_on') ORDER BY indexname`,
    )
    expect(found.rows.map((row) => row.indexname)).toEqual(['ix_tasks_schedule_due', 'ix_tasks_scheduled_on'])
    const [due, scheduled] = found.rows
    expect(due!.indexdef).toMatch(/\(list_id, scheduled_on\) WHERE \(\(scheduled_on IS NOT NULL\) AND \(schedule_applied_at IS NULL\) AND /)
    expect(due!.indexdef).toMatch(/'backlog'.*'this_week'/)
    expect(scheduled!.indexdef).toMatch(/\(scheduled_on\) WHERE \(\(scheduled_on IS NOT NULL\) AND \(\(?"?column"?\)?::text <> 'done'/)
  })
})
