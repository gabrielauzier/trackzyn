import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  json,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
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

export const workspaces = pgTable(
  'workspaces',
  {
    id: uuid('id').primaryKey(),
    name: varchar('name', { length: 100 }).notNull(),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    isArchived: boolean('is_archived').notNull().default(false),
    managedByUserId: uuid('managed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    locale: varchar('locale', { length: 10 }),
    timezone: varchar('timezone', { length: 64 }),
    icon: varchar('icon', { length: 50 }),
    color: varchar('color', { length: 7 }),
    /** Sessions shorter than this many minutes (1 to 60) are hidden in the agenda and the Sessions report; null shows all (#22). */
    minSessionMinutes: smallint('min_session_minutes'),
    /** Sessions of one list and kind this many minutes apart or less (1 to 60) are drawn as one block in the agenda; null keeps them apart (#23). */
    mergeGapMinutes: smallint('merge_gap_minutes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    check('ck_workspaces_min_session_minutes', sql`${t.minSessionMinutes} BETWEEN 1 AND 60`),
    check('ck_workspaces_merge_gap_minutes', sql`${t.mergeGapMinutes} BETWEEN 1 AND 60`),
  ],
)

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

export const TOKEN_SCOPES = ['lists:read', 'tasks:read', 'tasks:create', 'tasks:write', 'tasks:delete'] as const
export type TokenScope = (typeof TOKEN_SCOPES)[number]

/** Long-lived API tokens (`tkz_`), each bound to one workspace; denied by default on every route (AD-007). */
export const personalAccessTokens = pgTable(
  'personal_access_tokens',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 100 }).notNull(),
    /** SHA-256 hex of the token; the value itself is never stored. */
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    lastFour: varchar('last_four', { length: 4 }).notNull(),
    scopes: json('scopes').$type<TokenScope[]>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('ix_personal_access_tokens_hash').on(t.tokenHash),
    index('ix_personal_access_tokens_user').on(t.userId),
  ],
)

export const TASK_COLUMNS = ['backlog', 'this_week', 'today', 'done'] as const
export type TaskColumn = (typeof TASK_COLUMNS)[number]

/** Where a task came from when no token made it (PICK-17). */
export type TaskOrigin = 'agenda'

export const SERIES_FREQS = ['daily', 'weekly', 'monthly'] as const
export type SeriesFreq = (typeof SERIES_FREQS)[number]

/**
 * A recurrence rule of a scheduled task (Recorrência, D15). At most one occurrence of a series is pending at a
 * time (D13): the rule starts from the open occurrence's `scheduled_on`, and its time is that task's
 * `scheduled_time`, so the series keeps neither a start day nor a time.
 */
export const taskSeries = pgTable(
  'task_series',
  {
    id: uuid('id').primaryKey(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    freq: varchar('freq', { length: 8 }).$type<SeriesFreq>().notNull(),
    /** Every N days, weeks or months, 1 to 99. */
    interval: smallint('interval').notNull().default(1),
    /** Only for `weekly`: 1 (Monday) to 7 (Sunday), at least one. Weekdays is `weekly` with 1 to 5. */
    weekdays: smallint('weekdays').array(),
    /** Only for `monthly`: 1 to 31; a shorter month falls on its last day. */
    monthDay: smallint('month_day'),
    /** The last possible day (`YYYY-MM-DD`); never together with `count`. */
    until: date('until', { mode: 'string' }),
    /** How many occurrences the series has in all, 1 to 999; never together with `until`. */
    count: smallint('count'),
    /** Occurrences created so far, the first one included, for `count`. */
    createdCount: smallint('created_count').notNull().default(1),
    /** When the series ended: stopped, or `until` or `count` reached. */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    index('ix_task_series_workspace').on(t.workspaceId),
    check('ck_task_series_freq', sql`${t.freq} IN ('daily', 'weekly', 'monthly')`),
    check('ck_task_series_interval', sql`${t.interval} BETWEEN 1 AND 99`),
    check(
      'ck_task_series_weekdays',
      sql`${t.weekdays} IS NULL OR (cardinality(${t.weekdays}) >= 1 AND ${t.weekdays} <@ ARRAY[1,2,3,4,5,6,7]::smallint[])`,
    ),
    check('ck_task_series_month_day', sql`${t.monthDay} BETWEEN 1 AND 31`),
    check('ck_task_series_count', sql`${t.count} BETWEEN 1 AND 999`),
    check('ck_task_series_until_or_count', sql`${t.until} IS NULL OR ${t.count} IS NULL`),
    check('ck_task_series_weekly_weekdays', sql`(${t.freq} = 'weekly') = (${t.weekdays} IS NOT NULL)`),
    check('ck_task_series_monthly_month_day', sql`(${t.freq} = 'monthly') = (${t.monthDay} IS NOT NULL)`),
  ],
)

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
    /** Who moved the task to done (AD-006); the reports count only the reader's completions. */
    completedByUserId: uuid('completed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    /** The token that created the task; purging the token keeps the task. */
    createdViaTokenId: uuid('created_via_token_id').references(() => personalAccessTokens.id, { onDelete: 'set null' }),
    /** The last change to the task, its subtasks included (PICK-01); the agenda lists the tasks updated last. */
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Where the task came from when no token made it: `agenda` reads as `via Agenda` (PICK-17). */
    createdFrom: varchar('created_from', { length: 16 }).$type<TaskOrigin>(),
    /** The day the task is scheduled for, in the workspace's timezone (`YYYY-MM-DD`). */
    scheduledOn: date('scheduled_on', { mode: 'string' }),
    /** The start time on `scheduledOn`, in the workspace's timezone, in steps of 15 minutes (`HH:MM:SS`). */
    scheduledTime: time('scheduled_time'),
    /** When this schedule brought the task to Today (D21); cleared whenever the day or the time change. */
    scheduleAppliedAt: timestamp('schedule_applied_at', { withTimezone: true }),
    /** The series this task is an occurrence of (the open one or a completed one); deleting the series keeps the task. */
    seriesId: uuid('series_id').references(() => taskSeries.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('ix_tasks_list_column_position').on(t.listId, t.column, t.position),
    // Partial, so the SET NULL of a purge does not scan tasks.
    index('ix_tasks_created_via_token').on(t.createdViaTokenId).where(sql`${t.createdViaTokenId} IS NOT NULL`),
    check('ck_tasks_completed_by_done', sql`${t.column} = 'done' OR ${t.completedByUserId} IS NULL`),
    check('ck_tasks_column', sql`${t.column} IN ('backlog', 'this_week', 'today', 'done')`),
    check('ck_tasks_estimate_minutes', sql`${t.estimateMinutes} BETWEEN 1 AND 1440`),
    check('ck_tasks_done_completed_at', sql`(${t.column} = 'done') = (${t.completedAt} IS NOT NULL)`),
    check('ck_tasks_created_from', sql`${t.createdFrom} IN ('agenda')`),
    check('ck_tasks_schedule_time_needs_day', sql`${t.scheduledTime} IS NULL OR ${t.scheduledOn} IS NOT NULL`),
    check(
      'ck_tasks_schedule_time_step',
      sql`${t.scheduledTime} IS NULL OR (extract(minute FROM ${t.scheduledTime})::int % 15 = 0 AND extract(second FROM ${t.scheduledTime}) = 0)`,
    ),
    // Only the candidates of the move to Today: the frequent reads (the focus polls every 15 s) touch a small index.
    index('ix_tasks_schedule_due')
      .on(t.listId, t.scheduledOn)
      .where(sql`${t.scheduledOn} IS NOT NULL AND ${t.scheduleAppliedAt} IS NULL AND ${t.column} IN ('backlog', 'this_week')`),
    index('ix_tasks_scheduled_on').on(t.scheduledOn).where(sql`${t.scheduledOn} IS NOT NULL AND ${t.column} <> 'done'`),
    index('ix_tasks_series').on(t.seriesId).where(sql`${t.seriesId} IS NOT NULL`),
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

export const FOCUS_SESSION_KINDS = ['task', 'break'] as const
export type FocusSessionKind = (typeof FOCUS_SESSION_KINDS)[number]

export const FOCUS_END_REASONS = [
  'pause',
  'skip',
  'complete',
  'estimate',
  'break',
  'break_end',
  'break_stop',
  'switch',
  'task_left',
  'leave',
  'crash_cut',
  'manual',
] as const
export type FocusEndReason = (typeof FOCUS_END_REASONS)[number]

/** How a session came in: the focus timer, or recorded on the agenda (AD-008). */
export const FOCUS_SESSION_ORIGINS = ['focus', 'manual'] as const
export type FocusSessionOrigin = (typeof FOCUS_SESSION_ORIGINS)[number]

/** One stretch of focus on a task, or one break. A user has at most one open session (SYNC-01). */
export const focusSessions = pgTable(
  'focus_sessions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    listId: uuid('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    /** Null for a break. */
    taskId: uuid('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
    kind: varchar('kind', { length: 8 }).$type<FocusSessionKind>().notNull(),
    deviceId: varchar('device_id', { length: 64 }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    /** When the estimate or the break runs out; settlement closes the session there (AD-001). */
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    /** Break length; only for a break. */
    plannedSeconds: integer('planned_seconds'),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
    endReason: varchar('end_reason', { length: 16 }).$type<FocusEndReason>(),
    origin: varchar('origin', { length: 8 }).$type<FocusSessionOrigin>().notNull().default('focus'),
  },
  (t) => [
    uniqueIndex('ix_focus_sessions_open_user').on(t.userId).where(sql`${t.endedAt} IS NULL`),
    index('ix_focus_sessions_user_started').on(t.userId, t.startedAt),
    index('ix_focus_sessions_task_id').on(t.taskId),
  ],
)

/** Focus actions already applied, so a resent `action_id` gets the stored answer back (AD-002). */
export const focusActions = pgTable(
  'focus_actions',
  {
    actionId: uuid('action_id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appliedAt: timestamp('applied_at', { withTimezone: true }).notNull(),
    response: json('response').notNull(),
  },
  (t) => [index('ix_focus_actions_user_applied').on(t.userId, t.appliedAt)],
)

/** No foreign key to tasks: a key whose task is gone must answer 410, not vanish (IDEM-04). */
export const taskIdempotencyKeys = pgTable(
  'task_idempotency_keys',
  {
    tokenId: uuid('token_id')
      .notNull()
      .references(() => personalAccessTokens.id, { onDelete: 'cascade' }),
    key: varchar('key', { length: 255 }).notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    taskId: uuid('task_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.tokenId, t.key] })],
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
export type TaskSeries = typeof taskSeries.$inferSelect
export type FocusSession = typeof focusSessions.$inferSelect
export type FocusAction = typeof focusActions.$inferSelect
export type AccessToken = typeof personalAccessTokens.$inferSelect
