import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Config } from '../config.ts'
import type { Database } from '../db/client.ts'
import { type User, users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { normalizeEmail } from './emails.ts'
import { hashPassword, verifyAndUpdate } from './password.ts'
import { createPersonalWorkspaceForUser } from './workspaces.ts'

export const DEFAULT_PREFERENCES = { language: 'en', date_format: 'MM/DD/YYYY' }

export class UserAlreadyExists extends Error {}

/** UserRead of the Python API: the columns a client may see. */
export function toUserRead(user: User) {
  return {
    id: user.id,
    email: user.email,
    is_active: user.isActive,
    is_superuser: user.isSuperuser,
    is_verified: user.isVerified,
    preferences: user.preferences ?? null,
    is_2fa_enabled: user.is2faEnabled,
  }
}

export async function getUserById(db: Database, id: string): Promise<User | null> {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return user ?? null
}

/** Case-insensitive, like fastapi-users' `get_by_email`. */
export async function getUserByEmail(db: Database, email: string): Promise<User | null> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.email}) = lower(${email})`)
    .limit(1)
  return user ?? null
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface NewUserInput {
  email: string
  password: string
  isSuperuser?: boolean
  isActive?: boolean
  isVerified?: boolean
  preferences?: Record<string, unknown> | null
}

/** fastapi-users' `create`: refuses a duplicate e-mail, stores an argon2 hash. */
export async function createUser(db: Database, input: NewUserInput): Promise<User> {
  if (await getUserByEmail(db, input.email)) throw new UserAlreadyExists()
  const user: User = {
    id: randomUUID(),
    email: normalizeEmail(input.email),
    hashedPassword: await hashPassword(input.password),
    isActive: input.isActive ?? true,
    isSuperuser: input.isSuperuser ?? false,
    isVerified: input.isVerified ?? false,
    preferences: input.preferences === undefined ? { ...DEFAULT_PREFERENCES } : input.preferences,
    totpSecret: null,
    is2faEnabled: false,
    oidcIssuer: null,
    oidcSubject: null,
  }
  await db.insert(users).values(user)
  return user
}

/** Registration through the API: the user, then their Personal workspace. */
export async function registerUser(db: Database, input: NewUserInput): Promise<User> {
  const user = await createUser(db, input)
  await createPersonalWorkspaceForUser(db, user)
  return user
}

export interface UserUpdate {
  email?: string | null
  password?: string | null
  isActive?: boolean | null
  isSuperuser?: boolean | null
  isVerified?: boolean | null
  preferences?: Record<string, unknown> | null
}

/**
 * fastapi-users' `_update`: a new e-mail must be free and resets `is_verified`; a password is
 * stored hashed. `safe` ignores the three privilege flags (the self-service route).
 */
export async function updateUser(
  db: Database,
  config: Config,
  user: User,
  update: UserUpdate,
  options: { safe: boolean },
): Promise<User> {
  const changes: Partial<User> = {}

  if (update.password !== undefined && update.password !== null) {
    if (!config.localAuthEnabled) throw new HttpError(403, 'LOCAL_AUTH_DISABLED')
    changes.hashedPassword = await hashPassword(update.password)
  }
  if (update.email !== undefined && update.email !== null && update.email !== user.email) {
    const existing = await getUserByEmail(db, update.email)
    if (existing) throw new HttpError(400, 'UPDATE_USER_EMAIL_ALREADY_EXISTS')
    changes.email = normalizeEmail(update.email)
    changes.isVerified = false
  }
  if (update.preferences !== undefined) changes.preferences = update.preferences
  if (!options.safe) {
    if (update.isActive !== undefined && update.isActive !== null) changes.isActive = update.isActive
    if (update.isSuperuser !== undefined && update.isSuperuser !== null) changes.isSuperuser = update.isSuperuser
    if (update.isVerified !== undefined && update.isVerified !== null && changes.isVerified === undefined) {
      changes.isVerified = update.isVerified
    }
  }

  if (Object.keys(changes).length === 0) return user
  await db.update(users).set(changes).where(eq(users.id, user.id))
  return { ...user, ...changes }
}

export type Authenticated = { user: User; updatedHash: string | null }

/** fastapi-users' `authenticate`: e-mail and password, upgrading the stored hash when it is stale. */
export async function authenticate(db: Database, email: string, password: string): Promise<User | null> {
  const user = await getUserByEmail(db, email)
  if (!user) {
    // Same work as a real check, so a missing account is not distinguishable by timing.
    await hashPassword(password)
    return null
  }
  const { valid, updatedHash } = await verifyAndUpdate(password, user.hashedPassword)
  if (!valid) return null
  if (updatedHash) {
    await db.update(users).set({ hashedPassword: updatedHash }).where(eq(users.id, user.id))
    return { ...user, hashedPassword: updatedHash }
  }
  return user
}
