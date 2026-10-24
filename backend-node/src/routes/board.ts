import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { authGuards } from '../plugins/auth.ts'
import { workspaceContext } from '../plugins/workspace.ts'
import { buildBoard } from '../services/board.ts'
import { UUID_PATTERN } from '../services/users.ts'

const taskCard = z.object({
  id: z.string(),
  title: z.string(),
  estimate_minutes: z.number().nullable(),
  spent_seconds: z.number(),
  position: z.number(),
  subtasks: z.object({ done: z.number(), total: z.number() }),
})
const column = z.object({ tasks: z.array(taskCard), estimate_minutes: z.number() })
const progressColumn = column.extend({ done: z.number(), total: z.number() })

const boardSchema = z.object({
  list: z.object({ id: z.string(), name: z.string(), color: z.number() }),
  timezone: z.string(),
  pending: z.object({ count: z.number(), estimate_minutes: z.number() }),
  columns: z.object({
    backlog: column,
    this_week: progressColumn,
    today: progressColumn,
    done: z.object({ today_count: z.number(), days: z.array(z.object({ date: z.string(), tasks: z.array(taskCard) })) }),
  }),
})

export function boardRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)

    typed.get(
      '/api/lists/:list_id/board',
      {
        schema: {
          params: z.object({ list_id: z.string().regex(UUID_PATTERN, 'Input should be a valid UUID') }),
          response: { 200: boardSchema },
        },
        preValidation: [requireUser, workspaceContext(ctx)],
      },
      async (request) => buildBoard(ctx.db, request.params.list_id.toLowerCase(), request.workspace.workspace, request.workspace.user.id),
    )
  }
}
