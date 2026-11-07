import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { SERIES_FREQS, type Subtask, TASK_COLUMNS } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { withoutNul } from './schemas.ts'
import { createSubtask, deleteSubtask, moveSubtask, updateSubtask } from '../services/subtasks.ts'
import { createTaskFromToken, toTaskIntake } from '../services/task-intake.ts'
import { type Schedule, setSchedule } from '../services/schedule.ts'
import { seriesView } from '../services/series.ts'
import { type TaskWithSubtasks, createTask, deleteTask, duplicateTask, getTask, moveTask, moveTaskToList, updateTask } from '../services/tasks.ts'
import { UUID_PATTERN } from '../services/users.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')

const subtaskReadSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  title: z.string(),
  done: z.boolean(),
  position: z.number(),
})

/** The series of a task: its rule and the next day it projects (US-7). */
export const seriesReadSchema = z.object({
  id: z.string(),
  rule: z.object({
    freq: z.enum(SERIES_FREQS),
    interval: z.number(),
    weekdays: z.array(z.number()).nullable(),
    month_day: z.number().nullable(),
    until: z.string().nullable(),
    count: z.number().nullable(),
  }),
  next_on: z.string().nullable(),
})

export const taskReadSchema = z.object({
  id: z.string(),
  list_id: z.string(),
  title: z.string(),
  notes: z.string(),
  estimate_minutes: z.number().nullable(),
  column: z.enum(TASK_COLUMNS),
  position: z.number(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  subtasks: z.array(subtaskReadSchema),
  created_via: z.string().nullable(),
  scheduled_on: z.string().nullable(),
  scheduled_time: z.string().nullable(),
  series: seriesReadSchema.nullable(),
})

export const taskParams = z.object({ task_id: uuid })
const subtaskParams = z.object({ subtask_id: uuid })
const title = withoutNul(z.string().min(1).max(255))
const notes = withoutNul(z.string().max(10_000))
const estimateMinutes = z.number().int().min(1).max(1440).nullable()
const column = z.enum(TASK_COLUMNS)

/** What creating a task accepts, in REST and in MCP. Feed its output to `toTaskIntake`. */
export const createTaskBody = z.object({
  list_id: uuid,
  title,
  estimate_minutes: estimateMinutes.optional(),
  column: column.default('backlog'),
  notes: notes.optional(),
  subtasks: z.array(title).max(50).optional(),
})

export const updateTaskBody = z.object({ title: title.optional(), estimate_minutes: estimateMinutes.optional(), notes: notes.optional() })

/** The day (`YYYY-MM-DD`) and start time (`HH:MM`, in steps of 15 minutes) of a task, in the workspace's timezone (US-7). */
const scheduleFields = {
  scheduled_on: z.iso.date('Input should be a valid date (YYYY-MM-DD)').nullable().optional(),
  scheduled_time: z
    .string()
    .regex(/^([01]\d|2[0-3]):(00|15|30|45)$/, 'Input should be a time in steps of 15 minutes (HH:MM)')
    .nullable()
    .optional(),
}
const timeNeedsDay = { path: ['scheduled_time'], message: 'scheduled_time needs scheduled_on' }
/** A new task has no day of its own: its time needs one in the same body. */
const createTaskRouteBody = createTaskBody
  .extend(scheduleFields)
  .refine((body) => body.scheduled_time == null || body.scheduled_on != null, timeNeedsDay)
/** Leaving `scheduled_on` out keeps the task's day; clearing it with a time is a time without a day. */
const updateTaskRouteBody = updateTaskBody
  .extend(scheduleFields)
  .refine((body) => body.scheduled_time == null || body.scheduled_on !== null, timeNeedsDay)
export const moveTaskBody = z.object({ column, before_task_id: uuid.nullable() })
export const addSubtaskBody = z.object({ title })

/** In the handler and not in the schema: with the session JWT the header is not even read (IDEM-08). */
function idempotencyKey(request: FastifyRequest): string | undefined {
  const key = request.headers['idempotency-key'] as string | undefined
  if (key === undefined) return undefined
  const loc = ['header', 'idempotency-key']
  if (key === '') throw new HttpError(422, [{ type: 'string_too_short', loc, msg: 'String should have at least 1 characters' }])
  if (key.length > 255) throw new HttpError(422, [{ type: 'string_too_long', loc, msg: 'String should have at most 255 characters' }])
  return key
}

export function toSubtaskRead(subtask: Subtask) {
  return { id: subtask.id, task_id: subtask.taskId, title: subtask.title, done: subtask.done, position: subtask.position }
}

export function toTaskRead(task: TaskWithSubtasks) {
  return {
    id: task.id,
    list_id: task.listId,
    title: task.title,
    notes: task.notes,
    estimate_minutes: task.estimateMinutes,
    column: task.column,
    position: task.position,
    completed_at: task.completedAt?.toISOString() ?? null,
    created_at: task.createdAt.toISOString(),
    subtasks: task.subtasks.map(toSubtaskRead),
    created_via: task.createdVia,
    scheduled_on: task.scheduledOn,
    scheduled_time: task.scheduledTime?.slice(0, 5) ?? null,
    series: task.series === null ? null : seriesView(task.series, task.scheduledOn),
  }
}

export function taskRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]
    const writing = [...reading, requireWrite]

    typed.post(
      '/api/tasks',
      {
        schema: {
          body: createTaskRouteBody,
          response: { 201: taskReadSchema },
        },
        config: { tokenScope: 'tasks:create' },
        preValidation: writing,
      },
      async (request, reply) => {
        const workspaceId = request.workspace.workspace.id
        const userId = request.workspace.user.id
        const { scheduled_on: on, scheduled_time: time, ...body } = request.body
        const input = toTaskIntake(body)
        const principal = request.tokenPrincipal
        const create = async (db: typeof ctx.db) =>
          principal
            ? createTaskFromToken(db, workspaceId, principal, input, idempotencyKey(request))
            : { task: await createTask(db, workspaceId, { ...input, userId }), replayed: false }
        const schedule: Schedule | null = on == null ? null : { on, time: time ?? null }
        // Created and scheduled in one transaction, so a refused schedule creates nothing. The rules of saving
        // take the new task from its column to This week or Today by its day (D3, D12, D21).
        const { task, replayed } =
          schedule === null
            ? await create(ctx.db)
            : await ctx.db.transaction(async (transaction) => {
                const tx = transaction as typeof ctx.db
                const created = await create(tx)
                if (created.replayed) return created
                return { task: await setSchedule(tx, created.task.id, workspaceId, schedule, userId), replayed: false }
              })
        if (replayed) reply.header('Idempotency-Replayed', 'true')
        return reply.code(201).send(toTaskRead(task))
      },
    )

    typed.get(
      '/api/tasks/:task_id',
      { schema: { params: taskParams, response: { 200: taskReadSchema } }, config: { tokenScope: 'tasks:read' }, preValidation: reading },
      async (request) => toTaskRead(await getTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id)),
    )

    typed.patch(
      '/api/tasks/:task_id',
      {
        schema: {
          params: taskParams,
          body: updateTaskRouteBody,
          response: { 200: taskReadSchema },
        },
        config: { tokenScope: 'tasks:write' },
        preValidation: writing,
      },
      async (request) => {
        const taskId = request.params.task_id.toLowerCase()
        const workspaceId = request.workspace.workspace.id
        const { title, estimate_minutes, notes, scheduled_on, scheduled_time } = request.body
        const changes = { title, estimateMinutes: estimate_minutes, notes }
        if (scheduled_on === undefined && scheduled_time === undefined) return toTaskRead(await updateTask(ctx.db, taskId, workspaceId, changes))
        return toTaskRead(
          await ctx.db.transaction(async (transaction) => {
            const tx = transaction as typeof ctx.db
            const updated = await updateTask(tx, taskId, workspaceId, changes)
            // A field left out keeps its value: a new day keeps the time (US-1); clearing the day clears both (US-2).
            const on = scheduled_on === undefined ? updated.scheduledOn : scheduled_on
            const time = scheduled_time !== undefined ? scheduled_time : on === null ? null : updated.scheduledTime
            return setSchedule(tx, taskId, workspaceId, { on, time }, request.workspace.user.id)
          }),
        )
      },
    )

    typed.post(
      '/api/tasks/:task_id/move',
      {
        schema: {
          params: taskParams,
          body: moveTaskBody,
          response: { 200: taskReadSchema },
        },
        config: { tokenScope: 'tasks:write' },
        preValidation: writing,
      },
      async (request) =>
        toTaskRead(
          await moveTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id, {
            column: request.body.column,
            beforeTaskId: request.body.before_task_id?.toLowerCase() ?? null,
            byUserId: request.workspace.user.id,
          }),
        ),
    )

    typed.post(
      '/api/tasks/:task_id/duplicate',
      { schema: { params: taskParams, response: { 201: taskReadSchema } }, config: { tokenScope: 'tasks:write' }, preValidation: writing },
      async (request, reply) =>
        reply
          .code(201)
          .send(toTaskRead(await duplicateTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id))),
    )

    typed.post(
      '/api/tasks/:task_id/move-to-list',
      {
        schema: { params: taskParams, body: z.object({ list_id: uuid }), response: { 200: taskReadSchema } },
        config: { tokenScope: 'tasks:write' },
        preValidation: writing,
      },
      async (request) =>
        toTaskRead(
          await moveTaskToList(
            ctx.db,
            request.params.task_id.toLowerCase(),
            request.workspace.workspace.id,
            request.body.list_id.toLowerCase(),
          ),
        ),
    )

    typed.delete(
      '/api/tasks/:task_id',
      { schema: { params: taskParams }, config: { tokenScope: 'tasks:delete' }, preValidation: writing },
      async (request, reply) => {
        await deleteTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id)
        return reply.code(204).send()
      },
    )

    typed.post(
      '/api/tasks/:task_id/subtasks',
      {
        schema: { params: taskParams, body: addSubtaskBody, response: { 201: subtaskReadSchema } },
        config: { tokenScope: 'tasks:write' },
        preValidation: writing,
      },
      async (request, reply) => {
        const subtask = await createSubtask(
          ctx.db,
          request.params.task_id.toLowerCase(),
          request.workspace.workspace.id,
          request.body.title,
        )
        return reply.code(201).send(toSubtaskRead(subtask))
      },
    )

    typed.patch(
      '/api/subtasks/:subtask_id',
      {
        schema: {
          params: subtaskParams,
          body: z.object({ title: title.optional(), done: z.boolean().optional() }),
          response: { 200: subtaskReadSchema },
        },
        config: { tokenScope: 'tasks:write' },
        preValidation: writing,
      },
      async (request) =>
        toSubtaskRead(
          await updateSubtask(ctx.db, request.params.subtask_id.toLowerCase(), request.workspace.workspace.id, {
            title: request.body.title,
            done: request.body.done,
          }),
        ),
    )

    typed.post(
      '/api/subtasks/:subtask_id/move',
      {
        schema: {
          params: subtaskParams,
          body: z.object({ before_subtask_id: uuid.nullable() }),
          response: { 200: subtaskReadSchema },
        },
        config: { tokenScope: 'tasks:write' },
        preValidation: writing,
      },
      async (request) =>
        toSubtaskRead(
          await moveSubtask(
            ctx.db,
            request.params.subtask_id.toLowerCase(),
            request.workspace.workspace.id,
            request.body.before_subtask_id?.toLowerCase() ?? null,
          ),
        ),
    )

    typed.delete(
      '/api/subtasks/:subtask_id',
      { schema: { params: subtaskParams }, config: { tokenScope: 'tasks:delete' }, preValidation: writing },
      async (request, reply) => {
        await deleteSubtask(ctx.db, request.params.subtask_id.toLowerCase(), request.workspace.workspace.id)
        return reply.code(204).send()
      },
    )
  }
}
