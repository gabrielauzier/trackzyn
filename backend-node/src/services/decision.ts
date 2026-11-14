import { z } from 'zod'
import { PRIORITIES, TASK_COLUMNS, type TaskColumn } from '../db/schema.ts'
import { UUID_PATTERN } from './users.ts'

/** PostgreSQL text cannot hold a NUL character, as `withoutNul` of the routes. */
const withoutNul = (schema: z.ZodString) => schema.refine((value) => !value.includes('\0'), 'Input should not contain a NUL character')
const uuid = z.string().regex(UUID_PATTERN, 'Input should be a valid UUID')
/** A task's name: the limits of a task title. */
const title = withoutNul(z.string().trim().min(1).max(255))
/** Left out, the name is the item's text (QUICK-04); a text over 255 characters then needs a name (QUICK-07). */
const name = title.optional()
const notes = withoutNul(z.string().max(10_000))
const estimateMinutes = z.number().int().min(1).max(1440)
const day = z.iso.date('Input should be a valid date (YYYY-MM-DD)')
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Input should be a time (HH:MM)')
const timeNeedsDay = { path: ['scheduled_time'], message: 'scheduled_time needs scheduled_on' }

/** What a task and a reminder share: name, list, priority, due day (a reminder refuses it), schedule, notes and the column chosen in `Vai para`. */
const plannedFields = {
  name,
  list_id: uuid,
  priority: z.enum(PRIORITIES).default('none'),
  due_on: day.nullable().optional(),
  scheduled_on: day.nullable().optional(),
  scheduled_time: time.nullable().optional(),
  notes: notes.optional(),
  /** Overrides the column of the schedule (PROC-04). */
  column: z.enum(TASK_COLUMNS).optional(),
}

/**
 * How an inbox item is processed, in a send and in a Processar tudo draft: a task, a reminder (no estimate,
 * REM-02), a group with its first tasks in order (GRP-01, GRP-02), a task done right away (PROC-06), or the trash.
 */
export const decisionSchema = z.discriminatedUnion('type', [
  z
    .object({ type: z.literal('task'), ...plannedFields, estimate_minutes: estimateMinutes.nullable().optional() })
    .refine((decision) => decision.scheduled_time == null || decision.scheduled_on != null, timeNeedsDay),
  z
    .object({
      type: z.literal('reminder'),
      ...plannedFields,
      /** A reminder has no estimate: any value is refused (REM-02). */
      estimate_minutes: z.null({ error: 'A reminder has no estimate' }).optional(),
      /** Nor a due day (MODAL-06). */
      due_on: z.null({ error: 'A reminder has no due day' }).optional(),
    })
    .refine((decision) => decision.scheduled_time == null || decision.scheduled_on != null, timeNeedsDay),
  z.object({
    type: z.literal('group'),
    name,
    list_id: uuid,
    priority: z.enum(PRIORITIES).default('none'),
    due_on: day.nullable().optional(),
    notes: notes.optional(),
    column: z.enum(TASK_COLUMNS).optional(),
    tasks: z
      .array(z.object({ title, estimate_minutes: estimateMinutes.nullable().optional() }))
      .min(1, 'Adicione a primeira tarefa')
      .max(50),
  }),
  z.object({ type: z.literal('done'), name, list_id: uuid }),
  z.object({ type: z.literal('discard') }),
])

export type Decision = z.infer<typeof decisionSchema>

/**
 * The column a processed item goes to (PROC-03): no day → Backlog; today or a day already past → Today (a
 * past day would come to Today on the next read, D31); another day of this week, up to Sunday → This week;
 * later → Backlog. A column chosen in `Vai para` wins (PROC-04). Days are `YYYY-MM-DD` in the workspace's
 * timezone (AD-004), so they compare as text.
 */
export function targetColumn(scheduledOn: string | null | undefined, today: string, weekEnd: string, chosen?: TaskColumn): TaskColumn {
  if (chosen !== undefined) return chosen
  if (scheduledOn == null) return 'backlog'
  if (scheduledOn <= today) return 'today'
  return scheduledOn <= weekEnd ? 'this_week' : 'backlog'
}

/**
 * A line typed in the new task field of a group (GRP-03): an `H:MM` or `HH:MM` at the end, from 00:01 to
 * 24:00, is the estimate and the rest the title; anything else is all title.
 */
// SPEC_DEVIATION: design.md puts parseTaskLine in `shared/`.
// Reason: the repository has no package shared by the backend and the frontend; the frontend mirrors this rule.
export function parseTaskLine(text: string): { title: string; estimate_minutes: number | null } {
  const trimmed = text.trim()
  const match = /^(.*\S)\s+(\d{1,2}):([0-5]\d)$/.exec(trimmed)
  if (match) {
    const minutes = Number(match[2]) * 60 + Number(match[3])
    if (minutes >= 1 && minutes <= 1440) return { title: match[1]!, estimate_minutes: minutes }
  }
  return { title: trimmed, estimate_minutes: null }
}
