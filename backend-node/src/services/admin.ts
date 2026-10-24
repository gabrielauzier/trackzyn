import { and, asc, count, eq, ilike } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type User, users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { normalizeEmail } from './emails.ts'
import { hashPassword } from './password.ts'
import { UserAlreadyExists, createUser, getUserById } from './users.ts'
import { createPersonalWorkspaceForUser } from './workspaces.ts'

/** AdminUserRead of the Python API. */
export function toAdminUserRead(user: User) {
  return {
    id: user.id,
    email: user.email,
    is_active: user.isActive,
    is_superuser: user.isSuperuser,
    is_verified: user.isVerified,
    preferences: user.preferences ?? null,
  }
}

export async function listUsers(db: Database, search: string | undefined, page: number, limit: number) {
  const filter = search ? ilike(users.email, `%${search}%`) : undefined
  const [total] = await db.select({ n: count() }).from(users).where(filter)
  const items = await db
    .select()
    .from(users)
    .where(filter)
    .orderBy(asc(users.email))
    .offset((page - 1) * limit)
    .limit(limit)
  return { items, total: total?.n ?? 0 }
}

export interface AdminUserCreateInput {
  email: string
  password: string
  isSuperuser: boolean
  preferences?: Record<string, unknown> | null
}

/** `admin_service.create_user`: active and verified, with a Personal workspace. */
export async function createAdminUser(db: Database, input: AdminUserCreateInput): Promise<User> {
  let user: User
  try {
    user = await createUser(db, {
      email: input.email,
      password: input.password,
      isSuperuser: input.isSuperuser,
      isActive: true,
      isVerified: true,
    })
  } catch (error) {
    if (error instanceof UserAlreadyExists) throw new HttpError(400, 'A user with this email already exists')
    throw error
  }
  if (input.preferences) {
    await db.update(users).set({ preferences: input.preferences }).where(eq(users.id, user.id))
    user = { ...user, preferences: input.preferences }
  }
  await createPersonalWorkspaceForUser(db, user)
  return user
}

export interface AdminUserUpdateInput {
  email?: string | null
  password?: string | null
  isActive?: boolean | null
  isSuperuser?: boolean | null
  preferences?: Record<string, unknown> | null
}

/** `admin_service.update_user`: an administrator cannot demote or deactivate themselves. */
export async function updateAdminUser(
  db: Database,
  user: User,
  update: AdminUserUpdateInput,
  currentUserId: string,
): Promise<User> {
  if (user.id === currentUserId) {
    if (update.isSuperuser === false) throw new HttpError(400, 'Cannot remove your own admin privileges')
    if (update.isActive === false) throw new HttpError(400, 'Cannot deactivate your own account')
  }

  const changes: Partial<User> = {}
  if (update.email != null && update.email !== user.email) {
    const [taken] = await db.select({ id: users.id }).from(users).where(eq(users.email, update.email)).limit(1)
    if (taken) throw new HttpError(400, 'A user with this email already exists')
    changes.email = normalizeEmail(update.email)
  }
  if (update.isActive != null) changes.isActive = update.isActive
  if (update.isSuperuser != null) changes.isSuperuser = update.isSuperuser
  if (update.preferences !== undefined && update.preferences !== null) changes.preferences = update.preferences
  if (update.password != null) changes.hashedPassword = await hashPassword(update.password)

  if (Object.keys(changes).length === 0) return user
  await db.update(users).set(changes).where(eq(users.id, user.id))
  return (await getUserById(db, user.id)) ?? { ...user, ...changes }
}

/** `admin_service.delete_user`: never yourself, never the last active administrator. */
export async function deleteAdminUser(db: Database, user: User, currentUserId: string): Promise<void> {
  if (user.id === currentUserId) throw new HttpError(400, 'Cannot delete your own account')
  if (user.isSuperuser) {
    const [row] = await db
      .select({ n: count() })
      .from(users)
      .where(and(eq(users.isSuperuser, true), eq(users.isActive, true)))
    if ((row?.n ?? 0) <= 1) throw new HttpError(400, 'Cannot delete the last admin user')
  }
  await db.delete(users).where(eq(users.id, user.id))
}
