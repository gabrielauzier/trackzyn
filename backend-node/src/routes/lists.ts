import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import type { List } from '../db/schema.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { dayTimezone } from '../services/day.ts'
import { type ListCard, createList, deleteList, getList, listLists, moveList, updateList } from '../services/lists.ts'
import { UUID_PATTERN } from '../services/users.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')

const listReadSchema = z.object({
  id: z.string(),
  workspace_id: z.string(),
  name: z.string(),
  color: z.number(),
  position: z.number(),
  is_archived: z.boolean(),
  created_by_user_id: z.string().nullable(),
  created_at: z.string(),
})

const listCardSchema = listReadSchema.extend({
  pending_count: z.number(),
  preview: z.array(z.object({ id: z.string(), title: z.string() })),
})

const listParams = z.object({ list_id: uuid })
const name = z.string().min(1).max(100)
const color = z.number().int().min(1).max(8)

export function toListRead(list: List) {
  return {
    id: list.id,
    workspace_id: list.workspaceId,
    name: list.name,
    color: list.color,
    position: list.position,
    is_archived: list.isArchived,
    created_by_user_id: list.createdByUserId,
    created_at: list.createdAt.toISOString(),
  }
}

function toListCard(card: ListCard) {
  return { ...toListRead(card.list), pending_count: card.pendingCount, preview: card.preview }
}

export function listRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]
    const writing = [...reading, requireWrite]

    typed.get(
      '/api/lists',
      {
        schema: {
          querystring: z.object({ archived: z.enum(['true', 'false']).default('false') }),
          response: { 200: z.object({ timezone: z.string(), lists: z.array(listCardSchema) }) },
        },
        preValidation: reading,
      },
      async (request) => {
        const workspace = request.workspace.workspace
        const cards = await listLists(ctx.db, workspace.id, { archived: request.query.archived === 'true' })
        return { timezone: await dayTimezone(ctx.db, workspace), lists: cards.map(toListCard) }
      },
    )

    typed.post(
      '/api/lists',
      { schema: { body: z.object({ name, color }), response: { 201: listReadSchema } }, preValidation: writing },
      async (request, reply) => {
        const list = await createList(ctx.db, {
          workspaceId: request.workspace.workspace.id,
          userId: request.workspace.user.id,
          name: request.body.name,
          color: request.body.color,
        })
        return reply.code(201).send(toListRead(list))
      },
    )

    // SPEC_DEVIATION: design.md does not list GET /api/lists/:id.
    // Reason: spec LIST-09 requires `GET /api/lists/:id` to answer 404 after a delete, so the route exists.
    typed.get(
      '/api/lists/:list_id',
      { schema: { params: listParams, response: { 200: listReadSchema } }, preValidation: reading },
      async (request) =>
        toListRead(await getList(ctx.db, request.params.list_id.toLowerCase(), request.workspace.workspace.id)),
    )

    typed.patch(
      '/api/lists/:list_id',
      {
        schema: {
          params: listParams,
          body: z.object({ name: name.optional(), color: color.optional(), is_archived: z.boolean().optional() }),
          response: { 200: listReadSchema },
        },
        preValidation: writing,
      },
      async (request) =>
        toListRead(
          await updateList(ctx.db, request.params.list_id.toLowerCase(), request.workspace.workspace.id, {
            name: request.body.name,
            color: request.body.color,
            isArchived: request.body.is_archived,
          }),
        ),
    )

    typed.post(
      '/api/lists/:list_id/move',
      { schema: { params: listParams, body: z.object({ before_list_id: uuid.nullable() }) }, preValidation: writing },
      async (request, reply) => {
        await moveList(
          ctx.db,
          request.params.list_id.toLowerCase(),
          request.workspace.workspace.id,
          request.body.before_list_id?.toLowerCase() ?? null,
        )
        return reply.code(204).send()
      },
    )

    typed.delete(
      '/api/lists/:list_id',
      { schema: { params: listParams }, preValidation: writing },
      async (request, reply) => {
        await deleteList(ctx.db, request.params.list_id.toLowerCase(), request.workspace.workspace.id)
        return reply.code(204).send()
      },
    )
  }
}
