import { createHash, randomBytes } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type AccessToken, type TokenScope, type User, personalAccessTokens, users } from '../db/schema.ts'

export { TOKEN_SCOPES, type TokenScope } from '../db/schema.ts'

/** 32 random bytes in base64url are always 43 characters. */
const TOKEN_PATTERN = /^tkz_[A-Za-z0-9_-]{43}$/

export type TokenStatus = 'active' | 'expired' | 'revoked'

export interface TokenPrincipal {
  tokenId: string
  name: string
  user: User
  workspaceId: string
  scopes: TokenScope[]
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
