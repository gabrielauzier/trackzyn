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

export type AccessTokenScope = 'lists:read' | 'tasks:read' | 'tasks:create' | 'tasks:write' | 'tasks:delete'

export interface AccessToken {
  id: string
  name: string
  workspace_id: string
  workspace_name: string
  scopes: AccessTokenScope[]
  display_hint: string
  created_at: string
  expires_at: string
  last_used_at: string | null
  revoked_at: string | null
  status: 'active' | 'expired' | 'revoked'
}

/** The only response that carries the full token value. */
export interface CreatedAccessToken {
  id: string
  token: string
  expires_at: string
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
  /** Sessions shorter than this many minutes are hidden in the agenda and the Sessions report; null shows all. */
  min_session_minutes: number | null
  /** Sessions of one list and kind this many minutes apart or less are drawn as one block in the agenda; null keeps them apart. */
  merge_gap_minutes: number | null
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
  /** Name of the access token that created the task; null otherwise. */
  created_via: string | null
}

export interface TaskCardView {
  id: string
  title: string
  estimate_minutes: number | null
  spent_seconds: number
  position: number
  subtasks: { done: number; total: number }
  /** Name of the access token that created the task; null otherwise. */
  created_via: string | null
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
    /** Its subtasks done and in all; absent in an answer the server stored before the field existed, read as none. */
    subtasks?: { done: number; total: number }
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

/** The period and list filter of both reports; `list_id` absent means every list. */
export interface ReportQuery {
  from: string
  to: string
  list_id?: string
}

export type DoneVerdict = 'early' | 'on_time' | 'late'

export interface DoneTaskView {
  id: string
  title: string
  list_id: string
  /** Total time of the task, every member and its whole history. */
  spent_seconds: number
  estimate_minutes: number | null
  /** Null for a task without estimate. */
  verdict: DoneVerdict | null
  /** Spent minus estimate in seconds; 0 without estimate. */
  diff_seconds: number
}

/** What `GET /api/reports/overview` answers: the logged-in user's own time in the period. */
export interface Overview {
  timezone: string
  range: { from: string; to: string }
  tiles: { work_days: number; tasks_done: number; task_seconds: number; avg_seconds_per_task: number | null }
  /** One item per day of the period. */
  daily: { date: string; task_seconds: number; break_seconds: number }[]
  /** Every tied value; empty without activity. Hours 0..23, weekdays ISO 1..7, months `YYYY-MM`. */
  productive: { hours: number[]; weekdays: number[]; months: string[] }
  /** Only lists with time in the period, archived ones included. */
  by_list: { list_id: string; name: string; color: number; is_archived: boolean; seconds: number }[]
  break_seconds: number
  done: {
    /** Most recent day first. */
    days: { date: string; tasks: DoneTaskView[] }[]
    /** Two decimals; null when no done task has an estimate. */
    early_or_on_time_pct: number | null
    late_pct: number | null
  }
}

export interface ReportSession {
  id: string
  kind: 'task' | 'break'
  task_title: string | null
  list_name: string
  /** The start of the piece of this day. */
  started_at: string
  /** The end of the piece of this day; null on the last piece of an open session. */
  ended_at: string | null
  /** The length of the piece of this day. */
  seconds: number
}

/** What `GET /api/reports/sessions` answers: each session cut at local midnight, one piece per day of the period, most recent first. */
export interface SessionsReport {
  days: { date: string; sessions: ReportSession[] }[]
}

/** One session as the agenda shows it: whole, never cut at midnight or at the period edges. */
export interface AgendaSession {
  id: string
  kind: 'task' | 'break'
  /** How the session was born: by the focus or recorded on the agenda. */
  origin: 'focus' | 'manual'
  task_id: string | null
  /** Null for a break, shown as `Intervalo`. */
  task_title: string | null
  list_id: string
  list_name: string
  /** Index 1..8 into the `--chart-N` palette. */
  list_color: number
  started_at: string
  /** Null while the session is open. */
  ended_at: string | null
}

/** A session to record: a task session names its task, a break names its list (`started_at`/`ended_at` ISO). */
export type AgendaSessionInput =
  | { kind: 'task'; task_id: string; started_at: string; ended_at: string }
  | { kind: 'break'; list_id: string; started_at: string; ended_at: string }

/** A task a session can go to, with its list. */
export interface AgendaTask {
  id: string
  title: string
  list_id: string
  list_name: string
  /** Index 1..8 into the `--chart-N` palette. */
  list_color: number
  column: 'backlog' | 'this_week' | 'today' | 'done'
}

/** A task the picker of a new session offers, with when it was last updated (PICK-03). */
export interface RecentAgendaTask extends AgendaTask {
  updated_at: string
}

/** A task the agenda creates for a session: concluded, from the agenda (PICK-15). */
export interface AgendaTaskInput {
  list_id: string
  title: string
  estimate_minutes?: number | null
  notes?: string
}

/** What an edit may change; absent fields keep their value. */
export interface AgendaSessionChanges {
  started_at?: string
  ended_at?: string
  task_id?: string
  list_id?: string
}
