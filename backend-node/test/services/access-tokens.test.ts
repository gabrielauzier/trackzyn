import { createHash, randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TokenScope, type User, personalAccessTokens, users, workspaceMembers, workspaces } from '../../src/db/schema.ts'
import { authenticate, createToken, displayHint, generateToken, tokenStatus } from '../../src/services/access-tokens.ts'
import { migratedDb } from '../support/db.ts'

const NOW = new Date('2026-11-02T12:00:00.000Z')
const LATER = new Date('2027-01-01T00:00:00.000Z')

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
  const DAY_MS = 86_400_000
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
})
