import { randomUUID } from 'node:crypto'
import { and, asc, count, eq, inArray, ne, notInArray } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type User, type Workspace, type WorkspaceMember, files, users, workspaceMembers, workspaces } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'

export function personalWorkspaceName(language: string | null | undefined): string {
  return language?.toLowerCase().startsWith('pt') ? 'Pessoal' : 'Personal'
}

/**
 * The user's auto-default Personal workspace plus an owner membership. Idempotent: a user who
 * already has a workspace they created and belong to gets the oldest one back.
 */
export async function createPersonalWorkspaceForUser(db: Database, user: User): Promise<Workspace> {
  const [existing] = await db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, user.id), eq(workspaces.createdByUserId, user.id)))
    .orderBy(asc(workspaces.createdAt))
    .limit(1)
  if (existing) return existing.workspace

  const language = typeof user.preferences?.language === 'string' ? user.preferences.language : null
  const now = new Date()
  const workspace: Workspace = {
    id: randomUUID(),
    name: personalWorkspaceName(language),
    createdByUserId: user.id,
    isArchived: false,
    managedByUserId: null,
    locale: language,
    timezone: null,
    icon: null,
    color: null,
    createdAt: now,
  }
  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values(workspace)
    await tx.insert(workspaceMembers).values({
      id: randomUUID(),
      workspaceId: workspace.id,
      userId: user.id,
      role: 'owner',
      invitedByUserId: null,
      joinedAt: now,
    })
  })
  return workspace
}

export interface WorkspaceWithRole {
  workspace: Workspace
  role: string
}

/**
 * Every workspace the user can access: the ones they belong to (with their membership role)
 * followed by the ones they only manage (role `manager`), each group oldest first.
 */
export async function listWorkspacesFor(db: Database, userId: string): Promise<WorkspaceWithRole[]> {
  const member = await db
    .select({ workspace: workspaces, role: workspaceMembers.role })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.isArchived, false)))
    .orderBy(asc(workspaces.createdAt))

  const seen = member.map((row) => row.workspace.id)
  const managed = await db
    .select()
    .from(workspaces)
    .where(
      and(
        eq(workspaces.managedByUserId, userId),
        eq(workspaces.isArchived, false),
        seen.length ? notInArray(workspaces.id, seen) : undefined,
      ),
    )
    .orderBy(asc(workspaces.createdAt))

  return [...member, ...managed.map((workspace) => ({ workspace, role: 'manager' }))]
}


export const WORKSPACE_ROLES = ['owner', 'editor', 'viewer'] as const
export const MANAGER_VIRTUAL_ROLE = 'manager'

const ROLE_RANK: Record<string, number> = { viewer: 1, editor: 2, owner: 3, manager: 3 }

function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: string; cause?: { code?: string } } | undefined
  return e?.code === '23505' || e?.cause?.code === '23505'
}

export async function getMembership(db: Database, workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
  const [member] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1)
  return member ?? null
}

export async function getWorkspace(db: Database, id: string): Promise<Workspace | null> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1)
  return workspace ?? null
}

export async function isWorkspaceManager(db: Database, workspaceId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.id, workspaceId), eq(workspaces.managedByUserId, userId)))
    .limit(1)
  return row !== undefined
}

/** An in-memory membership for a manager who has no `workspace_members` row. Never persisted. */
export function virtualManagerMember(workspaceId: string, userId: string): WorkspaceMember {
  return {
    id: '00000000-0000-0000-0000-000000000000',
    workspaceId,
    userId,
    role: MANAGER_VIRTUAL_ROLE,
    invitedByUserId: null,
    joinedAt: new Date(0),
  }
}

/** The oldest workspace the user belongs to, else the oldest one they manage. */
export async function getDefaultWorkspace(db: Database, userId: string): Promise<Workspace | null> {
  const items = await listWorkspacesFor(db, userId)
  return items[0]?.workspace ?? null
}

/**
 * `require_membership`: the user's effective membership (a manager gets a virtual `manager` one)
 * or 404; `minRole` is a floor that answers 403 `Insufficient role`.
 */
export async function requireMembership(
  db: Database,
  workspaceId: string,
  userId: string,
  minRole?: string,
): Promise<WorkspaceMember> {
  let member = await getMembership(db, workspaceId, userId)
  if (!member) {
    if (!(await isWorkspaceManager(db, workspaceId, userId))) throw new HttpError(404, 'Workspace not found')
    member = virtualManagerMember(workspaceId, userId)
  }
  if (minRole === undefined) return member
  if ((ROLE_RANK[member.role] ?? 0) < (ROLE_RANK[minRole] ?? 0)) throw new HttpError(403, 'Insufficient role')
  return member
}

export async function createWorkspace(
  db: Database,
  input: {
    name: string
    creator: User
    locale?: string | null
    icon?: string | null
    color?: string | null
    selfMembership: boolean
  },
): Promise<Workspace> {
  const language = typeof input.creator.preferences?.language === 'string' ? input.creator.preferences.language : null
  const now = new Date()
  const workspace: Workspace = {
    id: randomUUID(),
    name: input.name.trim() || 'Workspace',
    createdByUserId: input.creator.id,
    isArchived: false,
    managedByUserId: input.creator.id,
    locale: input.locale || language || 'en',
    timezone: null,
    icon: input.icon ?? null,
    color: input.color ?? null,
    createdAt: now,
  }
  await db.transaction(async (tx) => {
    await tx.insert(workspaces).values(workspace)
    if (input.selfMembership) {
      await tx.insert(workspaceMembers).values({
        id: randomUUID(),
        workspaceId: workspace.id,
        userId: input.creator.id,
        role: 'owner',
        invitedByUserId: null,
        joinedAt: now,
      })
    }
  })
  return workspace
}

export async function listMembers(db: Database, workspaceId: string): Promise<Array<{ member: WorkspaceMember; user: User }>> {
  const members = await db
    .select()
    .from(workspaceMembers)
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(workspaceMembers.joinedAt))
  if (members.length === 0) return []
  const found = await db
    .select()
    .from(users)
    .where(
      inArray(
        users.id,
        members.map((m) => m.userId),
      ),
    )
  const byId = new Map(found.map((u) => [u.id, u]))
  return members.flatMap((member) => {
    const user = byId.get(member.userId)
    return user ? [{ member, user }] : []
  })
}

export async function addMember(
  db: Database,
  input: { workspaceId: string; userId: string; role: string; invitedByUserId: string | null },
): Promise<WorkspaceMember> {
  if (!(WORKSPACE_ROLES as readonly string[]).includes(input.role)) throw new HttpError(400, `Invalid role: ${input.role}`)
  if (await getMembership(db, input.workspaceId, input.userId)) throw new HttpError(409, 'User is already a member')
  const member: WorkspaceMember = {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    userId: input.userId,
    role: input.role,
    invitedByUserId: input.invitedByUserId,
    joinedAt: new Date(),
  }
  try {
    await db.insert(workspaceMembers).values(member)
  } catch (error) {
    // Two concurrent invites passed the check above; `uq_workspace_member` refuses the second.
    if (isUniqueViolation(error)) throw new HttpError(409, 'User is already a member')
    throw error
  }
  return member
}

async function ownerCount(db: Database, workspaceId: string): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.role, 'owner')))
  return Number(row?.n ?? 0)
}

export async function updateMemberRole(db: Database, workspaceId: string, userId: string, newRole: string): Promise<WorkspaceMember> {
  if (!(WORKSPACE_ROLES as readonly string[]).includes(newRole)) throw new HttpError(400, `Invalid role: ${newRole}`)
  const member = await getMembership(db, workspaceId, userId)
  if (!member) throw new HttpError(404, 'Member not found')
  // Demoting the sole owner would leave the workspace without one.
  if (member.role === 'owner' && newRole !== 'owner' && (await ownerCount(db, workspaceId)) <= 1) {
    throw new HttpError(400, 'Cannot demote the sole owner')
  }
  await db.update(workspaceMembers).set({ role: newRole }).where(eq(workspaceMembers.id, member.id))
  return { ...member, role: newRole }
}

export async function getWorkspaceStats(db: Database, workspaceId: string): Promise<{ members: number; files: number }> {
  const [members] = await db.select({ n: count() }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspaceId))
  const [stored] = await db.select({ n: count() }).from(files).where(eq(files.workspaceId, workspaceId))
  return { members: Number(members?.n ?? 0), files: Number(stored?.n ?? 0) }
}

/** Soft delete. Refuses to archive the last workspace the requester can still reach. */
export async function archiveWorkspace(db: Database, workspaceId: string, requesterId: string): Promise<Workspace> {
  const workspace = await getWorkspace(db, workspaceId)
  if (!workspace) throw new HttpError(404, 'Workspace not found')
  if (workspace.isArchived) return workspace

  const [otherMember] = await db
    .select({ n: count() })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(
      and(
        eq(workspaceMembers.userId, requesterId),
        ne(workspaceMembers.workspaceId, workspaceId),
        eq(workspaces.isArchived, false),
      ),
    )
  const [otherManaged] = await db
    .select({ n: count() })
    .from(workspaces)
    .where(and(eq(workspaces.managedByUserId, requesterId), ne(workspaces.id, workspaceId), eq(workspaces.isArchived, false)))
  if (Number(otherMember?.n ?? 0) + Number(otherManaged?.n ?? 0) === 0) {
    throw new HttpError(400, 'Cannot archive your last workspace')
  }
  await db.update(workspaces).set({ isArchived: true }).where(eq(workspaces.id, workspaceId))
  return { ...workspace, isArchived: true }
}

export async function removeMember(db: Database, workspaceId: string, userId: string): Promise<void> {
  const member = await getMembership(db, workspaceId, userId)
  if (!member) throw new HttpError(404, 'Member not found')
  if (member.role === 'owner' && (await ownerCount(db, workspaceId)) <= 1) {
    throw new HttpError(400, 'Cannot remove the sole owner')
  }
  await db.delete(workspaceMembers).where(eq(workspaceMembers.id, member.id))
}

/** The Personal workspace role sync runs against: the oldest workspace the user created and belongs to. */
export async function findPersonalMembership(
  db: Database,
  userId: string,
): Promise<{ workspace: Workspace; member: WorkspaceMember } | null> {
  const [workspaceRow] = await db
    .select({ workspace: workspaces })
    .from(workspaces)
    .innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaces.createdByUserId, userId)))
    .orderBy(asc(workspaces.createdAt))
    .limit(1)
  if (!workspaceRow) return null
  const member = await getMembership(db, workspaceRow.workspace.id, userId)
  return member ? { workspace: workspaceRow.workspace, member } : null
}
