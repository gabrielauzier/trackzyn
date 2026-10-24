import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import {
  type FocusActionInput,
  breakFocus,
  completeFocus,
  endBreakFocus,
  extendFocus,
  heartbeatFocus,
  pauseFocus,
  recoverFocus,
  skipFocus,
  startFocus,
} from '../services/focus.ts'
import { readFocusState } from '../services/focus-state.ts'
import { UUID_PATTERN } from '../services/users.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')
const deviceId = z.string().min(1).max(64)

const sessionSchema = z.object({
  id: z.string(),
  kind: z.enum(['task', 'break']),
  task_id: z.string().nullable(),
  list_id: z.string(),
  device_id: z.string(),
  started_at: z.string(),
  deadline_at: z.string().nullable(),
  planned_seconds: z.number().nullable(),
})

const taskViewSchema = z.object({
  id: z.string(),
  title: z.string(),
  estimate_minutes: z.number().nullable(),
  spent_seconds: z.number(),
  awaiting_extend: z.boolean(),
})

const focusStateSchema = z.object({
  server_now: z.string(),
  session: sessionSchema.nullable(),
  task: taskViewSchema.nullable(),
  today: z.object({
    pending: z.number(),
    done: z.number(),
    estimate_minutes: z.number(),
    tasks: z.array(taskViewSchema.extend({ position: z.number() })),
  }),
  stale: z.object({ session_id: z.string(), last_seen_at: z.string(), seconds: z.number() }).nullable(),
})

/** What every focus action carries (AD-002). */
const actionBody = z.object({ action_id: uuid, occurred_at: z.iso.datetime({ offset: true }), device_id: deviceId })
const taskBody = actionBody.extend({ task_id: uuid })

const toInput = (body: z.infer<typeof actionBody>): FocusActionInput => ({
  actionId: body.action_id.toLowerCase(),
  occurredAt: new Date(body.occurred_at),
  deviceId: body.device_id,
})

export function focusRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]
    const writing = [...reading, requireWrite]
    const response = { 200: focusStateSchema }

    // Every answer of these routes, errors included, tells the client the server's clock (FOCUS-03).
    app.addHook('preSerialization', async (_request, _reply, payload) =>
      payload !== null && typeof payload === 'object' && !Array.isArray(payload) && !('server_now' in payload)
        ? { ...payload, server_now: new Date().toISOString() }
        : payload,
    )

    const actor = (request: { workspace: { user: { id: string }; workspace: { id: string } } }) => ({
      userId: request.workspace.user.id,
      workspaceId: request.workspace.workspace.id,
    })

    typed.get(
      '/api/focus',
      { schema: { querystring: z.object({ list_id: uuid }), response }, preValidation: reading },
      async (request) =>
        readFocusState(ctx.db, request.workspace.user.id, request.workspace.workspace, request.query.list_id.toLowerCase(), new Date()),
    )

    typed.post(
      '/api/focus/start',
      { schema: { body: taskBody.extend({ takeover: z.boolean().optional() }), response }, preValidation: writing },
      async (request) =>
        startFocus(
          ctx.db,
          actor(request),
          toInput(request.body),
          { taskId: request.body.task_id.toLowerCase(), takeover: request.body.takeover ?? false },
          new Date(),
        ),
    )

    typed.post(
      '/api/focus/pause',
      { schema: { body: actionBody, response }, preValidation: writing },
      async (request) => pauseFocus(ctx.db, actor(request), toInput(request.body), new Date()),
    )

    for (const [path, apply] of [
      ['skip', skipFocus],
      ['complete', completeFocus],
      ['extend', extendFocus],
    ] as const) {
      typed.post(
        `/api/focus/${path}`,
        { schema: { body: taskBody, response }, preValidation: writing },
        async (request) => apply(ctx.db, actor(request), toInput(request.body), { taskId: request.body.task_id.toLowerCase() }, new Date()),
      )
    }

    typed.post(
      '/api/focus/break',
      {
        schema: { body: actionBody.extend({ minutes: z.number().int().min(1).max(120), list_id: uuid }), response },
        preValidation: writing,
      },
      async (request) =>
        breakFocus(
          ctx.db,
          actor(request),
          toInput(request.body),
          { minutes: request.body.minutes, listId: request.body.list_id.toLowerCase() },
          new Date(),
        ),
    )

    typed.post(
      '/api/focus/break/end',
      { schema: { body: actionBody, response }, preValidation: writing },
      async (request) => endBreakFocus(ctx.db, actor(request), toInput(request.body), new Date()),
    )

    typed.post(
      '/api/focus/heartbeat',
      { schema: { body: z.object({ device_id: deviceId }), response }, preValidation: writing },
      async (request) => heartbeatFocus(ctx.db, actor(request), { deviceId: request.body.device_id }, new Date()),
    )

    typed.post(
      '/api/focus/recover',
      { schema: { body: actionBody.extend({ decision: z.enum(['keep', 'cut']) }), response }, preValidation: writing },
      async (request) => recoverFocus(ctx.db, actor(request), toInput(request.body), { decision: request.body.decision }, new Date()),
    )
  }
}
