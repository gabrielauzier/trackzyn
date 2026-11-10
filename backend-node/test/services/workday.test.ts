import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type User, users } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { setWorkday } from '../../src/services/users.ts'
import { migratedDb } from '../support/db.ts'

let db: Database
let client: PGlite
let user: User

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  const id = randomUUID()
  await db.insert(users).values({
    id,
    email: 'a@b.c',
    hashedPassword: 'x',
    isActive: true,
    isSuperuser: false,
    isVerified: true,
    preferences: { theme: 'dark', locale: 'pt-BR', workday: { start: '09:00', end: '18:00' } },
  })
  user = (await db.select().from(users).where(eq(users.id, id)))[0]!
})
afterEach(async () => {
  await client.close()
})

const preferences = async () => (await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, user.id)))[0]!.preferences

describe('setWorkday: the workday in the user preferences (PLAN-22, PLAN-23)', () => {
  it('saves the start and the end and keeps the other preferences (PLAN-22)', async () => {
    expect(await setWorkday(db, user, { start: '08:30', end: '17:15' })).toEqual({ start: '08:30', end: '17:15' })
    expect(await preferences()).toEqual({ theme: 'dark', locale: 'pt-BR', workday: { start: '08:30', end: '17:15' } })
  })

  it('saves the workday of a user without preferences', async () => {
    await db.update(users).set({ preferences: null }).where(eq(users.id, user.id))
    await setWorkday(db, { ...user, preferences: null }, { start: '07:00', end: '16:00' })
    expect(await preferences()).toEqual({ workday: { start: '07:00', end: '16:00' } })
  })

  it('merges into the stored preferences, not into a stale copy of the user', async () => {
    await db.update(users).set({ preferences: { theme: 'light' } }).where(eq(users.id, user.id))
    await setWorkday(db, user, { start: '10:00', end: '19:00' })
    expect(await preferences()).toEqual({ theme: 'light', workday: { start: '10:00', end: '19:00' } })
  })

  it('refuses an end that is not after the start with 422 and keeps the preferences (PLAN-23)', async () => {
    for (const workday of [
      { start: '18:00', end: '09:00' },
      { start: '09:00', end: '09:00' },
    ]) {
      const error = await setWorkday(db, user, workday).then(
        () => null,
        (caught: unknown) => caught,
      )
      expect(error).toBeInstanceOf(HttpError)
      expect((error as HttpError).statusCode).toBe(422)
      expect((error as HttpError).extra).toEqual({ code: 'workday_end_before_start' })
    }
    expect(await preferences()).toEqual({ theme: 'dark', locale: 'pt-BR', workday: { start: '09:00', end: '18:00' } })
  })
})
