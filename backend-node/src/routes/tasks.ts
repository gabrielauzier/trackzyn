import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { type Subtask, TASK_COLUMNS } from '../db/schema.ts'
import { authGuards } from '../plugins/auth.ts'
import { requireWrite, workspaceContext } from '../plugins/workspace.ts'
import { createSubtask, deleteSubtask, updateSubtask } from '../services/subtasks.ts'
import { type TaskWithSubtasks, createTask, deleteTask, getTask, moveTask, updateTask } from '../services/tasks.ts'
import { UUID_PATTERN } from '../services/users.ts'

const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')

const subtaskReadSchema = z.object({
  id: z.string(),
  task_id: z.string(),
  title: z.string(),
  done: z.boolean(),
  position: z.number(),
})

const taskReadSchema = z.object({
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
})

const taskParams = z.object({ task_id: uuid })
const subtaskParams = z.object({ subtask_id: uuid })
const title = z.string().min(1).max(255)
const estimateMinutes = z.number().int().min(1).max(1440).nullable()
const column = z.enum(TASK_COLUMNS)

function toSubtaskRead(subtask: Subtask) {
  return { id: subtask.id, task_id: subtask.taskId, title: subtask.title, done: subtask.done, position: subtask.position }
}

function toTaskRead(task: TaskWithSubtasks) {
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
          body: z.object({ list_id: uuid, title, estimate_minutes: estimateMinutes.optional(), column }),
          response: { 201: taskReadSchema },
        },
        preValidation: writing,
      },
      async (request, reply) => {
        const task = await createTask(ctx.db, request.workspace.workspace.id, {
          listId: request.body.list_id.toLowerCase(),
          title: request.body.title,
          estimateMinutes: request.body.estimate_minutes ?? null,
          column: request.body.column,
        })
        return reply.code(201).send(toTaskRead(task))
      },
    )

    typed.get(
      '/api/tasks/:task_id',
      { schema: { params: taskParams, response: { 200: taskReadSchema } }, preValidation: reading },
      async (request) => toTaskRead(await getTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id)),
    )

    typed.patch(
      '/api/tasks/:task_id',
      {
        schema: {
          params: taskParams,
          body: z.object({ title: title.optional(), estimate_minutes: estimateMinutes.optional(), notes: z.string().max(10_000).optional() }),
          response: { 200: taskReadSchema },
        },
        preValidation: writing,
      },
      async (request) =>
        toTaskRead(
          await updateTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id, {
            title: request.body.title,
            estimateMinutes: request.body.estimate_minutes,
            notes: request.body.notes,
          }),
        ),
    )

    typed.post(
      '/api/tasks/:task_id/move',
      {
        schema: {
          params: taskParams,
          body: z.object({ column, before_task_id: uuid.nullable() }),
          response: { 200: taskReadSchema },
        },
        preValidation: writing,
      },
      async (request) =>
        toTaskRead(
          await moveTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id, {
            column: request.body.column,
            beforeTaskId: request.body.before_task_id?.toLowerCase() ?? null,
          }),
        ),
    )

    typed.delete(
      '/api/tasks/:task_id',
      { schema: { params: taskParams }, preValidation: writing },
      async (request, reply) => {
        await deleteTask(ctx.db, request.params.task_id.toLowerCase(), request.workspace.workspace.id)
        return reply.code(204).send()
      },
    )

    typed.post(
      '/api/tasks/:task_id/subtasks',
      { schema: { params: taskParams, body: z.object({ title }), response: { 201: subtaskReadSchema } }, preValidation: writing },
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

    typed.delete(
      '/api/subtasks/:subtask_id',
      { schema: { params: subtaskParams }, preValidation: writing },
      async (request, reply) => {
        await deleteSubtask(ctx.db, request.params.subtask_id.toLowerCase(), request.workspace.workspace.id)
        return reply.code(204).send()
      },
    )
  }
}
