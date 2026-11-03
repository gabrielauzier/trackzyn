import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { HttpError, forbidden } from '../http/http-error.ts'
import { zodIssueToItem } from '../plugins/errors.ts'
import { type WorkspaceContext, ensureWritable } from '../plugins/workspace.ts'
import { listParams, listsView } from '../routes/lists.ts'
import { createTaskBody, taskParams, toTaskRead } from '../routes/tasks.ts'
import type { TokenPrincipal, TokenScope } from '../services/access-tokens.ts'
import { buildBoard } from '../services/board.ts'
import { createTaskFromToken, toTaskIntake } from '../services/task-intake.ts'
import { getTask } from '../services/tasks.ts'

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
    description: 'Get the board of a list: its tasks grouped by column (backlog, this_week, today, done), with estimates, time spent and subtask progress.',
    scope: 'tasks:read',
    write: false,
    input: described(listParams, { list_id: 'The id of the list, as returned by list_lists.' }),
    pathArguments: ['list_id'],
    run: ({ ctx, workspace }, { list_id }) => buildBoard(ctx.db, list_id.toLowerCase(), workspace.workspace, workspace.user.id),
  }),
  tool({
    name: 'get_task',
    description: 'Get one task with its notes, estimate, column and subtasks.',
    scope: 'tasks:read',
    write: false,
    input: described(taskParams, { task_id: 'The id of the task, as returned by get_board.' }),
    pathArguments: ['task_id'],
    run: async ({ ctx, workspace }, { task_id }) => toTaskRead(await getTask(ctx.db, task_id.toLowerCase(), workspace.workspace.id)),
  }),
  tool({
    name: 'create_task',
    description: 'Create a task in a list, optionally with notes, an estimate and subtasks. It goes to the end of its column. Send an idempotency_key when you may retry, so that a retry does not create the task twice. The list must not be archived.',
    scope: 'tasks:create',
    write: true,
    input: described(createTaskBody.extend({ idempotency_key: z.string().min(1).max(255).optional() }), {
      list_id: 'The id of the list, as returned by list_lists.',
      title: 'The title of the task, 1 to 255 characters.',
      estimate_minutes: 'How long the task should take, from 1 to 1440 minutes, or null for no estimate.',
      column: 'The board column: backlog (the default), this_week, today or done.',
      notes: 'Free text notes about the task, up to 10000 characters.',
      subtasks: 'Subtask titles in order, up to 50, each 1 to 255 characters.',
      idempotency_key: 'Any unique string, up to 255 characters. Within 24 hours, the same key with the same arguments returns the same task and replayed: true instead of creating another; with other arguments it fails.',
    }),
    run: async ({ ctx, workspace, principal }, { idempotency_key, ...body }) => {
      const { task, replayed } = await createTaskFromToken(ctx.db, workspace.workspace.id, principal, toTaskIntake(body), idempotency_key)
      return { ...toTaskRead(task), replayed }
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
