import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'

const USER = '11111111-1111-1111-1111-111111111111'
const OTHER_USER = '11111111-1111-1111-1111-111111111112'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const LIST = '33333333-3333-3333-3333-333333333333'
const TASK = '44444444-4444-4444-4444-444444444444'

let client: PGlite
beforeEach(async () => {
  client = new PGlite()
  await applyMigrations(drizzle(client) as unknown as Database)
  await client.exec(`
    INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES
      ('${USER}', 'a@b.c', 'x', true, false, true, false),
      ('${OTHER_USER}', 'd@e.f', 'x', true, false, true, false);
    INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
    INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
    INSERT INTO tasks (id, list_id, title, estimate_minutes, "column", position, created_at) VALUES ('${TASK}', '${LIST}', 'Write', 30, 'today', 0, now());
  `)
})
afterEach(async () => {
  await client.close()
})

let counter = 0
const session = (options: { user?: string; ended?: boolean; task?: string | null } = {}) => {
  const id = `55555555-5555-5555-5555-${String(++counter).padStart(12, '0')}`
  const task = options.task === undefined ? `'${TASK}'` : options.task === null ? 'NULL' : `'${options.task}'`
  const kind = options.task === null ? 'break' : 'task'
  const planned = options.task === null ? '300' : 'NULL'
  const ended = options.ended ? `now(), 'pause'` : 'NULL, NULL'
  return client.query(
    `INSERT INTO focus_sessions (id, user_id, workspace_id, list_id, task_id, kind, device_id, started_at, ended_at, end_reason, planned_seconds, last_seen_at)
     VALUES ('${id}', '${options.user ?? USER}', '${WORKSPACE}', '${LIST}', ${task}, '${kind}', 'device-a', now(), ${ended}, ${planned}, now())`,
  )
}

const count = async (table: string) => (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n

describe('focus_sessions and focus_actions tables', () => {
  it('SYNC-01 refuses a second open session for the same user', async () => {
    await session()
    await expect(session()).rejects.toThrow(/ix_focus_sessions_open_user/)
    expect(await count('focus_sessions')).toBe(1)
  })

  it('SYNC-01 accepts one open and any number of closed sessions per user, and one open per other user', async () => {
    await session({ ended: true })
    await session({ ended: true })
    await session()
    await session({ user: OTHER_USER })
    expect(await count('focus_sessions')).toBe(4)
  })

  it('AD-005 deleting the task deletes its sessions and keeps the list breaks', async () => {
    await session({ ended: true })
    await session({ task: null })
    await client.query(`DELETE FROM tasks WHERE id = '${TASK}'`)
    const { rows } = await client.query<{ kind: string }>('SELECT kind FROM focus_sessions')
    expect(rows).toEqual([{ kind: 'break' }])
  })

  it('AD-005 deleting the list deletes its sessions, breaks included', async () => {
    await session({ ended: true })
    await session({ task: null })
    await client.query(`DELETE FROM lists WHERE id = '${LIST}'`)
    expect(await count('focus_sessions')).toBe(0)
  })

  it('deleting the workspace deletes its sessions', async () => {
    await session()
    await client.query(`DELETE FROM workspaces WHERE id = '${WORKSPACE}'`)
    expect(await count('focus_sessions')).toBe(0)
  })

  it('deleting the user deletes their sessions and applied actions, and keeps the other user', async () => {
    await session()
    await session({ user: OTHER_USER })
    await client.query(
      `INSERT INTO focus_actions (action_id, user_id, applied_at, response) VALUES
         ('66666666-6666-6666-6666-666666666661', '${USER}', now(), '{}'),
         ('66666666-6666-6666-6666-666666666662', '${OTHER_USER}', now(), '{}')`,
    )
    await client.query(`DELETE FROM users WHERE id = '${USER}'`)
    const sessions = await client.query<{ user_id: string }>('SELECT user_id FROM focus_sessions')
    const actions = await client.query<{ user_id: string }>('SELECT user_id FROM focus_actions')
    expect(sessions.rows).toEqual([{ user_id: OTHER_USER }])
    expect(actions.rows).toEqual([{ user_id: OTHER_USER }])
  })

  it('AD-002 refuses the same action_id twice', async () => {
    const insert = () =>
      client.query(
        `INSERT INTO focus_actions (action_id, user_id, applied_at, response) VALUES ('66666666-6666-6666-6666-666666666661', '${USER}', now(), '{}')`,
      )
    await insert()
    await expect(insert()).rejects.toThrow(/focus_actions_pkey/)
  })
})
