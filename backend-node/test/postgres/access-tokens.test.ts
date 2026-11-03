import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type User, personalAccessTokens, users, workspaceMembers, workspaces } from '../../src/db/schema.ts'
import { createToken, generateToken } from '../../src/services/access-tokens.ts'
import { migratedPostgres } from '../support/postgres.ts'

const NOW = new Date('2026-11-02T12:00:00.000Z')

let db: Database
let close: () => Promise<void>
let user: User
let workspaceId: string

beforeEach(async () => {
  ;({ db, close } = await migratedPostgres())
  const id = randomUUID()
  ;[user] = (await db
    .insert(users)
    .values({ id, email: `${id}@example.com`, hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
    .returning()) as [User]
  workspaceId = randomUUID()
  await db.insert(workspaces).values({ id: workspaceId, name: 'Shared', createdAt: NOW })
  await db.insert(workspaceMembers).values({ id: randomUUID(), workspaceId, userId: id, role: 'owner', joinedAt: NOW })
})
afterEach(async () => {
  await close()
})

const create = (name: string) => createToken(db, user, { name, workspaceId, scopes: ['lists:read'], expiresInDays: 90 }, NOW)

const refusals = (results: PromiseSettledResult<unknown>[]) =>
  results.flatMap((result) => (result.status === 'rejected' ? [(result.reason as { detail: string }).detail] : []))

const stored = () => db.select().from(personalAccessTokens).where(eq(personalAccessTokens.userId, user.id))

describe('createToken at the same time', () => {
  it('TOKEN-15 accepts only what fits in the limit of 50', async () => {
    await db.insert(personalAccessTokens).values(
      Array.from({ length: 47 }, (_, index) => ({
        id: randomUUID(),
        userId: user.id,
        workspaceId,
        name: `seed-${index}`,
        tokenHash: generateToken().tokenHash,
        lastFour: 'abcd',
        scopes: ['lists:read' as const],
        createdAt: NOW,
        expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      })),
    )

    const results = await Promise.allSettled(Array.from({ length: 8 }, (_, index) => create(`new-${index}`)))

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3)
    expect(refusals(results)).toEqual(Array(5).fill('Token limit reached'))
    expect(await stored()).toHaveLength(50)
  })

  it('TOKEN-16 accepts one token per name', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => create('same')))

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(refusals(results)).toEqual(Array(7).fill('Token name already in use'))
    expect((await stored()).map((token) => token.name)).toEqual(['same'])
  })
})
