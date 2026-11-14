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
const OTHER_LIST = '33333333-3333-3333-3333-000000000002'
const TASK = '44444444-4444-4444-4444-000000000001'
const GROUP = '55555555-5555-5555-5555-000000000001'
const OTHER_GROUP = '55555555-5555-5555-5555-000000000002'
const ITEM = '66666666-6666-6666-6666-000000000001'

const SEED = `
  INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
  INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${OTHER_LIST}', '${WORKSPACE}', 'Home', 2, 1, '${USER}', now());
`
const insertTask = (sets = '', values = '') =>
  client.query(
    `INSERT INTO tasks (id, list_id, title, "column", position, created_at${sets}) VALUES (gen_random_uuid(), '${LIST}', 'T', 'backlog', 0, now()${values})`,
  )
const insertItem = (text: string, listId: string | null = null) =>
  client.query(
    `INSERT INTO inbox_items (id, workspace_id, user_id, text, source, list_id, created_at) VALUES (gen_random_uuid(), '${WORKSPACE}', '${USER}', $1, 'app', $2, now())`,
    [text, listId],
  )
const insertGroup = (id: string, listId: string) =>
  client.query(`INSERT INTO task_groups (id, list_id, name, created_at, updated_at) VALUES ('${id}', '${listId}', 'Pipeline', now(), now())`)
const count = async (table: string) => (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]!.n

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

async function migrated() {
  await applyMigrations(drizzle(client) as unknown as Database)
  await client.exec(SEED)
}

describe('0017_caixa_de_entrada', () => {
  it('a task created before the migration reads kind task, priority none, not waiting and not flagged', async () => {
    scratch = mkdtempSync(join(tmpdir(), 'trackzyn-migrations-'))
    cpSync(MIGRATIONS_FOLDER, scratch, { recursive: true })
    const journalPath = join(scratch, 'meta/_journal.json')
    const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as { entries: Array<{ tag: string }> }
    const before = journal.entries.findIndex((entry) => entry.tag === '0017_caixa_de_entrada')
    expect(before).toBe(17)
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, before) }))

    const db = drizzle(client) as unknown as Database
    await applyMigrations(db, scratch)
    await client.exec(SEED)
    await client.exec(`INSERT INTO tasks (id, list_id, title, "column", position, created_at) VALUES ('${TASK}', '${LIST}', 'Old', 'backlog', 0, now())`)
    await applyMigrations(db)

    const { rows } = await client.query(
      `SELECT kind, priority, due_on, waiting, waiting_for, flagged, flag_reason, group_id FROM tasks WHERE id = '${TASK}'`,
    )
    expect(rows).toEqual([
      { kind: 'task', priority: 'none', due_on: null, waiting: false, waiting_for: null, flagged: false, flag_reason: null, group_id: null },
    ])
  })

  it('PRI-01 takes each priority and refuses any other value', async () => {
    await migrated()
    for (const priority of ['none', 'low', 'medium', 'high', 'ultra']) await insertTask(', priority', `, '${priority}'`)
    await expect(insertTask(', priority', `, 'urgent'`)).rejects.toThrow(/ck_tasks_priority/)
    await expect(
      client.query(
        `INSERT INTO task_groups (id, list_id, name, priority, created_at, updated_at) VALUES (gen_random_uuid(), '${LIST}', 'G', 'urgent', now(), now())`,
      ),
    ).rejects.toThrow(/ck_task_groups_priority/)
    expect(await count('tasks')).toBe(5)
  })

  it('REM-02 refuses a reminder with an estimate and keeps one without', async () => {
    await migrated()
    await expect(insertTask(', kind, estimate_minutes', `, 'reminder', 30`)).rejects.toThrow(/ck_tasks_reminder_estimate/)
    await insertTask(', kind', `, 'reminder'`)
    await insertTask(', kind, estimate_minutes', `, 'task', 30`)
    expect(await count('tasks')).toBe(2)
  })

  it('refuses a kind other than task or reminder', async () => {
    await migrated()
    await expect(insertTask(', kind', `, 'note'`)).rejects.toThrow(/ck_tasks_kind/)
  })

  it('WAIT-05 refuses waiting_for without waiting', async () => {
    await migrated()
    await expect(insertTask(', waiting, waiting_for', `, false, 'Fulano'`)).rejects.toThrow(/ck_tasks_waiting_for/)
    await insertTask(', waiting, waiting_for', `, true, 'Fulano'`)
    expect(await count('tasks')).toBe(1)
  })

  it('FLAG-04 refuses flag_reason without flagged', async () => {
    await migrated()
    await expect(insertTask(', flagged, flag_reason', `, false, 'Bloqueada'`)).rejects.toThrow(/ck_tasks_flag_reason/)
    await insertTask(', flagged, flag_reason', `, true, 'Bloqueada'`)
    expect(await count('tasks')).toBe(1)
  })

  it('FLAG-05 refuses a flagged task in done', async () => {
    await migrated()
    await expect(
      client.query(
        `INSERT INTO tasks (id, list_id, title, "column", position, completed_at, created_at, flagged) VALUES (gen_random_uuid(), '${LIST}', 'T', 'done', 0, now(), now(), true)`,
      ),
    ).rejects.toThrow(/ck_tasks_flag_done/)
    expect(await count('tasks')).toBe(0)
  })

  it('CAP-02 refuses an item whose text is empty after trimming', async () => {
    await migrated()
    await expect(insertItem('')).rejects.toThrow(/ck_inbox_items_text/)
    await expect(insertItem('   ')).rejects.toThrow(/ck_inbox_items_text/)
    expect(await count('inbox_items')).toBe(0)
  })

  it('CAP-03 keeps an item of 500 characters and refuses one of 501', async () => {
    await migrated()
    await insertItem('a'.repeat(500))
    await expect(insertItem('a'.repeat(501))).rejects.toThrow(/too long/)
    expect(await count('inbox_items')).toBe(1)
  })

  it('reads a new item with no list, estimate, draft or discard', async () => {
    await migrated()
    await client.query(
      `INSERT INTO inbox_items (id, workspace_id, user_id, text, source, created_at) VALUES ('${ITEM}', '${WORKSPACE}', '${USER}', 'Ligar para o contador', 'app', now())`,
    )
    const { rows } = await client.query(`SELECT text, source, list_id, estimate_minutes, draft, discarded_at FROM inbox_items`)
    expect(rows).toEqual([{ text: 'Ligar para o contador', source: 'app', list_id: null, estimate_minutes: null, draft: null, discarded_at: null }])
    await expect(
      client.query(
        `INSERT INTO inbox_items (id, workspace_id, user_id, text, source, created_at) VALUES (gen_random_uuid(), '${WORKSPACE}', '${USER}', 'x', 'email', now())`,
      ),
    ).rejects.toThrow(/ck_inbox_items_source/)
  })

  it('AD-005 deleting a list deletes its groups and card fields, not those of another list', async () => {
    await migrated()
    await insertGroup(GROUP, LIST)
    await insertGroup(OTHER_GROUP, OTHER_LIST)
    await client.exec(`
      INSERT INTO list_card_fields (user_id, list_id, hidden, updated_at) VALUES ('${USER}', '${LIST}', '["due"]', now());
      INSERT INTO list_card_fields (user_id, list_id, hidden, updated_at) VALUES ('${USER}', '${OTHER_LIST}', '[]', now());
    `)
    await client.exec(`DELETE FROM lists WHERE id = '${LIST}'`)
    expect((await client.query(`SELECT id FROM task_groups`)).rows).toEqual([{ id: OTHER_GROUP }])
    expect((await client.query(`SELECT list_id FROM list_card_fields`)).rows).toEqual([{ list_id: OTHER_LIST }])
  })

  it('deleting a group keeps its tasks with no group, and a task of another group keeps its own', async () => {
    await migrated()
    await insertGroup(GROUP, LIST)
    await insertGroup(OTHER_GROUP, LIST)
    await client.exec(`
      INSERT INTO tasks (id, list_id, title, "column", position, created_at, group_id) VALUES ('${TASK}', '${LIST}', 'In', 'backlog', 0, now(), '${GROUP}');
      INSERT INTO tasks (id, list_id, title, "column", position, created_at, group_id) VALUES (gen_random_uuid(), '${LIST}', 'Other', 'backlog', 1, now(), '${OTHER_GROUP}');
    `)
    await client.exec(`DELETE FROM task_groups WHERE id = '${GROUP}'`)
    expect((await client.query(`SELECT title, group_id FROM tasks ORDER BY position`)).rows).toEqual([
      { title: 'In', group_id: null },
      { title: 'Other', group_id: OTHER_GROUP },
    ])
  })

  it('QUICK-06 deleting the list of an item keeps the item with no list', async () => {
    await migrated()
    await insertItem('Ligar', LIST)
    await insertItem('Comprar', OTHER_LIST)
    await client.exec(`DELETE FROM lists WHERE id = '${LIST}'`)
    expect((await client.query(`SELECT text, list_id FROM inbox_items ORDER BY text`)).rows).toEqual([
      { text: 'Comprar', list_id: OTHER_LIST },
      { text: 'Ligar', list_id: null },
    ])
  })
})
