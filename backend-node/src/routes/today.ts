import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { type TodayActor, closeDay, readToday } from '../services/today.ts'
import { UUID_PATTERN } from '../services/users.ts'

const listSchema = z.object({ id: z.string(), name: z.string(), color: z.number() })
const taskRef = {
  id: z.string(),
  title: z.string(),
  list: listSchema,
  estimate_minutes: z.number().nullable(),
}
const pendingSchema = z.object({
  ...taskRef,
  position: z.number(),
  scheduled_on: z.string().nullable(),
  scheduled_minute: z.number().nullable(),
  plan_minute: z.number().nullable(),
  has_session_today: z.boolean(),
  days_late: z.number().nullable(),
  subtasks: z.object({ done: z.number(), total: z.number() }),
  series: z.boolean(),
})
const doneSchema = z.object({
  ...taskRef,
  completed_at: z.string(),
  spent_seconds: z.number(),
  verdict: z.enum(['early', 'on_time', 'late']).nullable(),
  diff_seconds: z.number(),
  series: z.boolean(),
})
const blockSchema = z.object({
  id: z.string(),
  kind: z.enum(['task', 'break']),
  task_id: z.string().nullable(),
  title: z.string(),
  list_color: z.number().nullable(),
  start_minute: z.number(),
  minutes: z.number(),
  done: z.boolean(),
})
const sessionSchema = z.object({
  id: z.string(),
  kind: z.enum(['task', 'break']),
  task_id: z.string().nullable(),
  title: z.string().nullable(),
  list_id: z.string(),
  list_color: z.number(),
  start_minute: z.number(),
  end_minute: z.number(),
  started_at: z.string(),
  ended_at: z.string(),
  open: z.boolean(),
})
const tomorrowSchema = z.object({
  ...taskRef,
  scheduled_minute: z.number().nullable(),
  series: z.boolean(),
})
const todaySchema = z.object({
  server_now: z.string(),
  day: z.string(),
  tomorrow: z.string(),
  timezone: z.string(),
  now_minute: z.number(),
  workday: z.object({ start: z.string(), end: z.string() }),
  pending: z.array(pendingSchema),
  done: z.array(doneSchema),
  plan: z.object({ saved: z.boolean(), blocks: z.array(blockSchema) }),
  sessions: z.array(sessionSchema),
  tomorrow_plan_blocks: z.number(),
  tomorrow_tasks: z.array(tomorrowSchema),
  week_unscheduled: z.number(),
  focus_task_series: z.boolean(),
})

const MAX_CLOSE_MOVES = 500
const closeBody = z.object({
  moves: z
    .array(z.object({ task_id: z.string().regex(UUID_PATTERN, 'Input should be a valid UUID'), to: z.enum(['tomorrow', 'this_week', 'backlog']) }))
    .max(MAX_CLOSE_MOVES)
    .refine((moves) => new Set(moves.map((move) => move.task_id.toLowerCase())).size === moves.length, {
      message: 'A task may be moved only once',
    }),
})

/** The logged-in user's day in the current workspace (dashboard-hoje); closed to access tokens (AD-007). */
export function todayRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]
    const writing = [...reading, requireWrite]
    const actor = (request: { workspace: { user: { id: string }; workspace: Pick<TodayActor['workspace'], 'id' | 'timezone'> } }) => ({
      userId: request.workspace.user.id,
      workspace: request.workspace.workspace,
    })

    typed.get('/api/today', { schema: { response: { 200: todaySchema } }, preValidation: reading }, async (request) =>
      readToday(ctx.db, actor(request), new Date()),
    )

    // `Fechar o dia` (HOJE-61): only who writes (HOJE-67), in one transaction.
    typed.post(
      '/api/today/close',
      { schema: { body: closeBody, response: { 200: todaySchema } }, preValidation: writing },
      async (request) =>
        closeDay(
          ctx.db,
          actor(request),
          request.body.moves.map((move) => ({ task_id: move.task_id.toLowerCase(), to: move.to })),
          new Date(),
        ),
    )
  }
}
