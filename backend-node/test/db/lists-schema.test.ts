import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const LIST = '33333333-3333-3333-3333-333333333333'
const TASK = '44444444-4444-4444-4444-444444444444'

let client: PGlite
beforeEach(async () => {
  client = new PGlite()
  await applyMigrations(drizzle(client) as unknown as Database)
  await client.exec(`
    INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
    INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
    INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
    INSERT INTO tasks (id, list_id, title, estimate_minutes, "column", position, created_at) VALUES ('${TASK}', '${LIST}', 'Write', 30, 'today', 0, now());
    INSERT INTO subtasks (id, task_id, title, position) VALUES ('55555555-5555-5555-5555-555555555555', '${TASK}', 'Outline', 0);
  `)
})
afterEach(async () => {
  await client.close()
})

const count = async (table: string) => (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n

const insertTask = (id: string, values: { estimate?: string; column?: string; completedAt?: string }) =>
  client.query(
    `INSERT INTO tasks (id, list_id, title, estimate_minutes, "column", position, completed_at, created_at)
     VALUES ('${id}', '${LIST}', 't', ${values.estimate ?? 'NULL'}, '${values.column ?? 'backlog'}', 1, ${values.completedAt ?? 'NULL'}, now())`,
  )

describe('lists, tasks and subtasks tables', () => {
  it('TASK-08 refuses a task in done without completed_at, and completed_at outside done', async () => {
    await expect(client.query(`UPDATE tasks SET "column" = 'done' WHERE id = '${TASK}'`)).rejects.toThrow(
      /ck_tasks_done_completed_at/,
    )
    await expect(client.query(`UPDATE tasks SET completed_at = now() WHERE id = '${TASK}'`)).rejects.toThrow(
      /ck_tasks_done_completed_at/,
    )
    await client.query(`UPDATE tasks SET "column" = 'done', completed_at = now() WHERE id = '${TASK}'`)
    const { rows } = await client.query<{ column: string; done: boolean }>(
      `SELECT "column", completed_at IS NOT NULL AS done FROM tasks WHERE id = '${TASK}'`,
    )
    expect(rows[0]).toEqual({ column: 'done', done: true })
  })

  it('refuses an estimate of 0 or 1441 minutes and accepts 1, 1440 and none', async () => {
    await expect(insertTask('66666666-6666-6666-6666-666666666660', { estimate: '0' })).rejects.toThrow(
      /ck_tasks_estimate_minutes/,
    )
    await expect(insertTask('66666666-6666-6666-6666-666666666661', { estimate: '1441' })).rejects.toThrow(
      /ck_tasks_estimate_minutes/,
    )
    await insertTask('66666666-6666-6666-6666-666666666662', { estimate: '1' })
    await insertTask('66666666-6666-6666-6666-666666666663', { estimate: '1440' })
    await insertTask('66666666-6666-6666-6666-666666666664', {})
    expect(await count('tasks')).toBe(4)
  })

  it('refuses a column outside backlog, this_week, today and done', async () => {
    await expect(insertTask('66666666-6666-6666-6666-666666666665', { column: 'later' })).rejects.toThrow(
      /ck_tasks_column/,
    )
  })

  it('LIST-09 deleting a list deletes its tasks and subtasks', async () => {
    await client.query(`DELETE FROM lists WHERE id = '${LIST}'`)
    expect([await count('lists'), await count('tasks'), await count('subtasks')]).toEqual([0, 0, 0])
  })

  it('TASK-05 deleting a task deletes its subtasks and keeps the list', async () => {
    await client.query(`DELETE FROM tasks WHERE id = '${TASK}'`)
    expect([await count('lists'), await count('tasks'), await count('subtasks')]).toEqual([1, 0, 0])
  })

  it('deleting the workspace deletes its lists', async () => {
    await client.query(`DELETE FROM workspaces WHERE id = '${WORKSPACE}'`)
    expect([await count('lists'), await count('tasks'), await count('subtasks')]).toEqual([0, 0, 0])
  })
})
