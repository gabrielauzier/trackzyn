import axios from 'axios'
import { getDesktopApi, isDesktop } from '@/lib/platform'
import { writesBlocked } from '@/lib/write-lock'
import type { NumberFormat, DateFormat } from '@/lib/format'
import type { DesktopTitlebar } from '@/lib/desktop-titlebar'
import type {
  AccessToken,
  AgendaSession,
  AgendaSessionChanges,
  AgendaTask,
  AgendaTaskInput,
  RecentAgendaTask,
  AgendaSessionInput,
  AccessTokenScope,
  CreatedAccessToken,
  User,
  AdminUser,
  AdminUserList,
  Passkey,
  PasskeyOptionsResponse,
  AppSetting,
  Board,
  FileSettings,
  FocusState,
  ListsResponse,
  PlanBlockInput,
  PlanCandidate,
  PlannedBlock,
  PlanRead,
  Overview,
  RecurrenceRule,
  ReportQuery,
  ScheduledResponse,
  SeriesScope,
  SessionsReport,
  Subtask,
  Task,
  TaskColumn,
  TaskList,
  StoredFile,
  Workday,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceStats,
} from '@/types'
import type { QueuedAction } from '@/lib/focus/queue'

const api = axios.create({
  baseURL: '/api',
})

/**
 * The API's absolute address, for what is used outside this page (`curl`, an MCP client). On the
 * desktop the page's origin is `app://` and `/api` is proxied to the saved server, so that server
 * is the address; on the web `/api` is on the page's own origin.
 */
export async function externalApiUrl(): Promise<string> {
  const server = isDesktop() ? await getDesktopApi().getServerUrl() : null
  return `${(server ?? window.location.origin).replace(/\/+$/, '')}/api`
}

// Storage key for the currently-selected workspace ID. Lives in
// localStorage so reloads + new tabs stay on the same workspace until
// the user picks another one.
export const WORKSPACE_STORAGE_KEY = 'workspace_id'

/** The auth token and active workspace headers every request carries, also outside axios. */
export function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = localStorage.getItem('token')
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }
  const workspaceId = localStorage.getItem(WORKSPACE_STORAGE_KEY)
  if (workspaceId) {
    headers['X-Workspace-Id'] = workspaceId
  }
  return headers
}

// Add auth token + active workspace header to requests
api.interceptors.request.use((config) => {
  // Desktop export in progress: nothing may change the data under it.
  if (writesBlocked() && !['get', 'head', 'options'].includes((config.method ?? 'get').toLowerCase())) {
    return Promise.reject(new Error('Writes are blocked while the data is exported'))
  }
  for (const [name, value] of Object.entries(authHeaders())) {
    config.headers[name] = value
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Workspaces
export const workspaces = {
  list: async (): Promise<Workspace[]> => {
    const { data } = await api.get('/workspaces')
    return data
  },
  current: async (): Promise<Workspace> => {
    const { data } = await api.get('/workspaces/current')
    return data
  },
  create: async (payload: {
    name: string
    locale?: string
    icon?: string
    color?: string
    self_membership?: boolean
  }): Promise<Workspace> => {
    const { data } = await api.post('/workspaces', payload)
    return data
  },
  update: async (
    id: string,
    payload: Partial<Pick<Workspace, 'name' | 'icon' | 'color' | 'locale'>> & {
      timezone?: string | null
      /** 1 to 60; null shows every session (#22). */
      min_session_minutes?: number | null
      /** 1 to 60; null keeps near sessions apart in the agenda (#23). */
      merge_gap_minutes?: number | null
    },
  ): Promise<Workspace> => {
    const { data } = await api.patch(`/workspaces/${id}`, payload)
    return data
  },
  listMembers: async (id: string): Promise<WorkspaceMember[]> => {
    const { data } = await api.get(`/workspaces/${id}/members`)
    return data
  },
  invite: async (id: string, payload: { email: string; role?: WorkspaceRole; password?: string }): Promise<WorkspaceMember> => {
    const { data } = await api.post(`/workspaces/${id}/members`, payload)
    return data
  },
  changeRole: async (id: string, memberUserId: string, role: WorkspaceRole): Promise<WorkspaceMember> => {
    const { data } = await api.patch(`/workspaces/${id}/members/${memberUserId}`, { role })
    return data
  },
  removeMember: async (id: string, memberUserId: string): Promise<void> => {
    await api.delete(`/workspaces/${id}/members/${memberUserId}`)
  },
  stats: async (id: string): Promise<WorkspaceStats> => {
    const { data } = await api.get(`/workspaces/${id}/stats`)
    return data
  },
  archive: async (id: string): Promise<Workspace> => {
    const { data } = await api.post(`/workspaces/${id}/archive`)
    return data
  },
}

// Access tokens
export const accessTokens = {
  list: async (): Promise<AccessToken[]> => {
    const { data } = await api.get('/tokens')
    return data
  },
  create: async (payload: {
    name: string
    workspace_id: string
    scopes: AccessTokenScope[]
    expires_in_days: 30 | 90 | 365
  }): Promise<CreatedAccessToken> => {
    const { data } = await api.post('/tokens', payload)
    return data
  },
  revoke: async (id: string): Promise<void> => {
    await api.delete(`/tokens/${id}`)
  },
}

// Setup
export const setup = {
  status: async (): Promise<{ has_users: boolean }> => {
    const { data } = await api.get('/setup/status')
    return data
  },
  createAdmin: async (email: string, password: string, name = '', language = 'en'): Promise<{ access_token: string }> => {
    const { data } = await api.post('/setup/create-admin', { email, password, name, language })
    return data
  },
}

// Auth
export const auth = {
  login: async (email: string, password: string) => {
    const formData = new URLSearchParams()
    formData.append('username', email)
    formData.append('password', password)
    const { data } = await api.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    })
    return data
  },
  register: async (email: string, password: string, preferences?: Record<string, string>) => {
    const { data } = await api.post('/auth/register', { email, password, preferences })
    return data
  },
  me: async (): Promise<User> => {
    const { data } = await api.get('/users/me')
    return data
  },
  updateMe: async (updates: Partial<User>): Promise<User> => {
    const { data } = await api.patch('/users/me', updates)
    return data
  },
  changePassword: async (password: string): Promise<User> => {
    const { data } = await api.patch('/users/me', { password })
    return data
  },
  setup2fa: async (): Promise<{ secret: string; otpauth_uri: string }> => {
    const { data } = await api.post('/auth/2fa/setup')
    return data
  },
  enable2fa: async (code: string): Promise<void> => {
    await api.post('/auth/2fa/enable', { code })
  },
  disable2fa: async (password: string, code: string): Promise<void> => {
    await api.post('/auth/2fa/disable', { password, code })
  },
  verify2fa: async (tempToken: string, code: string): Promise<{ access_token: string; token_type: string }> => {
    const { data } = await api.post('/auth/2fa/verify', { temp_token: tempToken, code })
    return data
  },
  listPasskeys: async (): Promise<Passkey[]> => {
    const { data } = await api.get('/auth/passkeys')
    return data
  },
  registerPasskeyOptions: async (name: string): Promise<PasskeyOptionsResponse> => {
    const { data } = await api.post('/auth/passkeys/register/options', { name })
    return data
  },
  verifyPasskeyRegistration: async (
    challengeId: string,
    name: string,
    credential: Record<string, unknown>,
  ): Promise<Passkey> => {
    const { data } = await api.post('/auth/passkeys/register/verify', {
      challenge_id: challengeId,
      name,
      credential,
    })
    return data
  },
  deletePasskey: async (id: string): Promise<void> => {
    await api.delete(`/auth/passkeys/${id}`)
  },
  passkeyAuthenticationOptions: async (email?: string): Promise<PasskeyOptionsResponse> => {
    const { data } = await api.post('/auth/passkeys/authenticate/options', { email })
    return data
  },
  verifyPasskeyAuthentication: async (
    challengeId: string,
    credential: Record<string, unknown>,
  ): Promise<{ access_token: string; token_type: string }> => {
    const { data } = await api.post('/auth/passkeys/authenticate/verify', {
      challenge_id: challengeId,
      credential,
    })
    return data
  },
  passkeySecondFactorOptions: async (tempToken: string): Promise<PasskeyOptionsResponse> => {
    const { data } = await api.post('/auth/passkeys/2fa/options', { temp_token: tempToken })
    return data
  },
  verifyPasskeySecondFactor: async (
    tempToken: string,
    challengeId: string,
    credential: Record<string, unknown>,
  ): Promise<{ access_token: string; token_type: string }> => {
    const { data } = await api.post('/auth/passkeys/2fa/verify', {
      temp_token: tempToken,
      challenge_id: challengeId,
      credential,
    })
    return data
  },
  oidcConfig: async (): Promise<{ enabled: boolean; provider_name: string; local_auth_enabled: boolean }> => {
    // The login card blocks on this call while it decides which sign-in
    // methods to offer, so a hung request must fail fast and let the caller
    // fall back instead of leaving the page stuck on its loading state.
    const { data } = await api.get('/auth/oidc/config', { timeout: 5000 })
    return data
  },
}

// User lookup: exact-match resolution of an existing user by email.
// Returns null on miss (404).
export interface UserLookupResult {
  id: string
  email: string
}

export const users = {
  lookupByEmail: async (email: string): Promise<UserLookupResult | null> => {
    try {
      const { data } = await api.get('/users/lookup', { params: { email } })
      return data
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 404) return null
      throw err
    }
  },
  directory: async (): Promise<UserLookupResult[]> => {
    const { data } = await api.get('/users/directory')
    return data
  },
}

// Files: workspace-scoped uploads on the configured storage provider
export const files = {
  settings: async (): Promise<FileSettings> => {
    const { data } = await api.get('/settings/files')
    return data
  },
  list: async (): Promise<StoredFile[]> => {
    const { data } = await api.get('/files')
    return data
  },
  upload: async (file: File, onProgress?: (percent: number) => void): Promise<StoredFile> => {
    const form = new FormData()
    form.append('file', file)
    const { data } = await api.post('/files', form, {
      onUploadProgress: (event) => {
        if (onProgress && event.total) onProgress(Math.round((event.loaded / event.total) * 100))
      },
    })
    return data
  },
  /** Fetch the bytes through the authenticated client and open/save them. */
  download: async (file: StoredFile): Promise<void> => {
    const { data } = await api.get(`/files/${file.id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([data], { type: file.content_type }))
    const a = document.createElement('a')
    a.href = url
    a.download = file.filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  },
  rename: async (id: string, filename: string): Promise<StoredFile> => {
    const { data } = await api.patch(`/files/${id}`, { filename })
    return data
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/files/${id}`)
  },
}

// Lists: the home cards, the board and their tasks
export const lists = {
  list: async (params: { archived?: boolean } = {}): Promise<ListsResponse> => {
    const { data } = await api.get('/lists', { params: { archived: params.archived ?? false } })
    return data
  },
  get: async (id: string): Promise<TaskList> => {
    const { data } = await api.get(`/lists/${id}`)
    return data
  },
  create: async (payload: { name: string; color: number }): Promise<TaskList> => {
    const { data } = await api.post('/lists', payload)
    return data
  },
  update: async (
    id: string,
    payload: { name?: string; color?: number; is_archived?: boolean },
  ): Promise<TaskList> => {
    const { data } = await api.patch(`/lists/${id}`, payload)
    return data
  },
  /** Put the list right before `beforeListId`, or at the end when null. */
  move: async (id: string, beforeListId: string | null): Promise<void> => {
    await api.post(`/lists/${id}/move`, { before_list_id: beforeListId })
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/lists/${id}`)
  },
  board: async (id: string): Promise<Board> => {
    const { data } = await api.get(`/lists/${id}/board`)
    return data
  },
}

export const tasks = {
  create: async (payload: {
    list_id: string
    title: string
    estimate_minutes: number | null
    column: TaskColumn
    scheduled_on?: string | null
    scheduled_time?: string | null
    notes?: string
  }): Promise<Task> => {
    const { data } = await api.post('/tasks', payload)
    return data
  },
  get: async (id: string): Promise<Task> => {
    const { data } = await api.get(`/tasks/${id}`)
    return data
  },
  update: async (
    id: string,
    payload: {
      title?: string
      estimate_minutes?: number | null
      notes?: string
      /** A field left out keeps its value; null clears it (clearing the day clears the time). */
      scheduled_on?: string | null
      scheduled_time?: string | null
      /** Null stops the repetition; a rule always counts for the series from there on. */
      recurrence?: RecurrenceRule | null
      /** Only for an occurrence of a series (D16); the API takes `occurrence` when left out. */
      scope?: SeriesScope
    },
  ): Promise<Task> => {
    const { data } = await api.patch(`/tasks/${id}`, payload)
    return data
  },
  /** A copy of the task, with its notes and subtasks, at the end of its column. */
  duplicate: async (id: string): Promise<Task> => {
    const { data } = await api.post(`/tasks/${id}/duplicate`)
    return data
  },
  /** Moves the task to another list, at the end of the same column. */
  moveToList: async (id: string, listId: string): Promise<Task> => {
    const { data } = await api.post(`/tasks/${id}/move-to-list`, { list_id: listId })
    return data
  },
  /** Put the task in `column`, right before `beforeTaskId`, or at the end when null. */
  move: async (id: string, payload: { column: TaskColumn; before_task_id: string | null }): Promise<Task> => {
    const { data } = await api.post(`/tasks/${id}/move`, payload)
    return data
  },
  /** Deletes the task; for an occurrence of a series, `series` also ends the series (US-12). */
  remove: async (id: string, scope?: SeriesScope): Promise<void> => {
    await api.delete(`/tasks/${id}`, scope === undefined ? {} : { params: { scope } })
  },
  /** Moves an occurrence of a series to the next day of its rule, keeping the time spent (D18). */
  skip: async (id: string): Promise<Task> => {
    const { data } = await api.post(`/tasks/${id}/skip`)
    return data
  },
}

// Agenda: the scheduled tasks of the whole workspace (`from`/`to` are YYYY-MM-DD, at most 42 days)
export const agenda = {
  scheduled: async (from: string, to: string): Promise<ScheduledResponse> => {
    const { data } = await api.get('/agenda/scheduled', { params: { from, to } })
    return data
  },
}

// Plans: the logged-in user's day plans in the current workspace (`day`, `from` and `to` are YYYY-MM-DD)
export const plans = {
  get: async (day: string): Promise<PlanRead> => {
    const { data } = await api.get(`/plans/${day}`)
    return data
  },
  /** Replaces the whole plan of the day; answers 409 `plan_changed` when `base_version` is not the saved one (PLAN-35). */
  save: async (day: string, body: { base_version: number; blocks: PlanBlockInput[] }): Promise<PlanRead> => {
    const { data } = await api.put(`/plans/${day}`, body)
    return data
  },
  candidates: async (day: string): Promise<{ tasks: PlanCandidate[] }> => {
    const { data } = await api.get(`/plans/${day}/candidates`)
    return data
  },
  /** The saved blocks of a period, at most 42 days (PLAN-24). */
  planned: async (from: string, to: string): Promise<{ blocks: PlannedBlock[] }> => {
    const { data } = await api.get('/plans', { params: { from, to } })
    return data
  },
  /** Keeps the workday in the user's preferences; answers 422 when the end is not after the start (PLAN-22, PLAN-23). */
  setWorkday: async (workday: Workday): Promise<Workday> => {
    const { data } = await api.put('/users/me/workday', workday)
    return data
  },
}

// Focus: every answer, errors included, carries the server's clock in `server_now`
export const focus = {
  /** Without `listId`, the state of the list of the open session, if any. */
  get: async (listId?: string): Promise<FocusState> => {
    const { data } = await api.get('/focus', { params: listId === undefined ? {} : { list_id: listId } })
    return data
  },
  /** Sends a queued action to `POST /api/focus/<type>`; only a break names its list. */
  send: async ({ action_id, action }: QueuedAction): Promise<FocusState> => {
    const { type, list_id, ...payload } = action
    const { data } = await api.post(`/focus/${type}`, { action_id, ...payload, ...(type === 'break' ? { list_id } : {}) })
    return data
  },
  /** The signal of an open app (SYNC-10); answers 409 when this device has no open session. */
  heartbeat: async (deviceId: string): Promise<FocusState> => {
    const { data } = await api.post('/focus/heartbeat', { device_id: deviceId })
    return data
  },
}

// Reports: the logged-in user's own time in a period (`from`/`to` are YYYY-MM-DD, both required)
export const reports = {
  overview: async (query: ReportQuery): Promise<Overview> => {
    const { data } = await api.get('/reports/overview', { params: query })
    return data
  },
  sessions: async (query: ReportQuery): Promise<SessionsReport> => {
    const { data } = await api.get('/reports/sessions', { params: query })
    return data
  },
}

// Sessions: the logged-in user's own agenda (`from`/`to` are YYYY-MM-DD, at most 42 days)
export const sessions = {
  list: async (query: ReportQuery): Promise<{ sessions: AgendaSession[] }> => {
    const { data } = await api.get('/sessions', { params: query })
    return data
  },
  create: async (payload: AgendaSessionInput): Promise<AgendaSession> => {
    const { data } = await api.post('/sessions', payload)
    return data
  },
  update: async (id: string, payload: AgendaSessionChanges): Promise<AgendaSession> => {
    const { data } = await api.patch(`/sessions/${id}`, payload)
    return data
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/sessions/${id}`)
  },
  /** The tasks a session can go to: every column of the active lists, Done of any date included. */
  tasks: async (): Promise<{ tasks: AgendaTask[] }> => {
    const { data } = await api.get('/sessions/tasks')
    return data
  },
  /** The 10 tasks updated last, or up to 50 whose title contains `q` (PICK-03, PICK-04). */
  searchTasks: async (q: string): Promise<{ tasks: RecentAgendaTask[] }> => {
    const { data } = await api.get('/sessions/tasks/search', { params: q.trim() ? { q } : {} })
    return data
  },
  /** Creates the task of a session, concluded, from the agenda (PICK-15). */
  createTask: async (payload: AgendaTaskInput): Promise<Task> => {
    const { data } = await api.post('/sessions/tasks', payload)
    return data
  },
}

export const subtasks = {
  create: async (taskId: string, title: string): Promise<Subtask> => {
    const { data } = await api.post(`/tasks/${taskId}/subtasks`, { title })
    return data
  },
  update: async (id: string, payload: { title?: string; done?: boolean }): Promise<Subtask> => {
    const { data } = await api.patch(`/subtasks/${id}`, payload)
    return data
  },
  /** Put the subtask right before `beforeSubtaskId`, or at the end when null. */
  move: async (id: string, beforeSubtaskId: string | null): Promise<Subtask> => {
    const { data } = await api.post(`/subtasks/${id}/move`, { before_subtask_id: beforeSubtaskId })
    return data
  },
  remove: async (id: string): Promise<void> => {
    await api.delete(`/subtasks/${id}`)
  },
}

// Admin
export interface TimezoneSetting {
  /** The timezone in use, after fallbacks. */
  timezone: string
  /** What an administrator saved, valid or not; null when nothing is saved. */
  saved: string | null
  /** Where the application lands without a saved value. */
  fallback: string
  available: string[]
}

export const timezones = {
  list: async (): Promise<{ default: string; available: string[] }> => {
    const { data } = await api.get('/timezones')
    return data
  },
}

export const admin = {
  listUsers: async (params?: { search?: string; page?: number; limit?: number }): Promise<AdminUserList> => {
    const { data } = await api.get('/admin/users', { params })
    return data
  },
  getUser: async (id: string): Promise<AdminUser> => {
    const { data } = await api.get(`/admin/users/${id}`)
    return data
  },
  createUser: async (user: { email: string; password: string; is_superuser?: boolean; preferences?: Record<string, unknown> }): Promise<AdminUser> => {
    const { data } = await api.post('/admin/users', user)
    return data
  },
  updateUser: async (id: string, user: Partial<{ email: string; password: string; is_active: boolean; is_superuser: boolean; preferences: Record<string, unknown> }>): Promise<AdminUser> => {
    const { data } = await api.patch(`/admin/users/${id}`, user)
    return data
  },
  deleteUser: async (id: string): Promise<void> => {
    await api.delete(`/admin/users/${id}`)
  },
  getSetting: async (key: string): Promise<AppSetting> => {
    const { data } = await api.get(`/admin/settings/${key}`)
    return data
  },
  updateSetting: async (key: string, value: string): Promise<AppSetting> => {
    const { data } = await api.patch(`/admin/settings/${key}`, { value })
    return data
  },
  deleteSetting: async (key: string): Promise<void> => {
    await api.delete(`/admin/settings/${key}`)
  },
  timezone: async (): Promise<TimezoneSetting> => {
    const { data } = await api.get('/admin/timezone')
    return data
  },
  registrationStatus: async (): Promise<{ enabled: boolean }> => {
    const { data } = await api.get('/admin/registration-status')
    return data
  },
  numberFormat: async (): Promise<{ format: NumberFormat }> => {
    const { data } = await api.get('/admin/number-format')
    return data
  },
  dateFormat: async (): Promise<{ format: DateFormat }> => {
    const { data } = await api.get('/admin/date-format')
    return data
  },
  defaultColors: async (): Promise<{ light: string | null; dark: string | null }> => {
    const { data } = await api.get('/admin/default-colors')
    return data
  },
  desktopTitlebar: async (): Promise<{ style: DesktopTitlebar }> => {
    const { data } = await api.get('/admin/desktop-titlebar')
    return data
  },
}

// App-level info: name, feature flags and the release-check repository
export interface AppInfo {
  app_name: string
  features: Record<string, boolean>
  /** "owner/repo" whose GitHub releases drive the update banner; null disables it. */
  update_check_repo: string | null
}

export const info = {
  get: async (): Promise<AppInfo> => {
    const { data } = await api.get('/info')
    return data
  },
}

export default api
