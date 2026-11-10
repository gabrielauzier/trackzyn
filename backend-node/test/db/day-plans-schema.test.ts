import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const LIST = '33333333-3333-3333-3333-333333333333'
const TASK = '44444444-4444-4444-4444-000000000001'
const PLAN = '55555555-5555-5555-5555-000000000001'

const SEED = `
  INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
  INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
  INSERT INTO tasks (id, list_id, title, "column", position, created_at) VALUES ('${TASK}', '${LIST}', 'Plan', 'backlog', 0, now());
  INSERT INTO day_plans (id, user_id, workspace_id, day, version, updated_at) VALUES ('${PLAN}', '${USER}', '${WORKSPACE}', '2026-11-08', 1, now());
`

let client: PGlite
beforeEach(async () => {
  client = new PGlite()
  await applyMigrations(drizzle(client) as unknown as Database)
  await client.exec(SEED)
})
afterEach(async () => {
  await client.close()
})

type Block = { kind: string; task_id?: string | null; name?: string | null; list_id?: string | null; start_time?: string; minutes?: number }

const insertBlock = (block: Block) =>
  client.query(
    `INSERT INTO day_plan_blocks (id, plan_id, kind, task_id, name, list_id, start_time, minutes) VALUES (gen_random_uuid(), '${PLAN}', $1, $2, $3, $4, $5, $6)`,
    [block.kind, block.task_id ?? null, block.name ?? null, block.list_id ?? null, block.start_time ?? '09:00', block.minutes ?? 60],
  )

const task = (over: Partial<Block> = {}): Block => ({ kind: 'task', task_id: TASK, ...over })
const pause = (over: Partial<Block> = {}): Block => ({ kind: 'break', name: 'Almoço', list_id: LIST, ...over })

const blockCount = async () => (await client.query<{ n: number }>('SELECT count(*)::int AS n FROM day_plan_blocks')).rows[0]!.n

describe('the day plan tables (planejamento-diario, data model)', () => {
  it('keeps a task block and a break block at any minute', async () => {
    await insertBlock(task({ start_time: '10:37', minutes: 1440 }))
    await insertBlock(pause({ start_time: '12:00', minutes: 120 }))
    const found = await client.query<{ kind: string; start_time: string; minutes: number }>(
      'SELECT kind, start_time::text, minutes FROM day_plan_blocks ORDER BY start_time',
    )
    expect(found.rows).toEqual([
      { kind: 'task', start_time: '10:37:00', minutes: 1440 },
      { kind: 'break', start_time: '12:00:00', minutes: 120 },
    ])
  })

  it('refuses a task block without a task', async () => {
    await expect(insertBlock(task({ task_id: null }))).rejects.toThrow(/ck_day_plan_blocks_shape/)
  })

  it('refuses a break without a name or without a list (PLAN-43, PLAN-18)', async () => {
    await expect(insertBlock(pause({ name: null }))).rejects.toThrow(/ck_day_plan_blocks_shape/)
    await expect(insertBlock(pause({ name: '' }))).rejects.toThrow(/ck_day_plan_blocks_shape/)
    await expect(insertBlock(pause({ list_id: null }))).rejects.toThrow(/ck_day_plan_blocks_shape/)
    expect(await blockCount()).toBe(0)
  })

  it('refuses a break outside 5 to 120 minutes (PLAN-17)', async () => {
    await expect(insertBlock(pause({ minutes: 4 }))).rejects.toThrow(/ck_day_plan_blocks_minutes/)
    await expect(insertBlock(pause({ minutes: 121 }))).rejects.toThrow(/ck_day_plan_blocks_minutes/)
    await insertBlock(pause({ minutes: 5 }))
    expect(await blockCount()).toBe(1)
  })

  it('refuses a task block outside 5 to 1440 minutes (PLAN-05)', async () => {
    await expect(insertBlock(task({ minutes: 4 }))).rejects.toThrow(/ck_day_plan_blocks_minutes/)
    await expect(insertBlock(task({ minutes: 1441 }))).rejects.toThrow(/ck_day_plan_blocks_minutes/)
    await insertBlock(task({ minutes: 5 }))
    expect(await blockCount()).toBe(1)
  })

  it('refuses a start with seconds', async () => {
    await expect(insertBlock(task({ start_time: '10:15:30' }))).rejects.toThrow(/ck_day_plan_blocks_start_minute/)
  })

  it('refuses a second plan of the same user, workspace and day', async () => {
    await expect(
      client.query(
        `INSERT INTO day_plans (id, user_id, workspace_id, day, version, updated_at) VALUES (gen_random_uuid(), '${USER}', '${WORKSPACE}', '2026-11-08', 1, now())`,
      ),
    ).rejects.toThrow(/uq_day_plans_user_workspace_day/)
    await client.query(
      `INSERT INTO day_plans (id, user_id, workspace_id, day, version, updated_at) VALUES (gen_random_uuid(), '${USER}', '${WORKSPACE}', '2026-11-09', 1, now())`,
    )
  })

  it('drops the block when its task is deleted (PLAN-40)', async () => {
    await insertBlock(task())
    await insertBlock(pause())
    await client.query(`DELETE FROM tasks WHERE id = '${TASK}'`)
    const left = await client.query<{ kind: string }>('SELECT kind FROM day_plan_blocks')
    expect(left.rows).toEqual([{ kind: 'break' }])
  })

  it('drops the break when its list is deleted', async () => {
    await insertBlock(pause())
    await client.query(`DELETE FROM lists WHERE id = '${LIST}'`)
    expect(await blockCount()).toBe(0)
  })

  it('drops the blocks when the plan is deleted', async () => {
    await insertBlock(task())
    await insertBlock(pause())
    await client.query(`DELETE FROM day_plans WHERE id = '${PLAN}'`)
    expect(await blockCount()).toBe(0)
  })

  it('drops the plan with its workspace', async () => {
    await insertBlock(pause())
    await client.query(`DELETE FROM workspaces WHERE id = '${WORKSPACE}'`)
    expect((await client.query('SELECT id FROM day_plans')).rows).toEqual([])
    expect(await blockCount()).toBe(0)
  })

  it('drops the plan with its user', async () => {
    await insertBlock(task())
    await client.query(`DELETE FROM users WHERE id = '${USER}'`)
    expect((await client.query('SELECT id FROM day_plans')).rows).toEqual([])
    expect(await blockCount()).toBe(0)
  })
})
