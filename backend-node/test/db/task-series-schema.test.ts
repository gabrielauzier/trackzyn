import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { applyMigrations } from '../../src/db/migrate.ts'

const USER = '11111111-1111-1111-1111-111111111111'
const WORKSPACE = '22222222-2222-2222-2222-222222222222'
const LIST = '33333333-3333-3333-3333-333333333333'
const TASK = '44444444-4444-4444-4444-000000000001'
const SERIES = '55555555-5555-5555-5555-000000000001'

const SEED = `
  INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled) VALUES ('${USER}', 'a@b.c', 'x', true, false, true, false);
  INSERT INTO workspaces (id, name, is_archived, created_at) VALUES ('${WORKSPACE}', 'Personal', false, now());
  INSERT INTO lists (id, workspace_id, name, color, position, created_by_user_id, created_at) VALUES ('${LIST}', '${WORKSPACE}', 'Work', 1, 0, '${USER}', now());
  INSERT INTO tasks (id, list_id, title, "column", position, created_at, scheduled_on) VALUES ('${TASK}', '${LIST}', 'Plan', 'backlog', 0, now(), '2026-11-13');
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

interface Rule {
  freq: string
  interval?: number
  weekdays?: number[] | null
  month_day?: number | null
  until?: string | null
  count?: number | null
}

let next = 0
/** Inserts a series with `rule`, and answers its id. */
async function series(rule: Rule): Promise<string> {
  next += 1
  const id = `55555555-5555-5555-5555-${String(next).padStart(12, '0')}`
  await client.query(
    `INSERT INTO task_series (id, workspace_id, freq, "interval", weekdays, month_day, until, "count", created_at)
     VALUES ($1, '${WORKSPACE}', $2, $3, $4, $5, $6, $7, now())`,
    [id, rule.freq, rule.interval ?? 1, rule.weekdays ?? null, rule.month_day ?? null, rule.until ?? null, rule.count ?? null],
  )
  return id
}

const count = async (table: string, where = 'true') =>
  (await client.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`)).rows[0]!.n

describe('the task_series table and tasks.series_id (agendamento, Recorrência; D15)', () => {
  it('stores a weekly rule with its days and a monthly rule with its day, with one created occurrence and no end', async () => {
    const weekly = await series({ freq: 'weekly', interval: 2, weekdays: [1, 3] })
    const monthly = await series({ freq: 'monthly', month_day: 31, until: '2027-06-30' })
    const daily = await series({ freq: 'daily', count: 5 })
    const found = await client.query<Record<string, unknown>>(
      `SELECT id, freq, "interval", weekdays, month_day, until::text, "count", created_count, ended_at FROM task_series ORDER BY id`,
    )
    expect(found.rows).toEqual([
      { id: weekly, freq: 'weekly', interval: 2, weekdays: [1, 3], month_day: null, until: null, count: null, created_count: 1, ended_at: null },
      { id: monthly, freq: 'monthly', interval: 1, weekdays: null, month_day: 31, until: '2027-06-30', count: null, created_count: 1, ended_at: null },
      { id: daily, freq: 'daily', interval: 1, weekdays: null, month_day: null, until: null, count: 5, created_count: 1, ended_at: null },
    ])
  })

  it('refuses a frequency other than daily, weekly or monthly', async () => {
    await expect(series({ freq: 'yearly' })).rejects.toThrow(/ck_task_series_freq/)
  })

  it('takes an interval from 1 to 99 and refuses 0 and 100', async () => {
    await series({ freq: 'daily', interval: 1 })
    await series({ freq: 'daily', interval: 99 })
    await expect(series({ freq: 'daily', interval: 0 })).rejects.toThrow(/ck_task_series_interval/)
    await expect(series({ freq: 'daily', interval: 100 })).rejects.toThrow(/ck_task_series_interval/)
  })

  it('takes weekdays from 1 (Monday) to 7 (Sunday) and refuses an empty list or a day out of 1 to 7', async () => {
    await series({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5, 6, 7] })
    await expect(series({ freq: 'weekly', weekdays: [] })).rejects.toThrow(/ck_task_series_weekdays/)
    await expect(series({ freq: 'weekly', weekdays: [0] })).rejects.toThrow(/ck_task_series_weekdays/)
    await expect(series({ freq: 'weekly', weekdays: [1, 8] })).rejects.toThrow(/ck_task_series_weekdays/)
  })

  it('wants weekdays on a weekly rule only', async () => {
    await expect(series({ freq: 'weekly' })).rejects.toThrow(/ck_task_series_weekly_weekdays/)
    await expect(series({ freq: 'daily', weekdays: [1] })).rejects.toThrow(/ck_task_series_weekly_weekdays/)
  })

  it('takes a month day from 1 to 31 and refuses 0 and 32', async () => {
    await series({ freq: 'monthly', month_day: 1 })
    await series({ freq: 'monthly', month_day: 31 })
    await expect(series({ freq: 'monthly', month_day: 0 })).rejects.toThrow(/ck_task_series_month_day/)
    await expect(series({ freq: 'monthly', month_day: 32 })).rejects.toThrow(/ck_task_series_month_day/)
  })

  it('wants a month day on a monthly rule only', async () => {
    await expect(series({ freq: 'monthly' })).rejects.toThrow(/ck_task_series_monthly_month_day/)
    await expect(series({ freq: 'weekly', weekdays: [5], month_day: 13 })).rejects.toThrow(/ck_task_series_monthly_month_day/)
  })

  it('takes a count from 1 to 999 and refuses 0 and 1000', async () => {
    await series({ freq: 'daily', count: 1 })
    await series({ freq: 'daily', count: 999 })
    await expect(series({ freq: 'daily', count: 0 })).rejects.toThrow(/ck_task_series_count/)
    await expect(series({ freq: 'daily', count: 1000 })).rejects.toThrow(/ck_task_series_count/)
  })

  it('takes an end day or a count, and refuses both together', async () => {
    await series({ freq: 'daily', until: '2026-12-31' })
    await series({ freq: 'daily', count: 3 })
    await expect(series({ freq: 'daily', until: '2026-12-31', count: 3 })).rejects.toThrow(/ck_task_series_until_or_count/)
  })

  it('leaves series_id null on the tasks, and refuses a series that does not exist', async () => {
    expect(await count('tasks', `id = '${TASK}' AND series_id IS NULL`)).toBe(1)
    await expect(client.query(`UPDATE tasks SET series_id = '${SERIES}' WHERE id = '${TASK}'`)).rejects.toThrow(/tasks_series_id_task_series_id_fk/)
  })

  it('deleting the series keeps its tasks, with series_id null', async () => {
    const id = await series({ freq: 'daily' })
    await client.query(`UPDATE tasks SET series_id = $1 WHERE id = '${TASK}'`, [id])
    expect(await count('tasks', `series_id = '${id}'`)).toBe(1)

    await client.query(`DELETE FROM task_series WHERE id = $1`, [id])
    expect(await count('tasks', `id = '${TASK}' AND series_id IS NULL`)).toBe(1)
  })

  it('deleting the workspace deletes its series', async () => {
    await series({ freq: 'daily' })
    await series({ freq: 'weekly', weekdays: [5] })
    expect(await count('task_series')).toBe(2)

    await client.query(`DELETE FROM workspaces WHERE id = '${WORKSPACE}'`)
    expect(await count('task_series')).toBe(0)
  })
})
