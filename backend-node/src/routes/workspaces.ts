import { eq } from 'drizzle-orm'
import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { users, workspaces } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { isValidTimezone } from '../services/timezones.ts'
import { authGuards } from '../plugins/auth.ts'
import { workspaceContext } from '../plugins/workspace.ts'
import { UUID_PATTERN, createUser, getUserById } from '../services/users.ts'
import {
  addMember,
  archiveWorkspace,
  createPersonalWorkspaceForUser,
  createWorkspace,
  getWorkspace,
  getWorkspaceStats,
  listMembers,
  listWorkspacesFor,
  removeMember,
  requireMembership,
  updateMemberRole,
} from '../services/workspaces.ts'
import { memberReadSchema, toMemberRead, toWorkspaceRead, workspaceReadSchema } from './schemas.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')
const workspaceParams = z.object({ workspace_id: uuid })
const memberParams = z.object({ workspace_id: uuid, member_user_id: uuid })

const workspaceCreateBody = z.object({
  name: z.string().min(1).max(100),
  locale: z.string().max(10).nullish(),
  icon: z.string().max(50).nullish(),
  color: z.string().max(7).nullish(),
  self_membership: z.boolean().default(false),
})

const workspaceUpdateBody = z.object({
  name: z.string().min(1).max(100).nullish(),
  icon: z.string().max(50).nullish(),
  color: z.string().max(7).nullish(),
  locale: z.string().max(10).nullish(),
  timezone: z.string().max(64).nullish(),
})

const memberInviteBody = z.object({
  email: z.email(),
  role: z.string().default('editor'),
  password: z.string().min(8).max(128).nullish(),
})

const memberRoleBody = z.object({ role: z.string() })

export function workspaceRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const inWorkspace = [requireUser, workspaceContext(ctx)]

    typed.get(
      '/api/workspaces',
      { schema: { response: { 200: z.array(workspaceReadSchema) } }, preValidation: [requireUser] },
      async (request) => {
        const items = await listWorkspacesFor(ctx.db, request.user.id)
        return items.map(({ workspace, role }) => toWorkspaceRead(workspace, role))
      },
    )

    typed.post(
      '/api/workspaces',
      { schema: { body: workspaceCreateBody, response: { 201: workspaceReadSchema } }, preValidation: [requireUser] },
      async (request, reply) => {
        const body = request.body
        const workspace = await createWorkspace(ctx.db, {
          name: body.name,
          creator: request.user,
          locale: body.locale,
          icon: body.icon,
          color: body.color,
          selfMembership: body.self_membership,
        })
        return reply.code(201).send(toWorkspaceRead(workspace, body.self_membership ? 'owner' : 'manager'))
      },
    )

    typed.get(
      '/api/workspaces/current',
      { schema: { response: { 200: workspaceReadSchema } }, preValidation: inWorkspace },
      async (request) => toWorkspaceRead(request.workspace.workspace, request.workspace.member.role),
    )

    typed.patch(
      '/api/workspaces/:workspace_id',
      {
        schema: { params: workspaceParams, body: workspaceUpdateBody, response: { 200: workspaceReadSchema } },
        preValidation: [requireUser],
      },
      async (request) => {
        const id = request.params.workspace_id.toLowerCase()
        const member = await requireMembership(ctx.db, id, request.user.id, 'owner')
        const workspace = await getWorkspace(ctx.db, id)
        if (!workspace) throw new HttpError(404, 'Workspace not found')

        // `model_dump(exclude_unset=True)`: only the fields the request carried, nulls included.
        const body = request.body
        const updates: Partial<typeof workspaces.$inferInsert> = {}
        if (body.name !== undefined) updates.name = body.name as string
        if (body.icon !== undefined) updates.icon = body.icon
        if (body.color !== undefined) updates.color = body.color
        if (body.locale !== undefined) updates.locale = body.locale
        if (body.timezone !== undefined) {
          if (body.timezone !== null && !isValidTimezone(body.timezone)) throw new HttpError(400, 'Invalid IANA timezone')
          updates.timezone = body.timezone
        }
        if (Object.keys(updates).length > 0) await ctx.db.update(workspaces).set(updates).where(eq(workspaces.id, id))
        const updated = (await getWorkspace(ctx.db, id)) ?? workspace
        return toWorkspaceRead(updated, member.role)
      },
    )

    typed.get(
      '/api/workspaces/:workspace_id/members',
      { schema: { params: workspaceParams, response: { 200: z.array(memberReadSchema) } }, preValidation: [requireUser] },
      async (request) => {
        const id = request.params.workspace_id.toLowerCase()
        await requireMembership(ctx.db, id, request.user.id)
        const rows = await listMembers(ctx.db, id)
        return rows.map(({ member, user }) => toMemberRead(member, user))
      },
    )

    typed.post(
      '/api/workspaces/:workspace_id/members',
      {
        schema: { params: workspaceParams, body: memberInviteBody, response: { 201: memberReadSchema } },
        preValidation: [requireUser],
      },
      async (request, reply) => {
        const id = request.params.workspace_id.toLowerCase()
        await requireMembership(ctx.db, id, request.user.id, 'owner')
        const { email, role, password } = request.body

        const [existing] = await ctx.db
          .select()
          .from(users)
          .where(eq(users.email, email.toLowerCase()))
          .limit(1)
        let target = existing ?? null

        if (!target) {
          // A brand-new user gets a local password, so it needs local credentials to be accepted.
          if (password) {
            if (!ctx.config.localAuthEnabled) throw new HttpError(403, 'LOCAL_AUTH_DISABLED')
          } else if (!ctx.config.localAuthEnabled) {
            throw new HttpError(
              400,
              'User not found. They must sign in through the identity provider once before they can be added.',
            )
          } else {
            throw new HttpError(400, 'User not found. Provide a password to create them.')
          }
          try {
            target = await createUser(ctx.db, { email, password: password as string })
            await createPersonalWorkspaceForUser(ctx.db, target)
          } catch (error) {
            throw new HttpError(400, `Could not create user: ${error instanceof Error ? error.message : String(error)}`)
          }
        }

        const member = await addMember(ctx.db, {
          workspaceId: id,
          userId: target.id,
          role,
          invitedByUserId: request.user.id,
        })
        return reply.code(201).send(toMemberRead(member, target))
      },
    )

    typed.patch(
      '/api/workspaces/:workspace_id/members/:member_user_id',
      {
        schema: { params: memberParams, body: memberRoleBody, response: { 200: memberReadSchema } },
        preValidation: [requireUser],
      },
      async (request) => {
        const id = request.params.workspace_id.toLowerCase()
        const memberUserId = request.params.member_user_id.toLowerCase()
        await requireMembership(ctx.db, id, request.user.id, 'owner')
        const member = await updateMemberRole(ctx.db, id, memberUserId, request.body.role)
        const target = await getUserById(ctx.db, memberUserId)
        if (!target) throw new HttpError(404, 'Could not find user')
        return toMemberRead(member, target)
      },
    )

    typed.get(
      '/api/workspaces/:workspace_id/stats',
      { schema: { params: workspaceParams }, preValidation: [requireUser] },
      async (request) => {
        const id = request.params.workspace_id.toLowerCase()
        await requireMembership(ctx.db, id, request.user.id)
        return getWorkspaceStats(ctx.db, id)
      },
    )

    typed.post(
      '/api/workspaces/:workspace_id/archive',
      { schema: { params: workspaceParams, response: { 200: workspaceReadSchema } }, preValidation: [requireUser] },
      async (request) => {
        const id = request.params.workspace_id.toLowerCase()
        await requireMembership(ctx.db, id, request.user.id, 'owner')
        const workspace = await archiveWorkspace(ctx.db, id, request.user.id)
        return toWorkspaceRead(workspace, 'owner')
      },
    )

    typed.delete(
      '/api/workspaces/:workspace_id/members/:member_user_id',
      { schema: { params: memberParams }, preValidation: [requireUser] },
      async (request, reply) => {
        const id = request.params.workspace_id.toLowerCase()
        const memberUserId = request.params.member_user_id.toLowerCase()
        // An owner can remove anyone; everyone else can only remove themselves.
        const requester = await requireMembership(ctx.db, id, request.user.id)
        if (requester.role !== 'owner' && memberUserId !== request.user.id) {
          throw new HttpError(403, 'Only the owner can remove other members')
        }
        await removeMember(ctx.db, id, memberUserId)
        return reply.code(204).send()
      },
    )
  }
}

