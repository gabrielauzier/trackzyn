export interface User {
  id: string
  email: string
  is_active: boolean
  is_superuser: boolean
  is_verified: boolean
  is_2fa_enabled: boolean
  preferences: UserPreferences
}

export interface UserPreferences {
  language?: string
  date_format?: string
  display_name?: string
  onboarding_completed?: boolean
}

export interface AdminUser {
  id: string
  email: string
  is_active: boolean
  is_superuser: boolean
  is_verified: boolean
  preferences: UserPreferences | null
}

export interface AdminUserList {
  items: AdminUser[]
  total: number
}

export interface Passkey {
  id: string
  name: string
  transports: string[] | null
  aaguid: string | null
  device_type: string | null
  backed_up: boolean | null
  created_at: string
  last_used_at: string | null
}

export interface PasskeyOptionsResponse {
  challenge_id: string
  options: Record<string, unknown>
}

export interface AppSetting {
  key: string
  value: string
}

export interface Workspace {
  id: string
  name: string
  is_archived: boolean
  locale: string | null
  /** The calendar this workspace runs on, or null to follow the
   *  application timezone. */
  timezone: string | null
  icon: string | null
  color: string | null
  created_at: string
  created_by_user_id: string | null
  managed_by_user_id: string | null
  role: WorkspaceRole | null
}

export interface WorkspaceMember {
  id: string
  user_id: string
  email: string
  display_name: string | null
  role: WorkspaceRole
  joined_at: string
}

export type WorkspaceRole = 'owner' | 'editor' | 'viewer' | 'manager'

export interface WorkspaceStats {
  members: number
  files: number
}

export interface StoredFile {
  id: string
  workspace_id: string
  uploaded_by_user_id: string | null
  filename: string
  content_type: string
  size: number
  created_at: string
}

export interface FileSettings {
  allowed_extensions: string[]
  max_file_size_mb: number
}

/** Index into the `--chart-1..8` palette. */
export type ListColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8

export interface TaskList {
  id: string
  workspace_id: string
  name: string
  color: number
  position: number
  is_archived: boolean
  created_by_user_id: string | null
  created_at: string
}

/** A list as the home shows it: the next pending titles and how many are left. */
export interface ListCard extends TaskList {
  pending_count: number
  preview: { id: string; title: string }[]
}

export interface ListsResponse {
  /** Timezone that decides "today" and the greeting for this workspace. */
  timezone: string
  lists: ListCard[]
}

export type TaskColumn = 'backlog' | 'this_week' | 'today' | 'done'

export interface Subtask {
  id: string
  task_id: string
  title: string
  done: boolean
  position: number
}

export interface Task {
  id: string
  list_id: string
  title: string
  notes: string
  estimate_minutes: number | null
  column: TaskColumn
  position: number
  completed_at: string | null
  created_at: string
  subtasks: Subtask[]
}

export interface TaskCardView {
  id: string
  title: string
  estimate_minutes: number | null
  spent_seconds: number
  position: number
  subtasks: { done: number; total: number }
}

export interface BoardColumnView {
  tasks: TaskCardView[]
  estimate_minutes: number
}

/** Today and This week also carry the `done/total` progress bar. */
export interface BoardProgressColumnView extends BoardColumnView {
  done: number
  total: number
}

export interface Board {
  list: { id: string; name: string; color: number }
  timezone: string
  pending: { count: number; estimate_minutes: number }
  columns: {
    backlog: BoardColumnView
    this_week: BoardProgressColumnView
    today: BoardProgressColumnView
    done: { today_count: number; days: { date: string; tasks: TaskCardView[] }[] }
  }
}

/** The open focus session: a task counting or a break (`task_id` null). */
export interface FocusSession {
  id: string
  kind: 'task' | 'break'
  task_id: string | null
  list_id: string
  device_id: string
  started_at: string
  /** End of the estimate or of the break; null for a task without estimate or extended past it. */
  deadline_at: string | null
  planned_seconds: number | null
}

/** What `GET /api/focus` and every focus action answer. */
export interface FocusState {
  /** The server's clock when it answered (FOCUS-03). */
  server_now: string
  session: FocusSession | null
  /** The task in focus, or the first pending task of Today. `spent_seconds` is counted up to `server_now`. */
  task: {
    id: string
    title: string
    estimate_minutes: number | null
    spent_seconds: number
    awaiting_extend: boolean
  } | null
  /** Totals of Today and its pending tasks in board order, for applying actions offline (SYNC-05). */
  today: {
    pending: number
    done: number
    estimate_minutes: number
    tasks: (NonNullable<FocusState['task']> & { position: number })[]
  }
  /** The open session when it has had no signal for more than 120 s (SYNC-11). */
  stale: { session_id: string; last_seen_at: string; seconds: number } | null
}
