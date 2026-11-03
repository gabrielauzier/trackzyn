import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const LIST = '33333333-3333-3333-3333-333333333333'
const TASK = '44444444-4444-4444-4444-444444444444'
const TOKEN = '55555555-5555-5555-5555-555555555555'

let client: PGlite
beforeEach(async () => {
  client = new PGlite()
  await applyMigrations(drizzle(client) as unknown as Database)
  await client.exec(`
    INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
    INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
    INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, NULL, now());
    INSERT INTO personal_access_tokens (id, user_id, workspace_id, name, token_hash, last_four, scopes, created_at, expires_at)
      VALUES ('${TOKEN}', '${USER}', '${WORKSPACE}', 'n8n', '${'a'.repeat(64)}', 'abcd', '["tasks:create"]', now(), now() + interval '90 days');
    INSERT INTO tasks (id, list_id, title, "column", position, created_at, created_via_token_id) VALUES ('${TASK}', '${LIST}', 'Write', 'backlog', 0, now(), '${TOKEN}');
    INSERT INTO task_idempotency_keys (token_id, key, request_hash, task_id, created_at) VALUES ('${TOKEN}', 'retry-1', '${'b'.repeat(64)}', '${TASK}', now());
  `)
})
afterEach(async () => {
  await client.close()
})

const count = async (table: string) => (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`)).rows[0]?.n

describe('access token tables', () => {
  it('AUTH-06 deleting the user deletes the tokens and their idempotency keys', async () => {
    await client.query(`DELETE FROM users WHERE id = '${USER}'`)
    expect(await count('personal_access_tokens')).toBe(0)
    expect(await count('task_idempotency_keys')).toBe(0)
  })

  it('AUTH-07 deleting the workspace deletes the tokens and their idempotency keys', async () => {
    await client.query(`DELETE FROM workspaces WHERE id = '${WORKSPACE}'`)
    expect(await count('personal_access_tokens')).toBe(0)
    expect(await count('task_idempotency_keys')).toBe(0)
  })

  it('ORIGIN-05 deleting a token leaves the task with a null origin', async () => {
    await client.query(`DELETE FROM personal_access_tokens WHERE id = '${TOKEN}'`)
    const { rows } = await client.query<{ id: string; via: string | null }>(`SELECT id, created_via_token_id AS via FROM tasks`)
    expect(rows).toEqual([{ id: TASK, via: null }])
  })

  it('IDEM-04 deleting a task keeps its idempotency key', async () => {
    await client.query(`DELETE FROM tasks WHERE id = '${TASK}'`)
    const { rows } = await client.query<{ task_id: string }>(`SELECT task_id FROM task_idempotency_keys`)
    expect(rows).toEqual([{ task_id: TASK }])
  })

  it('indexes the task origin only where it is set', async () => {
    const { rows } = await client.query<{ indexdef: string }>(`SELECT indexdef FROM pg_indexes WHERE indexname = 'ix_tasks_created_via_token'`)
    expect(rows[0]?.indexdef).toMatch(/WHERE \(created_via_token_id IS NOT NULL\)/)
  })
})
