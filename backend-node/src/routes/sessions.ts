import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { createSession, deleteSession, listSessionTasks, listSessions, updateSession } from '../services/sessions.ts'
import { UUID_PATTERN } from '../services/users.ts'
import { periodQuery, toFilter } from './reports.ts'

/** The longest period the agenda reads at once (AGENDA-45). */
export const MAX_AGENDA_DAYS = 42

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')
const instant = z.iso.datetime({ offset: true })

const sessionSchema = z.object({
  id: z.string(),
  kind: z.enum(['task', 'break']),
  origin: z.enum(['focus', 'manual']),
  task_id: z.string().nullable(),
  task_title: z.string().nullable(),
  list_id: z.string(),
  list_name: z.string(),
  list_color: z.number(),
  started_at: z.string(),
  ended_at: z.string().nullable(),
})

const sessionTaskSchema = z.object({
  id: z.string(),
  title: z.string(),
  list_id: z.string(),
  list_name: z.string(),
  list_color: z.number(),
  column: z.enum(['backlog', 'this_week', 'today', 'done']),
})

const createBody = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('task'), task_id: uuid, started_at: instant, ended_at: instant }),
  z.object({ kind: z.literal('break'), list_id: uuid, started_at: instant, ended_at: instant }),
])

const updateBody = z.object({
  started_at: instant.optional(),
  ended_at: instant.optional(),
  task_id: uuid.optional(),
  list_id: uuid.optional(),
})

const sessionParams = z.object({ id: uuid })

const date = (value: string | undefined) => (value === undefined ? undefined : new Date(value))

/** The agenda of the logged-in user's own sessions; closed to access tokens (AD-007). */
export function sessionRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]
    const writing = [...reading, requireWrite]
    const actor = (request: { workspace: { user: { id: string } } }) => ({ userId: request.workspace.user.id })

    typed.get(
      '/api/sessions',
      {
        schema: { querystring: periodQuery(MAX_AGENDA_DAYS), response: { 200: z.object({ sessions: z.array(sessionSchema) }) } },
        preValidation: reading,
      },
      async (request) => ({
        sessions: await listSessions(ctx.db, actor(request), request.workspace.workspace, toFilter(request.query), new Date()),
      }),
    )

    // The tasks the panel offers: every column of the active lists, Done of any date (AGENDA-16).
    typed.get(
      '/api/sessions/tasks',
      { schema: { response: { 200: z.object({ tasks: z.array(sessionTaskSchema) }) } }, preValidation: reading },
      async (request) => ({ tasks: await listSessionTasks(ctx.db, request.workspace.workspace) }),
    )

    typed.post(
      '/api/sessions',
      { schema: { body: createBody, response: { 201: sessionSchema } }, preValidation: writing },
      async (request, reply) => {
        const body = request.body
        const times = { startedAt: new Date(body.started_at), endedAt: new Date(body.ended_at) }
        const input =
          body.kind === 'task'
            ? { kind: 'task' as const, taskId: body.task_id.toLowerCase(), ...times }
            : { kind: 'break' as const, listId: body.list_id.toLowerCase(), ...times }
        const session = await createSession(ctx.db, actor(request), request.workspace.workspace, input, new Date())
        return reply.code(201).send(session)
      },
    )

    typed.patch(
      '/api/sessions/:id',
      { schema: { params: sessionParams, body: updateBody, response: { 200: sessionSchema } }, preValidation: writing },
      async (request) =>
        updateSession(
          ctx.db,
          actor(request),
          request.workspace.workspace,
          request.params.id.toLowerCase(),
          {
            startedAt: date(request.body.started_at),
            endedAt: date(request.body.ended_at),
            taskId: request.body.task_id?.toLowerCase(),
            listId: request.body.list_id?.toLowerCase(),
          },
          new Date(),
        ),
    )

    typed.delete(
      '/api/sessions/:id',
      { schema: { params: sessionParams }, preValidation: writing },
      async (request, reply) => {
        await deleteSession(ctx.db, actor(request), request.workspace.workspace, request.params.id.toLowerCase(), new Date())
        return reply.code(204).send()
      },
    )
  }
}
