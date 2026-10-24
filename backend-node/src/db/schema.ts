import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  json,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

// The first six tables match what Alembic revision 001 created, so a database from the old Python
// backend is adopted as migration 0000 (see db/migrate.ts). Tables after them exist only here.

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

export const lists = pgTable(
  'lists',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    /** Index 1..8 of the `--chart-N` palette. */
    color: smallint('color').notNull(),
    position: integer('position').notNull(),
    isArchived: boolean('is_archived').notNull().default(false),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('ix_lists_workspace_id').on(t.workspaceId, t.position)],
)

export const TASK_COLUMNS = ['backlog', 'this_week', 'today', 'done'] as const
export type TaskColumn = (typeof TASK_COLUMNS)[number]

export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id').primaryKey(),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    notes: text('notes').notNull().default(''),
    estimateMinutes: integer('estimate_minutes'),
    column: varchar('column', { length: 16 }).$type<TaskColumn>().notNull(),
    position: integer('position').notNull(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('ix_tasks_list_column_position').on(t.listId, t.column, t.position),
    check('ck_tasks_column', sql`${t.column} IN ('backlog', 'this_week', 'today', 'done')`),
    check('ck_tasks_estimate_minutes', sql`${t.estimateMinutes} BETWEEN 1 AND 1440`),
    check('ck_tasks_done_completed_at', sql`(${t.column} = 'done') = (${t.completedAt} IS NOT NULL)`),
  ],
)

export const subtasks = pgTable(
  'subtasks',
  {
    id: uuid('id').primaryKey(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: varchar('title', { length: 255 }).notNull(),
    done: boolean('done').notNull().default(false),
    position: integer('position').notNull(),
  },
  (t) => [index('ix_subtasks_task_id').on(t.taskId, t.position)],
)

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type Workspace = typeof workspaces.$inferSelect
export type WorkspaceMember = typeof workspaceMembers.$inferSelect
export type StoredFileRecord = typeof files.$inferSelect
export type UserPasskey = typeof userPasskeys.$inferSelect
export type List = typeof lists.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Subtask = typeof subtasks.$inferSelect
