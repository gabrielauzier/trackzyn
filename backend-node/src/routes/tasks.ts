import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import type { Database } from '../db/client.ts'
import { SERIES_FREQS, type Subtask, TASK_COLUMNS } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { withoutNul } from './schemas.ts'
import { createSubtask, deleteSubtask, moveSubtask, updateSubtask } from '../services/subtasks.ts'
import { createTaskFromToken, toTaskIntake } from '../services/task-intake.ts'
import type { RecurrenceRule } from '../services/recurrence.ts'
import { type Schedule, applyDueSchedules, setSchedule } from '../services/schedule.ts'
import { type SeriesScope, applyScheduleToSeries, deleteOccurrence, seriesView, setRecurrence, skipOccurrence } from '../services/series.ts'
import { type TaskWithSubtasks, createTask, duplicateTask, getTask, moveTask, moveTaskToList, updateTask } from '../services/tasks.ts'
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
export const scheduleFields = {
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
/** A recurrence rule as the API takes it (US-7, US-9): the checks of the task_series table. */
export const recurrenceBody = z
  .object({
    freq: z.enum(SERIES_FREQS),
    interval: z.number().int().min(1).max(99).default(1),
    weekdays: z.array(z.number().int().min(1).max(7)).min(1).nullable().optional(),
    month_day: z.number().int().min(1).max(31).nullable().optional(),
    until: z.iso.date('Input should be a valid date (YYYY-MM-DD)').nullable().optional(),
    count: z.number().int().min(1).max(999).nullable().optional(),
  })
  .refine((rule) => (rule.freq === 'weekly') === (rule.weekdays != null), { path: ['weekdays'], message: 'weekdays go with a weekly rule, and only with it' })
  .refine((rule) => (rule.freq === 'monthly') === (rule.month_day != null), {
    path: ['month_day'],
    message: 'month_day goes with a monthly rule, and only with it',
  })
  .refine((rule) => rule.until == null || rule.count == null, { path: ['count'], message: 'A rule ends by until or by count, not both' })
  .transform(
    (rule): RecurrenceRule => ({
      freq: rule.freq,
      interval: rule.interval,
      weekdays: rule.weekdays ?? null,
      monthDay: rule.month_day ?? null,
      until: rule.until ?? null,
      count: rule.count ?? null,
    }),
  )
/** This occurrence of a series, or this one and the next ones (D16). */
const seriesScope = z.enum(['occurrence', 'series'])
/**
 * Leaving `scheduled_on` out keeps the task's day; clearing it with a time is a time without a day. `scope`
 * only counts for an occurrence of a series (D16); `recurrence` makes the task repeat, changes its rule or,
 * with null, stops it (US-9).
 */
const updateTaskRouteBody = updateTaskBody
  .extend({ ...scheduleFields, recurrence: recurrenceBody.nullable().optional(), scope: seriesScope.optional() })
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

/** What PATCH /api/tasks/:id and the update_task tool change: the fields, the schedule and the rule (US-7). */
export interface TaskUpdate {
  title?: string
  estimate_minutes?: number | null
  notes?: string
  scheduled_on?: string | null
  scheduled_time?: string | null
  recurrence?: RecurrenceRule | null
  scope?: SeriesScope
}

/** Applies a `TaskUpdate` in one transaction, so a refused schedule or rule changes nothing. */
export async function updateTaskAndSchedule(db: Database, taskId: string, workspaceId: string, userId: string, body: TaskUpdate): Promise<TaskWithSubtasks> {
  const { title, estimate_minutes, notes, scheduled_on, scheduled_time, recurrence, scope } = body
  const changes = { title, estimateMinutes: estimate_minutes, notes }
  const scheduling = scheduled_on !== undefined || scheduled_time !== undefined
  if (!scheduling && recurrence === undefined) return updateTask(db, taskId, workspaceId, changes)
  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    let updated = await updateTask(tx, taskId, workspaceId, changes)
    if (scheduling) {
      // A field left out keeps its value: a new day keeps the time (US-1); clearing the day clears both (US-2).
      const on = scheduled_on === undefined ? updated.scheduledOn : scheduled_on
      const time = scheduled_time !== undefined ? scheduled_time : on === null ? null : updated.scheduledTime
      // "This and the next ones" moves the rule too; "only this one" changes the task alone (D16).
      updated =
        scope === 'series'
          ? await applyScheduleToSeries(tx, taskId, workspaceId, { on, time }, userId)
          : await setSchedule(tx, taskId, workspaceId, { on, time }, userId)
    }
    // A new rule always counts for the series from there on, without a scope (US-12).
    if (recurrence !== undefined) updated = await setRecurrence(tx, taskId, workspaceId, recurrence)
    return updated
  })
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
        const input = toTaskIntake(request.body)
        const { scheduledOn: on, scheduledTime: time } = input
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
      async (request) => {
        // A task scheduled for today answers its column in Today, as on the board (US-4, AD-009).
        await applyDueSchedules(ctx.db, request.workspace.workspace.id)
        return toTaskRead(await getTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id))
      },
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
        return toTaskRead(await updateTaskAndSchedule(ctx.db, taskId, workspaceId, request.workspace.user.id, request.body))
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
      '/api/tasks/:task_id/skip',
      { schema: { params: taskParams, response: { 200: taskReadSchema } }, config: { tokenScope: 'tasks:write' }, preValidation: writing },
      async (request) =>
        toTaskRead(await skipOccurrence(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id, request.workspace.user.id)),
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
      {
        schema: { params: taskParams, querystring: z.object({ scope: seriesScope.optional() }) },
        config: { tokenScope: 'tasks:delete' },
        preValidation: writing,
      },
      async (request, reply) => {
        // An occurrence of a series is deleted alone by default; `series` also ends the series (US-12).
        await deleteOccurrence(
          ctx.db,
          request.params.task_id.toLowerCase(),
          request.workspace.workspace.id,
          request.query.scope ?? 'occurrence',
          request.workspace.user.id,
        )
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
