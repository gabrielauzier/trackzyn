import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { authGuards } from '../plugins/auth.ts'
import { workspaceContext } from '../plugins/workspace.ts'
import { listScheduled } from '../services/scheduled.ts'
import { periodQuery } from './reports.ts'
import { MAX_AGENDA_DAYS } from './sessions.ts'
import { seriesReadSchema } from './tasks.ts'

const listSchema = z.object({ id: z.string(), name: z.string(), color: z.number() })

const scheduledTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  list: listSchema,
  column: z.enum(['backlog', 'this_week', 'today']),
  position: z.number(),
  estimate_minutes: z.number().nullable(),
  scheduled_on: z.string(),
  scheduled_time: z.string().nullable(),
  series: seriesReadSchema.pick({ id: true, rule: true }).nullable(),
})

const projectedSchema = z.object({
  series_id: z.string(),
  task_id: z.string(),
  title: z.string(),
  list: listSchema,
  on: z.string(),
  time: z.string(),
  estimate_minutes: z.number().nullable(),
  rule: seriesReadSchema.shape.rule,
})

const scheduledSchema = z.object({
  timed: z.array(scheduledTaskSchema),
  untimed: z.array(scheduledTaskSchema),
  projected: z.array(projectedSchema),
})

/** The scheduled tasks of the workspace that the Agenda draws (US-5, US-14, D9); closed to access tokens (AD-007). */
export function scheduledRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)

    typed.get(
      '/api/agenda/scheduled',
      {
        schema: { querystring: periodQuery(MAX_AGENDA_DAYS), response: { 200: scheduledSchema } },
        preValidation: [requireUser, workspaceContext(ctx)],
      },
      async (request) => listScheduled(ctx.db, request.workspace.workspace.id, request.query.from, request.query.to, new Date()),
    )
  }
}
