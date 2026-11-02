import { createHash, randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TokenScope, type User, lists, personalAccessTokens, tasks, users, workspaceMembers, workspaces } from '../../src/db/schema.ts'
import { authenticate, createToken, displayHint, generateToken, listTokens, revokeToken, tokenStatus } from '../../src/services/access-tokens.ts'
import { migratedDb } from '../support/db.ts'

const NOW = new Date('2026-11-02T12:00:00.000Z')
const LATER = new Date('2027-01-01T00:00:00.000Z')
const DAY_MS = 86_400_000
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS)

let db: Database
let client: PGlite
beforeAll(async () => {
  ;({ db, client } = await migratedDb())
})
afterAll(async () => {
  await client.close()
})

async function addUser(isActive = true) {
  const id = randomUUID()
  await db.insert(users).values({ id, email: `${id}@example.com`, hashedPassword: 'x', isActive, isSuperuser: false, isVerified: true })
  return id
}

async function addWorkspace() {
  const id = randomUUID()
  await db.insert(workspaces).values({ id, name: 'Shared', createdAt: NOW })
  return id
}

/** A token row as a test wants it; `plaintext` overrides the generated value. */
async function addToken(options: { userId?: string; expiresAt?: Date; revokedAt?: Date; plaintext?: string } = {}) {
  const generated = generateToken()
  const plaintext = options.plaintext ?? generated.plaintext
  const id = randomUUID()
  const userId = options.userId ?? (await addUser())
  const workspaceId = await addWorkspace()
  await db.insert(personalAccessTokens).values({
    id,
    userId,
    workspaceId,
    name: 'n8n',
    tokenHash: createHash('sha256').update(plaintext).digest('hex'),
    lastFour: plaintext.slice(-4),
    scopes: ['lists:read', 'tasks:create'],
    createdAt: NOW,
    expiresAt: options.expiresAt ?? LATER,
    revokedAt: options.revokedAt ?? null,
  })
  return { id, plaintext, userId, workspaceId }
}

describe('generateToken', () => {
  it('TOKEN-04 gives tkz_ and 43 base64url characters, never the same value twice', () => {
    const values = Array.from({ length: 1000 }, () => generateToken().plaintext)
    for (const value of values) expect(value).toMatch(/^tkz_[A-Za-z0-9_-]{43}$/)
    expect(new Set(values).size).toBe(1000)
  })

  it('TOKEN-05 keeps only the SHA-256 and the last four characters', async () => {
    const { plaintext, tokenHash, lastFour } = generateToken()
    expect(tokenHash).toBe(createHash('sha256').update(plaintext).digest('hex'))
    expect(lastFour).toBe(plaintext.slice(-4))

    const { id } = await addToken({ plaintext })
    const [row] = await db.select().from(personalAccessTokens).where(eq(personalAccessTokens.id, id))
    expect(row?.tokenHash).toBe(tokenHash)
    expect(row?.lastFour).toBe(lastFour)
    expect(JSON.stringify(row)).not.toContain(plaintext)
  })
})

describe('displayHint', () => {
  it('MANAGE-02 is tkz_… and the last four characters', () => {
    expect(displayHint({ lastFour: 'a1B2' })).toBe('tkz_…a1B2')
  })
})

describe('tokenStatus', () => {
  const expiresAt = NOW

  it('MANAGE-03 is active before expires_at', () => {
    expect(tokenStatus({ expiresAt, revokedAt: null }, new Date(NOW.getTime() - 1))).toBe('active')
  })

  it('AUTH-10 is expired at the exact instant of expires_at', () => {
    expect(tokenStatus({ expiresAt, revokedAt: null }, NOW)).toBe('expired')
  })

  it('MANAGE-03 gives revoked priority over expired', () => {
    expect(tokenStatus({ expiresAt, revokedAt: new Date(NOW.getTime() - 5) }, new Date(NOW.getTime() + 5))).toBe('revoked')
  })
})

describe('authenticate', () => {
  it('AUTH-01 returns the owner, the workspace and the scopes of an active token', async () => {
    const token = await addToken()
    const principal = await authenticate(db, token.plaintext, NOW)
    expect(principal).toMatchObject({
      tokenId: token.id,
      name: 'n8n',
      workspaceId: token.workspaceId,
      scopes: ['lists:read', 'tasks:create'],
    })
    expect(principal?.user.id).toBe(token.userId)
  })

  it('AUTH-02 returns null for a token that does not exist', async () => {
    expect(await authenticate(db, generateToken().plaintext, NOW)).toBeNull()
  })

  it('AUTH-08 returns null for a malformed token, even with a stored hash', async () => {
    for (const plaintext of ['tkz_short', `tkz_${'a'.repeat(44)}`, `tkz_${'!'.repeat(43)}`, `xyz_${'a'.repeat(43)}`]) {
      await addToken({ plaintext })
      expect(await authenticate(db, plaintext, NOW)).toBeNull()
    }
  })

  it('AUTH-03 returns null for an expired token', async () => {
    const token = await addToken({ expiresAt: new Date(NOW.getTime() - 1) })
    expect(await authenticate(db, token.plaintext, NOW)).toBeNull()
  })

  it('AUTH-10 returns null at the exact instant of expires_at and the token still works just before', async () => {
    const token = await addToken({ expiresAt: NOW })
    expect(await authenticate(db, token.plaintext, NOW)).toBeNull()
    expect((await authenticate(db, token.plaintext, new Date(NOW.getTime() - 1)))?.tokenId).toBe(token.id)
  })

  it('AUTH-04 returns null for a revoked token that has not expired', async () => {
    const token = await addToken({ revokedAt: NOW })
    expect(await authenticate(db, token.plaintext, NOW)).toBeNull()
  })

  it('AUTH-05 returns null when the owner is inactive', async () => {
    const token = await addToken({ userId: await addUser(false) })
    expect(await authenticate(db, token.plaintext, NOW)).toBeNull()
  })
})

describe('createToken', () => {
  let user: User
  let workspaceId: string

  async function userRow(): Promise<User> {
    const id = await addUser()
    const [row] = await db.select().from(users).where(eq(users.id, id))
    return row as User
  }

  async function join(id: string, role: 'owner' | 'editor' | 'viewer') {
    await db.insert(workspaceMembers).values({ id: randomUUID(), workspaceId, userId: id, role, joinedAt: NOW })
  }

  const create = (who: User, overrides: { name?: string; scopes?: TokenScope[]; expiresInDays?: number; workspaceId?: string } = {}, now = NOW) =>
    createToken(
      db,
      who,
      { name: 'n8n', workspaceId, scopes: ['lists:read', 'tasks:create'], expiresInDays: 90, ...overrides },
      now,
    )

  /** `count` tokens of `user` straight in the table, each with its own name. */
  async function seedTokens(count: number, state: { expiresAt?: Date; revokedAt?: Date } = {}) {
    await db.insert(personalAccessTokens).values(
      Array.from({ length: count }, () => {
        const { tokenHash, lastFour } = generateToken()
        return {
          id: randomUUID(),
          userId: user.id,
          workspaceId,
          name: `seed-${randomUUID()}`,
          tokenHash,
          lastFour,
          scopes: ['lists:read' as const],
          createdAt: NOW,
          expiresAt: state.expiresAt ?? LATER,
          revokedAt: state.revokedAt ?? null,
        }
      }),
    )
  }

  const stored = async (who: User) => db.select().from(personalAccessTokens).where(eq(personalAccessTokens.userId, who.id))

  beforeEach(async () => {
    user = await userRow()
    workspaceId = await addWorkspace()
    await join(user.id, 'owner')
  })

  it('TOKEN-03 returns the row and the value, and the value authenticates as the user', async () => {
    const { row, plaintext } = await create(user, { name: 'CI' })
    expect(row).toMatchObject({ userId: user.id, workspaceId, name: 'CI', scopes: ['lists:read', 'tasks:create'], createdAt: NOW, lastUsedAt: null, revokedAt: null })
    expect(plaintext).toMatch(/^tkz_[A-Za-z0-9_-]{43}$/)
    expect((await authenticate(db, plaintext, NOW))?.user.id).toBe(user.id)
  })

  it.each([30, 90, 365])('TOKEN-03 expires %i days after creation', async (expiresInDays) => {
    const { row } = await create(user, { expiresInDays })
    expect(row.expiresAt).toEqual(new Date(NOW.getTime() + expiresInDays * DAY_MS))
  })

  it('TOKEN-05 stores the SHA-256 and the last four characters, never the value', async () => {
    const { plaintext } = await create(user)
    const [row] = await stored(user)
    expect(row?.tokenHash).toBe(createHash('sha256').update(plaintext).digest('hex'))
    expect(row?.lastFour).toBe(plaintext.slice(-4))
    expect(JSON.stringify(row)).not.toContain(plaintext)
  })

  it('TOKEN-08 refuses the name of an active token of the same user', async () => {
    await create(user, { name: 'CI' })
    await expect(create(user, { name: 'CI' })).rejects.toMatchObject({ statusCode: 409, detail: 'Token name already in use' })
    expect(await stored(user)).toHaveLength(1)
  })

  it('TOKEN-08 accepts the name of a revoked or an expired token, and of another user', async () => {
    const revoked = await create(user, { name: 'Revoked' })
    await db.update(personalAccessTokens).set({ revokedAt: NOW }).where(eq(personalAccessTokens.id, revoked.row.id))
    expect((await create(user, { name: 'Revoked' })).row.name).toBe('Revoked')

    const expired = await create(user, { name: 'Expired' })
    await db.update(personalAccessTokens).set({ expiresAt: NOW }).where(eq(personalAccessTokens.id, expired.row.id))
    expect((await create(user, { name: 'Expired' })).row.name).toBe('Expired')

    const other = await userRow()
    await join(other.id, 'editor')
    await create(user, { name: 'Shared' })
    expect((await create(other, { name: 'Shared' })).row.name).toBe('Shared')
  })

  it('TOKEN-09 accepts the 50th active token and refuses the 51st', async () => {
    await seedTokens(49)
    await create(user, { name: 'fiftieth' })
    await expect(create(user, { name: 'fifty-first' })).rejects.toMatchObject({ statusCode: 409, detail: 'Token limit reached' })
    expect(await stored(user)).toHaveLength(50)
  })

  it('TOKEN-09 does not count revoked or expired tokens', async () => {
    await seedTokens(49)
    await seedTokens(1, { revokedAt: NOW })
    await seedTokens(1, { expiresAt: NOW })
    expect((await create(user, { name: 'fiftieth' })).row.name).toBe('fiftieth')
  })

  it('TOKEN-10 answers 404 for a workspace the user does not belong to, or that does not exist', async () => {
    const stranger = await userRow()
    await expect(create(stranger)).rejects.toMatchObject({ statusCode: 404, detail: 'Workspace not found' })
    await expect(create(user, { workspaceId: randomUUID() })).rejects.toMatchObject({ statusCode: 404, detail: 'Workspace not found' })
    expect(await stored(stranger)).toEqual([])
  })

  it('accepts the manager of the workspace, who has no membership row', async () => {
    const manager = await userRow()
    await db.update(workspaces).set({ managedByUserId: manager.id }).where(eq(workspaces.id, workspaceId))
    expect((await create(manager, { scopes: ['tasks:delete'] })).row.workspaceId).toBe(workspaceId)
  })

  it.each<TokenScope>(['tasks:create', 'tasks:write', 'tasks:delete'])('TOKEN-11 refuses %s to a viewer', async (scope) => {
    const viewer = await userRow()
    await join(viewer.id, 'viewer')
    await expect(create(viewer, { scopes: ['lists:read', scope] })).rejects.toMatchObject({ statusCode: 403, detail: 'Read-only role' })
    expect(await stored(viewer)).toEqual([])
  })

  it('TOKEN-11 accepts read scopes from a viewer and every scope from an editor', async () => {
    const viewer = await userRow()
    await join(viewer.id, 'viewer')
    expect((await create(viewer, { scopes: ['lists:read', 'tasks:read'] })).row.scopes).toEqual(['lists:read', 'tasks:read'])

    const editor = await userRow()
    await join(editor.id, 'editor')
    const all: TokenScope[] = ['lists:read', 'tasks:read', 'tasks:create', 'tasks:write', 'tasks:delete']
    expect((await create(editor, { scopes: all })).row.scopes).toEqual(all)
  })

  it('MANAGE-08 deletes the tokens that ended 90 days ago on the next creation, and keeps the ones at 89 days', async () => {
    await seedTokens(1, { revokedAt: daysAgo(90) })
    await seedTokens(1, { expiresAt: daysAgo(90) })
    await seedTokens(1, { revokedAt: daysAgo(89) })
    await seedTokens(1, { expiresAt: daysAgo(89) })

    await create(user)

    const left = await stored(user)
    expect(left).toHaveLength(3)
    expect(left.filter((token) => token.name === 'n8n')).toHaveLength(1)
    expect(left.filter((token) => token.revokedAt?.getTime() === daysAgo(89).getTime())).toHaveLength(1)
    expect(left.filter((token) => token.expiresAt.getTime() === daysAgo(89).getTime())).toHaveLength(1)
  })
})

describe('listTokens', () => {
  it('MANAGE-01 returns every field of the token, and no hash or value', async () => {
    const token = await addToken()
    await db.update(personalAccessTokens).set({ lastUsedAt: NOW }).where(eq(personalAccessTokens.id, token.id))

    expect(await listTokens(db, token.userId, NOW)).toEqual([
      {
        id: token.id,
        name: 'n8n',
        workspaceId: token.workspaceId,
        workspaceName: 'Shared',
        scopes: ['lists:read', 'tasks:create'],
        displayHint: `tkz_…${token.plaintext.slice(-4)}`,
        createdAt: NOW,
        expiresAt: LATER,
        lastUsedAt: NOW,
        revokedAt: null,
        status: 'active',
      },
    ])
  })

  it('MANAGE-01 returns only the tokens of the user', async () => {
    const mine = await addToken()
    await addToken()
    expect((await listTokens(db, mine.userId, NOW)).map((token) => token.id)).toEqual([mine.id])
  })

  it('MANAGE-03 computes the status of each token', async () => {
    const userId = await addUser()
    const active = await addToken({ userId })
    const expired = await addToken({ userId, expiresAt: NOW })
    const revoked = await addToken({ userId, revokedAt: NOW })
    const status = Object.fromEntries((await listTokens(db, userId, NOW)).map((token) => [token.id, token.status]))
    expect(status).toEqual({ [active.id]: 'active', [expired.id]: 'expired', [revoked.id]: 'revoked' })
  })
})

describe('revokeToken', () => {
  const readRow = async (id: string) => (await db.select().from(personalAccessTokens).where(eq(personalAccessTokens.id, id)))[0]

  it('MANAGE-04 marks the token as revoked and keeps the row', async () => {
    const token = await addToken()
    await revokeToken(db, token.userId, token.id, NOW)
    expect((await readRow(token.id))?.revokedAt).toEqual(NOW)
  })

  it('MANAGE-05 does not change revoked_at when revoked again', async () => {
    const token = await addToken()
    await revokeToken(db, token.userId, token.id, NOW)
    await revokeToken(db, token.userId, token.id, new Date(NOW.getTime() + 1000))
    expect((await readRow(token.id))?.revokedAt).toEqual(NOW)
  })

  it('MANAGE-05 fills revoked_at of an expired token', async () => {
    const token = await addToken({ expiresAt: daysAgo(1) })
    await revokeToken(db, token.userId, token.id, NOW)
    expect((await readRow(token.id))?.revokedAt).toEqual(NOW)
  })

  it('MANAGE-06 answers 404 for the token of another user and leaves it alone', async () => {
    const token = await addToken()
    await expect(revokeToken(db, await addUser(), token.id, NOW)).rejects.toMatchObject({ statusCode: 404 })
    expect((await readRow(token.id))?.revokedAt).toBeNull()
  })

  it('MANAGE-08 deletes the tokens of the user that ended 90 days ago, and keeps the ones at 89 days and the ones of others', async () => {
    const userId = await addUser()
    const target = await addToken({ userId })
    const revoked90 = await addToken({ userId, revokedAt: daysAgo(90) })
    const expired90 = await addToken({ userId, expiresAt: daysAgo(90) })
    const revoked89 = await addToken({ userId, revokedAt: daysAgo(89) })
    const expired89 = await addToken({ userId, expiresAt: daysAgo(89) })
    const others = await addToken({ revokedAt: daysAgo(90) })

    await revokeToken(db, userId, target.id, NOW)

    expect(await readRow(revoked90.id)).toBeUndefined()
    expect(await readRow(expired90.id)).toBeUndefined()
    expect(await readRow(revoked89.id)).toBeDefined()
    expect(await readRow(expired89.id)).toBeDefined()
    expect(await readRow(target.id)).toBeDefined()
    expect(await readRow(others.id)).toBeDefined()
  })

  it('MANAGE-08 keeps the tasks of a deleted token, without the origin', async () => {
    const userId = await addUser()
    const ended = await addToken({ userId, revokedAt: daysAgo(90) })
    const target = await addToken({ userId })
    const listId = randomUUID()
    const taskId = randomUUID()
    await db.insert(lists).values({ id: listId, workspaceId: ended.workspaceId, name: 'Work', color: 1, position: 0, createdAt: NOW })
    await db.insert(tasks).values({ id: taskId, listId, title: 'From a token', column: 'backlog', position: 0, createdAt: NOW, createdViaTokenId: ended.id })

    await revokeToken(db, userId, target.id, NOW)

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId))
    expect(task?.title).toBe('From a token')
    expect(task?.createdViaTokenId).toBeNull()
  })
})
