import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { PRIORITIES, TASK_COLUMNS, type TaskGroup } from '../db/schema.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { listGroups, moveGroupBlock } from '../services/groups.ts'
import { getList } from '../services/lists.ts'
import { UUID_PATTERN } from '../services/users.ts'
import { listParams } from './lists.ts'
import { taskReadSchema, toTaskRead } from './tasks.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')
const column = z.enum(TASK_COLUMNS)

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
    const writing = [...reading, requireWrite]

    typed.get(
      '/api/lists/:list_id/groups',
      { schema: { params: listParams, response: { 200: z.array(groupReadSchema) } }, config: { tokenScope: 'tasks:read' }, preValidation: reading },
      async (request) => {
        const list = await getList(ctx.db, request.params.list_id.toLowerCase(), request.workspace.workspace.id)
        return (await listGroups(ctx.db, list.id)).map(toGroupRead)
      },
    )

    // Closed to tokens (AD-007): only the board drags a container.
    typed.post(
      '/api/groups/:group_id/move',
      {
        schema: {
          params: z.object({ group_id: uuid }),
          body: z.object({ from: column, to: column, before_task_id: uuid.nullable() }),
          response: {
            200: z.object({
              tasks: z.array(taskReadSchema),
              group_without_next_action: z.object({ id: z.string(), name: z.string() }).nullable(),
            }),
          },
        },
        preValidation: writing,
      },
      async (request) => {
        const result = await moveGroupBlock(
          ctx.db,
          request.params.group_id.toLowerCase(),
          request.workspace.workspace.id,
          { from: request.body.from, to: request.body.to, beforeTaskId: request.body.before_task_id?.toLowerCase() ?? null },
          request.workspace.user.id,
        )
        return { tasks: result.tasks.map(toTaskRead), group_without_next_action: result.groupWithoutNextAction }
      },
    )
  }
}
