import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { PRIORITIES, type TaskGroup } from '../db/schema.ts'
import { authGuards } from '../plugins/auth.ts'
import { workspaceContext } from '../plugins/workspace.ts'
import { listGroups } from '../services/groups.ts'
import { getList } from '../services/lists.ts'
import { listParams } from './lists.ts'

export const groupReadSchema = z.object({
  id: z.string(),
  list_id: z.string(),
  name: z.string(),
  notes: z.string().nullable(),
  priority: z.enum(PRIORITIES),
  due_on: z.string().nullable(),
  created_at: z.string(),
})

export function toGroupRead(group: TaskGroup) {
  return {
    id: group.id,
    list_id: group.listId,
    name: group.name,
    notes: group.notes,
    priority: group.priority,
    due_on: group.dueOn,
    created_at: group.createdAt.toISOString(),
  }
}

export function groupRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]

    typed.get(
      '/api/lists/:list_id/groups',
      { schema: { params: listParams, response: { 200: z.array(groupReadSchema) } }, config: { tokenScope: 'tasks:read' }, preValidation: reading },
      async (request) => {
        const list = await getList(ctx.db, request.params.list_id.toLowerCase(), request.workspace.workspace.id)
        return (await listGroups(ctx.db, list.id)).map(toGroupRead)
      },
    )
  }
}
