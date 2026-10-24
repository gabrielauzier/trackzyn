import { z } from 'zod'
import type { Workspace, WorkspaceMember } from '../db/schema.ts'
import type { User } from '../db/schema.ts'

/** UserRead of the Python API. */
export const userReadSchema = z.object({
  id: z.string(),
  email: z.string(),
  is_active: z.boolean(),
  is_superuser: z.boolean(),
  is_verified: z.boolean(),
  preferences: z.record(z.string(), z.unknown()).nullable(),
  is_2fa_enabled: z.boolean(),
})

/** WorkspaceRead of the Python API. */
export const workspaceReadSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_archived: z.boolean(),
  locale: z.string().nullable(),
  timezone: z.string().nullable(),
  icon: z.string().nullable(),
  color: z.string().nullable(),
  created_at: z.string(),
  created_by_user_id: z.string().nullable(),
  managed_by_user_id: z.string().nullable(),
  role: z.string().nullable(),
})

export function toWorkspaceRead(workspace: Workspace, role: string | null) {
  return {
    id: workspace.id,
    name: workspace.name,
    is_archived: workspace.isArchived,
    locale: workspace.locale,
    timezone: workspace.timezone,
    icon: workspace.icon,
    color: workspace.color,
    created_at: workspace.createdAt.toISOString(),
    created_by_user_id: workspace.createdByUserId,
    managed_by_user_id: workspace.managedByUserId,
    role,
  }
}

/** MemberRead of the Python API. */
export const memberReadSchema = z.object({
  id: z.string(),
  user_id: z.string(),
  email: z.string(),
  display_name: z.string().nullable(),
  role: z.string(),
  joined_at: z.string(),
})

export function toMemberRead(member: WorkspaceMember, user: User) {
  const displayName = user.preferences?.display_name
  return {
    id: member.id,
    user_id: user.id,
    email: user.email,
    display_name: typeof displayName === 'string' && displayName ? displayName : null,
    role: member.role,
    joined_at: member.joinedAt.toISOString(),
  }
}
