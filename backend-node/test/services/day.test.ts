import type { PGlite } from '@electric-sql/pglite'
import { sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { daySql, dayTimezone } from '../../src/services/day.ts'
import { setAppSetting } from '../../src/services/settings.ts'
import { migratedDb, rows } from '../support/db.ts'

let db: Database
let client: PGlite
beforeEach(async () => {
  ;({ db, client } = await migratedDb())
})
afterEach(async () => {
  await client.close()
})

describe('dayTimezone', () => {
  it('uses the workspace timezone when it has one', async () => {
    await setAppSetting(db, 'timezone', 'Asia/Tokyo')
    expect(await dayTimezone(db, { timezone: 'America/Sao_Paulo' })).toBe('America/Sao_Paulo')
  })

  it("falls back to the application's timezone when the workspace has none", async () => {
    await setAppSetting(db, 'timezone', 'Asia/Tokyo')
    expect(await dayTimezone(db, { timezone: null })).toBe('Asia/Tokyo')
  })
})

describe('daySql', () => {
  it('puts 02:30 UTC of a Saturday in Sao Paulo on Friday, in the week that started the Monday before', async () => {
    // 2026-10-24 is a Saturday; in America/Sao_Paulo (UTC-3) it is still Friday 23:30.
    const now = new Date('2026-10-24T02:30:00Z')
    const { todayStart, weekStart, today } = daySql('America/Sao_Paulo', now)
    const [row] = await rows<{ today_start: string; week_start: string; today: string }>(
      db,
      sql`SELECT (${todayStart})::text AS today_start, (${weekStart})::text AS week_start, (${today})::text AS today`,
    )
    expect(new Date(row!.today_start).toISOString()).toBe('2026-10-23T03:00:00.000Z')
    expect(new Date(row!.week_start).toISOString()).toBe('2026-10-19T03:00:00.000Z')
    expect(row!.today).toBe('2026-10-23')
  })

  it('starts the week on the same day when today is a Monday', async () => {
    const now = new Date('2026-10-19T12:00:00Z')
    const { todayStart, weekStart } = daySql('America/Sao_Paulo', now)
    const [row] = await rows<{ same: boolean }>(db, sql`SELECT (${todayStart}) = (${weekStart}) AS same`)
    expect(row!.same).toBe(true)
  })
})
