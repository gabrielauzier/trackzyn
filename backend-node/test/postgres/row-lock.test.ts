import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { users } from '../../src/db/schema.ts'
import { rows } from '../support/db.ts'
import { migratedPostgres } from '../support/postgres.ts'

let db: Database
let close: () => Promise<void>
beforeEach(async () => {
  ;({ db, close } = await migratedPostgres())
})
afterEach(async () => {
  await close()
})

const waitingOnLocks = async () =>
  (
    await rows<{ n: number }>(
      db,
      sql`select count(*)::int as n from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'`,
    )
  )[0]?.n

describe('a real PostgreSQL', () => {
  it('starts each test on an empty, migrated database', async () => {
    expect(await db.select().from(users)).toEqual([])
  })

  it('makes a second FOR UPDATE wait for the first transaction to commit', async () => {
    const id = randomUUID()
    await db.insert(users).values({ id, email: 'before@example.com', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
    const order: string[] = []
    let second: Promise<string | undefined> | undefined

    await db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, id)).for('update')
      second = db.transaction(async (other) => {
        const [row] = await other.select({ email: users.email }).from(users).where(eq(users.id, id)).for('update')
        order.push('second got the lock')
        return row?.email
      })
      await vi.waitFor(async () => expect(await waitingOnLocks()).toBe(1), { timeout: 10_000 })
      await tx.update(users).set({ email: 'after@example.com' }).where(eq(users.id, id))
      order.push('first still holds the lock')
    })

    // The second transaction read the row only after the first committed, so it sees the new value.
    expect(await second).toBe('after@example.com')
    expect(order).toEqual(['first still holds the lock', 'second got the lock'])
  })
})
