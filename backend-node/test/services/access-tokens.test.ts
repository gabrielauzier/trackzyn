import { createHash, randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { personalAccessTokens, users, workspaces } from '../../src/db/schema.ts'
import { authenticate, displayHint, generateToken, tokenStatus } from '../../src/services/access-tokens.ts'
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
