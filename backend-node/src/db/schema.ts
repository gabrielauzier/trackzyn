import {
  bigint,
  boolean,
  index,
  integer,
  json,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// The same six tables `alembic upgrade head` creates (backend/alembic/versions/001_initial_schema.py).
// Column order matters: pg_dump prints it, and the schema-diff job compares the dumps.

export const appSettings = pgTable('app_settings', {
  key: varchar('key', { length: 255 }).primaryKey(),
  value: varchar('value', { length: 2000 }).notNull(),
})

export const users = pgTable(
  'users',
  {
    preferences: json('preferences').$type<Record<string, unknown> | null>(),
    totpSecret: varchar('totp_secret', { length: 32 }),
    is2faEnabled: boolean('is_2fa_enabled').notNull().default(false),
    oidcIssuer: varchar('oidc_issuer', { length: 255 }),
    oidcSubject: varchar('oidc_subject', { length: 255 }),
    id: uuid('id').primaryKey(),
    email: varchar('email', { length: 320 }).notNull(),
    hashedPassword: varchar('hashed_password', { length: 1024 }).notNull(),
    isActive: boolean('is_active').notNull(),
    isSuperuser: boolean('is_superuser').notNull(),
    isVerified: boolean('is_verified').notNull(),
  },
  (t) => [
    unique('uq_users_oidc_identity').on(t.oidcIssuer, t.oidcSubject),
    uniqueIndex('ix_users_email').on(t.email),
    index('ix_users_oidc_issuer').on(t.oidcIssuer),
    index('ix_users_oidc_subject').on(t.oidcSubject),
  ],
)

export const userPasskeys = pgTable(
  'user_passkeys',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    credentialId: varchar('credential_id', { length: 512 }).notNull(),
    publicKey: text('public_key').notNull(),
    signCount: integer('sign_count').notNull().default(0),
    name: varchar('name', { length: 100 }).notNull(),
    transports: json('transports').$type<string[] | null>(),
    aaguid: varchar('aaguid', { length: 64 }),
    deviceType: varchar('device_type', { length: 50 }),
    backedUp: boolean('backed_up'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('ix_user_passkeys_credential_id').on(t.credentialId),
    index('ix_user_passkeys_user_id').on(t.userId),
  ],
)

export const workspaces = pgTable('workspaces', {
  id: uuid('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  isArchived: boolean('is_archived').notNull().default(false),
  managedByUserId: uuid('managed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  locale: varchar('locale', { length: 10 }),
  timezone: varchar('timezone', { length: 64 }),
  icon: varchar('icon', { length: 50 }),
  color: varchar('color', { length: 7 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
})

export const files = pgTable(
  'files',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    filename: varchar('filename', { length: 255 }).notNull(),
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    contentType: varchar('content_type', { length: 127 }).notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [unique('files_storage_key_key').on(t.storageKey), index('ix_files_workspace_id').on(t.workspaceId)],
)

export const workspaceMembers = pgTable(
  'workspace_members',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: varchar('role', { length: 20 }).notNull().default('owner'),
    invitedByUserId: uuid('invited_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull(),
  },
  (t) => [unique('uq_workspace_member').on(t.workspaceId, t.userId)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Workspace = typeof workspaces.$inferSelect
export type WorkspaceMember = typeof workspaceMembers.$inferSelect
export type StoredFileRecord = typeof files.$inferSelect
export type UserPasskey = typeof userPasskeys.$inferSelect
