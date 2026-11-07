import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { HttpError, forbidden } from '../http/http-error.ts'
import { zodIssueToItem } from '../plugins/errors.ts'
import { type WorkspaceContext, ensureWritable } from '../plugins/workspace.ts'
import { listParams, listsView } from '../routes/lists.ts'
import { withoutNul } from '../routes/schemas.ts'
import {
  addSubtaskBody,
  createTaskBody,
  moveTaskBody,
  recurrenceBody,
  scheduleFields,
  taskParams,
  toSubtaskRead,
  toTaskRead,
  updateTaskAndSchedule,
  updateTaskBody,
} from '../routes/tasks.ts'
import type { TokenPrincipal, TokenScope } from '../services/access-tokens.ts'
import { buildBoard } from '../services/board.ts'
import { createSubtask } from '../services/subtasks.ts'
import type { Database } from '../db/client.ts'
import { applyDueSchedules, setSchedule } from '../services/schedule.ts'
import { deleteOccurrence, setRecurrence } from '../services/series.ts'
import { createTaskFromToken, toTaskIntake } from '../services/task-intake.ts'
import { getTask, moveTask } from '../services/tasks.ts'

/** Who is calling and from where, as the guards of `POST /api/mcp` left them. */
export interface ToolCaller {
  ctx: AppContext
  workspace: WorkspaceContext
  principal: TokenPrincipal
}

interface Tool<Input extends z.ZodObject = z.ZodObject> {
  name: string
  description: string
  scope: TokenScope
  /** A write tool answers `Read-only role` to a viewer, as `requireWrite` does on the REST routes. */
  write: boolean
  input: Input
  /** The arguments the REST route takes in the path; the rest it takes in the body. Validation errors say so. */
  pathArguments?: readonly string[]
  run(caller: ToolCaller, args: z.output<Input>): Promise<unknown>
}

const tool = <Input extends z.ZodObject>(definition: Tool<Input>) => definition as unknown as Tool

/** The same schema, carrying the text an agent reads to decide what to send. */
function described<Input extends z.ZodObject>(input: Input, texts: { [Field in keyof Input['shape']]: string }): Input {
  const shape = Object.fromEntries(Object.entries(input.shape).map(([field, schema]) => [field, (schema as z.ZodType).describe(texts[field as keyof Input['shape']])]))
  return z.object(shape) as unknown as Input
}

const TASK_ID = 'The id of the task, as returned by get_board or create_task.'

/** The schedule fields of create_task and update_task (US-7). */
const scheduleInput = { ...scheduleFields, recurrence: recurrenceBody.nullable().optional() }
const SCHEDULE_TEXTS = {
  scheduled_on: 'The day to do the task (YYYY-MM-DD) in the workspace timezone, or null for none. A day of this week takes a backlog task to this_week; today takes it to today; an earlier day takes it to today on the next read of the board.',
  scheduled_time: 'The start time (HH:MM, in steps of 15 minutes) in the workspace timezone, or null for none. Needs scheduled_on.',
  recurrence:
    'Makes the task repeat from scheduled_on, or null to stop. {freq: daily | weekly | monthly, interval: 1 to 99, weekdays: [1 (Monday) to 7 (Sunday)] for weekly, month_day: 1 to 31 for monthly, until: YYYY-MM-DD or count: 1 to 999 to end it}. The next occurrence is created when this one is completed. Needs scheduled_on.',
}

const TOOLS: readonly Tool[] = [
  tool({
    name: 'list_lists',
    description: 'List the active task lists of the workspace, with their ids and pending task counts. Call this first to find the list_id the other tools need. Each list previews some task titles only if the token has the tasks:read scope.',
    scope: 'lists:read',
    write: false,
    input: z.object({}),
    run: ({ ctx, workspace, principal }) => listsView(ctx, workspace.workspace, principal, false),
  }),
  tool({
    name: 'get_board',
    description: 'Get the board of a list: its tasks grouped by column (backlog, this_week, today, done), with estimates, time spent, subtask progress, the scheduled day and time and the recurrence rule with its next day.',
    scope: 'tasks:read',
    write: false,
    input: described(listParams, { list_id: 'The id of the list, as returned by list_lists.' }),
    pathArguments: ['list_id'],
    run: async ({ ctx, workspace }, { list_id }) => {
      const now = new Date()
      // The tasks scheduled for today come to Today before the board is read, as on the REST board (US-4, AD-009).
      await applyDueSchedules(ctx.db, workspace.workspace.id, now)
      return buildBoard(ctx.db, list_id.toLowerCase(), workspace.workspace, workspace.user.id, now)
    },
  }),
  tool({
    name: 'get_task',
    description: 'Get one task with its notes, estimate, column, subtasks, scheduled day and time and the recurrence rule with its next day.',
    scope: 'tasks:read',
    write: false,
    input: described(taskParams, { task_id: TASK_ID }),
    pathArguments: ['task_id'],
    run: async ({ ctx, workspace }, { task_id }) => {
      // A task scheduled for today answers its column in Today, as on the board (US-4, AD-009).
      await applyDueSchedules(ctx.db, workspace.workspace.id)
      return toTaskRead(await getTask(ctx.db, task_id.toLowerCase(), workspace.workspace.id))
    },
  }),
  tool({
    name: 'create_task',
    description: 'Create a task in a list, optionally with notes, an estimate, subtasks, a scheduled day and time and a recurrence. It goes to the end of its column. Send an idempotency_key when you may retry, so that a retry does not create the task twice. The list must not be archived.',
    scope: 'tasks:create',
    write: true,
    input: described(createTaskBody.extend({ ...scheduleInput, idempotency_key: withoutNul(z.string().min(1).max(255)).optional() }), {
      ...SCHEDULE_TEXTS,
      list_id: 'The id of the list, as returned by list_lists.',
      title: 'The title of the task, 1 to 255 characters.',
      estimate_minutes: 'How long the task should take, from 1 to 1440 minutes, or null for no estimate.',
      column: 'The board column: backlog (the default), this_week, today or done.',
      notes: 'Free text notes about the task, up to 10000 characters.',
      subtasks: 'Subtask titles in order, up to 50, each 1 to 255 characters.',
      idempotency_key: 'Any unique string, up to 255 characters. Within 24 hours, the same key with the same arguments returns the same task and replayed: true instead of creating another; with other arguments it fails.',
    }),
    run: async ({ ctx, workspace, principal }, { idempotency_key, recurrence, ...body }) => {
      const workspaceId = workspace.workspace.id
      const input = toTaskIntake({ ...body, recurrence })
      const on = input.scheduledOn ?? null
      const time = input.scheduledTime ?? null
      // Created, scheduled and made to repeat in one transaction, so a refused schedule or rule creates nothing:
      // a time or a rule without a day is refused with 422 (US-7).
      const { task, replayed } = await ctx.db.transaction(async (transaction) => {
        const tx = transaction as Database
        const created = await createTaskFromToken(tx, workspaceId, principal, input, idempotency_key)
        if (created.replayed) return created
        let scheduled = created.task
        if (on !== null || time !== null) scheduled = await setSchedule(tx, scheduled.id, workspaceId, { on, time }, workspace.user.id)
        if (recurrence != null) scheduled = await setRecurrence(tx, scheduled.id, workspaceId, recurrence)
        return { task: scheduled, replayed: false }
      })
      return { ...toTaskRead(task), replayed }
    },
  }),
  tool({
    name: 'update_task',
    description: 'Change the title, estimate, notes, scheduled day and time or recurrence of a task. Send only the fields to change; a new day keeps the time. To change its column, use move_task.',
    scope: 'tasks:write',
    write: true,
    input: described(taskParams.extend({ ...updateTaskBody.shape, ...scheduleInput }), {
      ...SCHEDULE_TEXTS,
      task_id: TASK_ID,
      title: 'The new title, 1 to 255 characters.',
      estimate_minutes: 'The new estimate, from 1 to 1440 minutes, or null to remove it.',
      notes: 'The new notes, replacing the current ones, up to 10000 characters.',
    }),
    pathArguments: ['task_id'],
    run: async ({ ctx, workspace }, { task_id, ...changes }) =>
      toTaskRead(await updateTaskAndSchedule(ctx.db, task_id.toLowerCase(), workspace.workspace.id, workspace.user.id, changes)),
  }),
  tool({
    name: 'move_task',
    description: 'Move a task to a board column, at a chosen position. Moving it to done marks it as completed; moving it out of done clears that.',
    scope: 'tasks:write',
    write: true,
    input: described(taskParams.extend(moveTaskBody.shape), {
      task_id: TASK_ID,
      column: 'The target column: backlog, this_week, today or done.',
      before_task_id: 'The id of the task in that column to place it right before, or null to place it at the end.',
    }),
    pathArguments: ['task_id'],
    run: async ({ ctx, workspace }, { task_id, column, before_task_id }) =>
      toTaskRead(await moveTask(ctx.db, task_id.toLowerCase(), workspace.workspace.id, { column, beforeTaskId: before_task_id?.toLowerCase() ?? null, byUserId: workspace.user.id })),
  }),
  tool({
    name: 'add_subtask',
    description: 'Add a subtask to the end of a task.',
    scope: 'tasks:write',
    write: true,
    input: described(taskParams.extend(addSubtaskBody.shape), {
      task_id: TASK_ID,
      title: 'The title of the subtask, 1 to 255 characters.',
    }),
    pathArguments: ['task_id'],
    run: async ({ ctx, workspace }, { task_id, title }) => toSubtaskRead(await createSubtask(ctx.db, task_id.toLowerCase(), workspace.workspace.id, title)),
  }),
  tool({
    name: 'delete_task',
    description:
      'Delete a task with its subtasks and the time recorded on it. This cannot be undone. On a repeating task, it deletes only this occurrence and creates the next one; the recurrence goes on.',
    scope: 'tasks:delete',
    write: true,
    input: described(taskParams, { task_id: TASK_ID }),
    pathArguments: ['task_id'],
    run: async ({ ctx, workspace }, { task_id }) => {
      const id = task_id.toLowerCase()
      // As REST DELETE without a scope: an occurrence is deleted alone and the next one is created (US-12, D13).
      await deleteOccurrence(ctx.db, id, workspace.workspace.id, 'occurrence', workspace.user.id)
      return { id, deleted: true }
    },
  }),
]

/** `tools/list`: only what the scopes of the token reach (MCP-02). */
export function listTools(principal: TokenPrincipal) {
  return TOOLS.filter((candidate) => principal.scopes.includes(candidate.scope)).map(({ name, description, input }) => ({
    name,
    description,
    // The input side: a field with a default is optional to whoever calls.
    inputSchema: z.toJSONSchema(input, { io: 'input' }) as { type: 'object'; [key: string]: unknown },
  }))
}

const text = (value: string) => [{ type: 'text' as const, text: value }]

/**
 * `tools/call`: known tool, scope, role, arguments and only then the work. A failure the REST route would
 * answer becomes `isError` with the same text (MCP-06); anything else propagates to the caller.
 */
export async function callTool(caller: ToolCaller, name: string, args: unknown) {
  const called = TOOLS.find((candidate) => candidate.name === name)
  if (!called) return { isError: true, content: text(`Unknown tool: ${name}`) }
  try {
    if (!caller.principal.scopes.includes(called.scope)) throw forbidden(`Missing scope: ${called.scope}`)
    if (called.write) ensureWritable(caller.workspace)
    const parsed = called.input.safeParse(args ?? {})
    if (!parsed.success) {
      const rootOf = (field: unknown) => (called.pathArguments?.includes(String(field)) ? 'path' : 'body')
      throw new HttpError(422, parsed.error.issues.map((issue) => zodIssueToItem(issue, rootOf(issue.path[0]))))
    }
    return { content: text(JSON.stringify(await called.run(caller, parsed.data))) }
  } catch (error) {
    if (error instanceof HttpError) return { isError: true, content: text(error.message) }
    throw error
  }
}
