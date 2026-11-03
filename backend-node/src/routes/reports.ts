import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import { z } from 'zod'
import type { AppContext } from '../context.ts'
import { authGuards } from '../plugins/auth.ts'
import { workspaceContext } from '../plugins/workspace.ts'
import { type ReportFilter, overview } from '../services/reports.ts'
import { sessionsReport } from '../services/reports-sessions.ts'
import { UUID_PATTERN } from '../services/users.ts'

/** The longest period, both ends included (REPORT-13). */
export const MAX_REPORT_DAYS = 366
const DAY_MS = 24 * 60 * 60 * 1000

const period = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    list_id: z.string().regex(UUID_PATTERN, 'Input should be a valid UUID').optional(),
  })
  .superRefine((query, issues) => {
    const days = (Date.parse(query.to) - Date.parse(query.from)) / DAY_MS + 1
    if (days < 1) issues.addIssue({ code: 'custom', path: ['to'], message: 'The period must not end before it starts' })
    else if (days > MAX_REPORT_DAYS)
      issues.addIssue({ code: 'custom', path: ['to'], message: `The period can have at most ${MAX_REPORT_DAYS} days` })
  })

const toFilter = (query: z.infer<typeof period>): ReportFilter => ({
  from: query.from,
  to: query.to,
  listId: query.list_id?.toLowerCase() ?? null,
})

const doneTask = z.object({
  id: z.string(),
  title: z.string(),
  list_id: z.string(),
  spent_seconds: z.number(),
  estimate_minutes: z.number().nullable(),
  verdict: z.enum(['early', 'on_time', 'late']).nullable(),
  diff_seconds: z.number(),
})

const overviewSchema = z.object({
  timezone: z.string(),
  range: z.object({ from: z.string(), to: z.string() }),
  tiles: z.object({
    work_days: z.number(),
    tasks_done: z.number(),
    task_seconds: z.number(),
    avg_seconds_per_task: z.number().nullable(),
  }),
  daily: z.array(z.object({ date: z.string(), task_seconds: z.number(), break_seconds: z.number() })),
  productive: z.object({ hours: z.array(z.number()), weekdays: z.array(z.number()), months: z.array(z.string()) }),
  by_list: z.array(
    z.object({ list_id: z.string(), name: z.string(), color: z.number(), is_archived: z.boolean(), seconds: z.number() }),
  ),
  break_seconds: z.number(),
  done: z.object({
    days: z.array(z.object({ date: z.string(), tasks: z.array(doneTask) })),
    early_or_on_time_pct: z.number().nullable(),
    late_pct: z.number().nullable(),
  }),
})

const sessionsSchema = z.object({
  days: z.array(
    z.object({
      date: z.string(),
      sessions: z.array(
        z.object({
          id: z.string(),
          kind: z.enum(['task', 'break']),
          task_title: z.string().nullable(),
          list_name: z.string(),
          started_at: z.string(),
          ended_at: z.string().nullable(),
          seconds: z.number(),
        }),
      ),
    }),
  ),
})

/** Read-only reports of the logged-in user's own time; a viewer reads theirs too. */
export function reportRoutes(ctx: AppContext) {
  return async (app: FastifyInstance): Promise<void> => {
    const typed = app.withTypeProvider<ZodTypeProvider>()
    const { requireUser } = authGuards(ctx)
    const reading = [requireUser, workspaceContext(ctx)]

    typed.get(
      '/api/reports/overview',
      { schema: { querystring: period, response: { 200: overviewSchema } }, preValidation: reading },
      async (request) =>
        overview(ctx.db, request.workspace.user.id, request.workspace.workspace, toFilter(request.query), new Date()),
    )

    typed.get(
      '/api/reports/sessions',
      { schema: { querystring: period, response: { 200: sessionsSchema } }, preValidation: reading },
      async (request) =>
        sessionsReport(ctx.db, request.workspace.user.id, request.workspace.workspace, toFilter(request.query), new Date()),
    )
  }
}
