import type { preValidationAsyncHookHandler } from 'fastify'
import type { AppContext } from '../context.ts'
import type { User, Workspace, WorkspaceMember } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { UUID_PATTERN } from '../services/users.ts'
import {
  getDefaultWorkspace,
  getMembership,
  getWorkspace,
  isWorkspaceManager,
  virtualManagerMember,
} from '../services/workspaces.ts'

/** `WorkspaceContext` of the Python API: the workspace a request addresses and who the caller is in it. */
export interface WorkspaceContext {
  workspace: Workspace
  member: WorkspaceMember
  user: User
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by the `workspaceContext` guard. */
    workspace: WorkspaceContext
  }
}

const canWrite = (role: string) => ['owner', 'editor', 'manager'].includes(role)

/**
 * `current_workspace`: resolves `X-Workspace-Id` (or the user's default workspace) after
 * `requireUser`. A manager without a membership row gets a virtual `manager` membership.
 */
export function workspaceContext(ctx: AppContext): preValidationAsyncHookHandler {
  return async (request) => {
    const user = request.user
    const header = request.headers['x-workspace-id']
    const requested = Array.isArray(header) ? header[0] : header

    if (requested) {
      if (!UUID_PATTERN.test(requested)) throw new HttpError(400, 'Invalid X-Workspace-Id')
      const workspace = await getWorkspace(ctx.db, requested.toLowerCase())
      if (!workspace || workspace.isArchived) throw new HttpError(404, 'Workspace not found')
      let member = await getMembership(ctx.db, workspace.id, user.id)
      if (!member) {
        if (!(await isWorkspaceManager(ctx.db, workspace.id, user.id))) throw new HttpError(404, 'Workspace not found')
        member = virtualManagerMember(workspace.id, user.id)
      }
      request.workspace = { workspace, member, user }
      return
    }

    const workspace = await getDefaultWorkspace(ctx.db, user.id)
    if (!workspace) throw new HttpError(404, 'No workspace available')
    let member = await getMembership(ctx.db, workspace.id, user.id)
    if (!member) {
      if (!(await isWorkspaceManager(ctx.db, workspace.id, user.id))) {
        throw new HttpError(500, 'Workspace state inconsistent')
      }
      member = virtualManagerMember(workspace.id, user.id)
    }
    request.workspace = { workspace, member, user }
  }
}

/** `current_writable_workspace`: the context, refused with 403 `Read-only role` for a viewer. */
export const requireWrite: preValidationAsyncHookHandler = async (request) => {
  if (!canWrite(request.workspace.member.role)) throw new HttpError(403, 'Read-only role')
}
