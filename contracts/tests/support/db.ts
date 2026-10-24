import pg from 'pg'
import { databaseUrl } from './config'

let pool: pg.Pool | undefined

export function db(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: databaseUrl(), max: 4 })
  return pool
}

export async function closeDb(): Promise<void> {
  await pool?.end()
  pool = undefined
}

export async function dropAndRecreateSchema(): Promise<void> {
  const client = new pg.Client({ connectionString: databaseUrl() })
  await client.connect()
  try {
    await client.query('DROP SCHEMA IF EXISTS public CASCADE')
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE')
    await client.query('CREATE SCHEMA public')
  } finally {
    await client.end()
  }
}

/** Empties every application table, keeping the migration bookkeeping. */
export async function resetData(): Promise<void> {
  await db().query(
    'TRUNCATE TABLE files, workspace_members, workspaces, user_passkeys, users, app_settings RESTART IDENTITY CASCADE',
  )
}

export async function setAppSetting(key: string, value: string | null): Promise<void> {
  if (value === null) {
    await db().query('DELETE FROM app_settings WHERE key = $1', [key])
    return
  }
  await db().query(
    'INSERT INTO app_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
    [key, value],
  )
}

export async function hashOf(email: string): Promise<string> {
  const { rows } = await db().query('SELECT hashed_password FROM users WHERE email = $1', [email])
  return rows[0].hashed_password
}

export interface SeedUser {
  email: string
  password: string
  hash?: string
  superuser?: boolean
  active?: boolean
}

/** Inserts a user row directly, the way a legacy install or another stack would have. */
export async function seedUser(user: SeedUser): Promise<string> {
  const { randomUUID } = await import('node:crypto')
  const bcrypt = (await import('bcryptjs')).default
  const id = randomUUID()
  const hash = user.hash ?? bcrypt.hashSync(user.password, 10)
  await db().query(
    `INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, is_2fa_enabled, preferences)
     VALUES ($1, $2, $3, $4, $5, true, false, $6)`,
    [id, user.email, hash, user.active ?? true, user.superuser ?? false, JSON.stringify({ language: 'en' })],
  )
  return id
}

export interface SeedPasskey {
  userId: string
  credentialId: string
  publicKey: string
  name?: string
  signCount?: number
  backedUp?: boolean | null
}

/** Inserts a passkey row the way a registration on either stack would have. */
export async function seedPasskey(passkey: SeedPasskey): Promise<string> {
  const { randomUUID } = await import('node:crypto')
  const id = randomUUID()
  await db().query(
    `INSERT INTO user_passkeys (id, user_id, credential_id, public_key, sign_count, name, backed_up, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      id,
      passkey.userId,
      passkey.credentialId,
      passkey.publicKey,
      passkey.signCount ?? 0,
      passkey.name ?? 'Seeded passkey',
      passkey.backedUp ?? null,
    ],
  )
  return id
}

export async function passkeyRows(userId: string) {
  const { rows } = await db().query('SELECT * FROM user_passkeys WHERE user_id = $1 ORDER BY created_at', [userId])
  return rows
}

export async function userRow(email: string) {
  const { rows } = await db().query('SELECT * FROM users WHERE lower(email) = lower($1)', [email])
  return rows[0]
}

export async function linkOidcIdentity(email: string, issuer: string, subject: string): Promise<void> {
  await db().query('UPDATE users SET oidc_issuer = $2, oidc_subject = $3 WHERE lower(email) = lower($1)', [
    email,
    issuer,
    subject,
  ])
}

export async function setSuperuser(email: string, value: boolean): Promise<void> {
  await db().query('UPDATE users SET is_superuser = $2 WHERE lower(email) = lower($1)', [email, value])
}

export async function membershipRows(workspaceId: string) {
  const { rows } = await db().query('SELECT * FROM workspace_members WHERE workspace_id = $1', [workspaceId])
  return rows
}

export async function setWorkspaceManager(workspaceId: string, userId: string | null): Promise<void> {
  await db().query('UPDATE workspaces SET managed_by_user_id = $2 WHERE id = $1', [workspaceId, userId])
}

export async function setMemberRole(userId: string, role: string): Promise<void> {
  await db().query('UPDATE workspace_members SET role = $2 WHERE user_id = $1', [userId, role])
}

export async function memberRoleOf(userId: string): Promise<string[]> {
  const { rows } = await db().query('SELECT role FROM workspace_members WHERE user_id = $1', [userId])
  return rows.map((row) => row.role)
}
