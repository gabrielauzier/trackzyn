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
