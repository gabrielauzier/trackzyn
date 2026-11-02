import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { and, desc, eq, gt, isNull, lte, or } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type AccessToken, type TokenScope, type User, personalAccessTokens, users, workspaces } from '../db/schema.ts'
import { HttpError, forbidden } from '../http/http-error.ts'
import { getMembership, isWorkspaceManager } from './workspaces.ts'

export { TOKEN_SCOPES, type TokenScope } from '../db/schema.ts'

/** 32 random bytes in base64url are always 43 characters. */
const TOKEN_PATTERN = /^tkz_[A-Za-z0-9_-]{43}$/
const MAX_ACTIVE_TOKENS = 50
const WRITE_SCOPES: readonly TokenScope[] = ['tasks:create', 'tasks:write', 'tasks:delete']
const DAY_MS = 86_400_000
const PURGE_AFTER_DAYS = 90

export type TokenStatus = 'active' | 'expired' | 'revoked'

export interface TokenPrincipal {
  tokenId: string
  name: string
  user: User
  workspaceId: string
  scopes: TokenScope[]
}

/** What the owner sees of a token: never its value or its hash. */
export interface AccessTokenView {
  id: string
  name: string
  workspaceId: string
  workspaceName: string
  scopes: TokenScope[]
  displayHint: string
  createdAt: Date
  expiresAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
  status: TokenStatus
}

export function hashToken(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/** A new token value and the only two things kept of it: its hash and its last four characters. */
export function generateToken(): { plaintext: string; tokenHash: string; lastFour: string } {
  const plaintext = `tkz_${randomBytes(32).toString('base64url')}`
  return { plaintext, tokenHash: hashToken(plaintext), lastFour: plaintext.slice(-4) }
}

export function displayHint(token: Pick<AccessToken, 'lastFour'>): string {
  return `tkz_…${token.lastFour}`
}

/** A token that expires at this very instant already counts as expired (AUTH-10). */
export function tokenStatus(token: Pick<AccessToken, 'revokedAt' | 'expiresAt'>, now: Date): TokenStatus {
  if (token.revokedAt) return 'revoked'
  return token.expiresAt.getTime() <= now.getTime() ? 'expired' : 'active'
}

/** Who the token acts as, or null when it is malformed, unknown, not active or its owner is inactive. */
export async function authenticate(db: Database, plaintext: string, now: Date = new Date()): Promise<TokenPrincipal | null> {
  if (!TOKEN_PATTERN.test(plaintext)) return null
  const [row] = await db
    .select({ token: personalAccessTokens, user: users })
    .from(personalAccessTokens)
    .innerJoin(users, eq(users.id, personalAccessTokens.userId))
    .where(eq(personalAccessTokens.tokenHash, hashToken(plaintext)))
    .limit(1)
  if (!row || !row.user.isActive || tokenStatus(row.token, now) !== 'active') return null
  return {
    tokenId: row.token.id,
    name: row.token.name,
    user: row.user,
    workspaceId: row.token.workspaceId,
    scopes: row.token.scopes,
  }
}

/**
 * Creates a token for `user`. "Active" depends on the clock, so no unique index can enforce the
 * name and the limit: the lock on the user's row serialises concurrent creations (TOKEN-15, TOKEN-16).
 */
export async function createToken(
  db: Database,
  user: User,
  input: { name: string; workspaceId: string; scopes: TokenScope[]; expiresInDays: number },
  now: Date = new Date(),
): Promise<{ row: AccessToken; plaintext: string }> {
  const member = await getMembership(db, input.workspaceId, user.id)
  if (!member && !(await isWorkspaceManager(db, input.workspaceId, user.id))) throw new HttpError(404, 'Workspace not found')
  if (member?.role === 'viewer' && input.scopes.some((scope) => WRITE_SCOPES.includes(scope))) throw forbidden('Read-only role')

  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, user.id)).for('update')
    await purgeEnded(tx as Database, user.id, now)
    const active = await tx
      .select({ name: personalAccessTokens.name })
      .from(personalAccessTokens)
      .where(and(eq(personalAccessTokens.userId, user.id), isNull(personalAccessTokens.revokedAt), gt(personalAccessTokens.expiresAt, now)))
    if (active.some((token) => token.name === input.name)) throw new HttpError(409, 'Token name already in use')
    if (active.length >= MAX_ACTIVE_TOKENS) throw new HttpError(409, 'Token limit reached')

    const { plaintext, tokenHash, lastFour } = generateToken()
    const row: AccessToken = {
      id: randomUUID(),
      userId: user.id,
      workspaceId: input.workspaceId,
      name: input.name,
      tokenHash,
      lastFour,
      scopes: input.scopes,
      createdAt: now,
      expiresAt: new Date(now.getTime() + input.expiresInDays * DAY_MS),
      lastUsedAt: null,
      revokedAt: null,
    }
    await tx.insert(personalAccessTokens).values(row)
    return { row, plaintext }
  })
}

/** The tokens of `userId`, newest first. */
export async function listTokens(db: Database, userId: string, now: Date = new Date()): Promise<AccessTokenView[]> {
  const found = await db
    .select({ token: personalAccessTokens, workspaceName: workspaces.name })
    .from(personalAccessTokens)
    .innerJoin(workspaces, eq(workspaces.id, personalAccessTokens.workspaceId))
    .where(eq(personalAccessTokens.userId, userId))
    .orderBy(desc(personalAccessTokens.createdAt), personalAccessTokens.id)
  return found.map(({ token, workspaceName }) => ({
    id: token.id,
    name: token.name,
    workspaceId: token.workspaceId,
    workspaceName,
    scopes: token.scopes,
    displayHint: displayHint(token),
    createdAt: token.createdAt,
    expiresAt: token.expiresAt,
    lastUsedAt: token.lastUsedAt,
    revokedAt: token.revokedAt,
    status: tokenStatus(token, now),
  }))
}

/** Marks the token as revoked and keeps the row (the task badge still shows it); a second call changes nothing. */
export async function revokeToken(db: Database, userId: string, tokenId: string, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const [token] = await tx
      .select({ id: personalAccessTokens.id })
      .from(personalAccessTokens)
      .where(and(eq(personalAccessTokens.id, tokenId), eq(personalAccessTokens.userId, userId)))
    if (!token) throw new HttpError(404, 'Token not found')
    await tx
      .update(personalAccessTokens)
      .set({ revokedAt: now })
      .where(and(eq(personalAccessTokens.id, token.id), isNull(personalAccessTokens.revokedAt)))
    await purgeEnded(tx as Database, userId, now)
  })
}

/** Deletes the tokens of `userId` that ended 90 days ago or more; their tasks stay, without the origin (MANAGE-08). */
export async function purgeEnded(tx: Database, userId: string, now: Date): Promise<void> {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * DAY_MS)
  await tx
    .delete(personalAccessTokens)
    .where(
      and(
        eq(personalAccessTokens.userId, userId),
        or(lte(personalAccessTokens.revokedAt, cutoff), lte(personalAccessTokens.expiresAt, cutoff)),
      ),
    )
}
