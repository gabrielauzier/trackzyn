import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { type BlockInput, getPlan, listCandidates, listPlanned, savePlan } from '../services/plans.ts'
import { UUID_PATTERN, setWorkday } from '../services/users.ts'
import { periodQuery } from './reports.ts'
import { MAX_AGENDA_DAYS } from './sessions.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Input should be a time (HH:MM)')
const dayParams = z.object({ day: z.iso.date('Input should be a valid date (YYYY-MM-DD)') })

const blockBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), task_id: uuid, start: time, minutes: z.number().int().min(5).max(1440) }),
  z.object({
    kind: z.literal('break'),
    name: z.string().trim().min(1).max(40),
    list_id: uuid,
    start: time,
    minutes: z.number().int().min(5).max(120),
  }),
])
const planBody = z.object({ base_version: z.number().int().min(0), blocks: z.array(blockBody) })
const workdayBody = z.object({ start: time, end: time })

const listSchema = z.object({ id: z.string(), name: z.string(), color: z.number() })
const taskBlockSchema = z.object({
  id: z.string(),
  kind: z.literal('task'),
  start: z.string(),
  minutes: z.number(),
  task: z.object({
    id: z.string(),
    title: z.string(),
    list: listSchema,
    done: z.boolean(),
    scheduled_on: z.string().nullable(),
    estimate_minutes: z.number().nullable(),
  }),
})
const breakBlockSchema = z.object({ id: z.string(), kind: z.literal('break'), start: z.string(), minutes: z.number(), name: z.string(), list: listSchema })
const blockSchema = z.discriminatedUnion('kind', [taskBlockSchema, breakBlockSchema])
const plannedSchema = z.discriminatedUnion('kind', [taskBlockSchema.extend({ day: z.string() }), breakBlockSchema.extend({ day: z.string() })])
const workdaySchema = z.object({ start: z.string(), end: z.string() })
const planSchema = z.object({ day: z.string(), version: z.number(), editable: z.boolean(), workday: workdaySchema, blocks: z.array(blockSchema) })
const candidateSchema = z.object({
  id: z.string(),
  title: z.string(),
  list: listSchema,
  column: z.enum(['backlog', 'this_week', 'today']),
  position: z.number(),
  estimate_minutes: z.number().nullable(),
  scheduled_on: z.string().nullable(),
  scheduled_time: z.string().nullable(),
})

const toBlock = (block: z.infer<typeof blockBody>): BlockInput =>
  block.kind === 'task'
    ? { kind: 'task', taskId: block.task_id.toLowerCase(), start: block.start, minutes: block.minutes }
    : { kind: 'break', name: block.name, listId: block.list_id.toLowerCase(), start: block.start, minutes: block.minutes }

/** The logged-in user's day plans and workday (planejamento-diario); closed to access tokens (AD-007, PLAN-42). */
export function planRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]
    const writing = [...reading, requireWrite]
    const actor = (request: { workspace: { user: { id: string }; workspace: { id: string } } }) => ({
      userId: request.workspace.user.id,
      workspaceId: request.workspace.workspace.id,
    })

    typed.get(
      '/api/plans',
      {
        schema: { querystring: periodQuery(MAX_AGENDA_DAYS), response: { 200: z.object({ blocks: z.array(plannedSchema) }) } },
        preValidation: reading,
      },
      async (request) => ({ blocks: await listPlanned(ctx.db, actor(request), request.query.from, request.query.to) }),
    )

    typed.get(
      '/api/plans/:day',
      { schema: { params: dayParams, response: { 200: planSchema } }, preValidation: reading },
      async (request) => getPlan(ctx.db, actor(request), request.params.day, new Date()),
    )

    typed.put(
      '/api/plans/:day',
      { schema: { params: dayParams, body: planBody, response: { 200: planSchema } }, preValidation: writing },
      async (request) =>
        savePlan(
          ctx.db,
          actor(request),
          request.params.day,
          { baseVersion: request.body.base_version, blocks: request.body.blocks.map(toBlock) },
          new Date(),
        ),
    )

    typed.get(
      '/api/plans/:day/candidates',
      { schema: { params: dayParams, response: { 200: z.object({ tasks: z.array(candidateSchema) }) } }, preValidation: reading },
      async (request) => ({ tasks: await listCandidates(ctx.db, actor(request), request.params.day, new Date()) }),
    )

    // The workday is the user's, but a viewer is refused like any write of the workspace (PLAN-41).
    typed.put(
      '/api/users/me/workday',
      { schema: { body: workdayBody, response: { 200: workdaySchema } }, preValidation: writing },
      async (request) => setWorkday(ctx.db, request.workspace.user, request.body),
    )
  }
}
