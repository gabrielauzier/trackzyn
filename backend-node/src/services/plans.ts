import { randomUUID } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { dayPlanBlocks, dayPlans, lists, tasks, users } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { applyDueSchedules, setSchedule, workspaceClock } from './schedule.ts'

/** Who reads or writes a plan: the logged-in user in the current workspace (PLAN-D2). */
export interface PlanActor {
  userId: string
  workspaceId: string
}

type ListRef = { id: string; name: string; color: number }

/** The user's working hours (`HH:MM`); `end` is after `start`. */
export interface Workday {
  start: string
  end: string
}

export const DEFAULT_WORKDAY: Workday = { start: '09:00', end: '18:00' }

export type PlanBlockRead =
  | {
      id: string
      kind: 'task'
      start: string
      minutes: number
      task: { id: string; title: string; list: ListRef; done: boolean; scheduled_on: string | null; estimate_minutes: number | null }
    }
  | { id: string; kind: 'break'; start: string; minutes: number; name: string; list: ListRef; started_at: string | null }

/** A saved block with its day (PLAN-24). */
export type PlannedBlock = PlanBlockRead & { day: string }

export interface PlanRead {
  day: string
  /** 0 while nothing is saved for the day. */
  version: number
  /** The day is today or later in the workspace's timezone (PLAN-34). */
  editable: boolean
  workday: Workday
  blocks: PlanBlockRead[]
}

type PendingColumn = 'backlog' | 'this_week' | 'today'

/** A pending task the plan offers (PLAN-02). */
export interface Candidate {
  id: string
  title: string
  list: ListRef
  column: PendingColumn
  position: number
  estimate_minutes: number | null
  scheduled_on: string | null
  scheduled_time: string | null
}

/** The most tasks the plan offers at once. */
export const MAX_CANDIDATES = 500

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

async function rows<T>(db: Database, query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows
}

/** The workday kept in the preferences, or 09:00 to 18:00 when there is none or it is malformed. */
export function workdayOf(preferences: Record<string, unknown> | null): Workday {
  const workday = preferences?.workday as Partial<Workday> | undefined
  const { start, end } = workday ?? {}
  if (typeof start === 'string' && typeof end === 'string' && TIME.test(start) && TIME.test(end) && end > start) return { start, end }
  return DEFAULT_WORKDAY
}

interface BlockRow {
  id: string
  kind: 'task' | 'break'
  start: string
  minutes: number
  name: string | null
  task_id: string | null
  task_title: string | null
  task_column: string | null
  task_scheduled_on: string | null
  task_estimate: number | null
  list_id: string
  list_name: string
  list_color: number
  started_at: string | null
}

/**
 * The actor's saved blocks of `from`..`to` (`YYYY-MM-DD`, both included), as the Agenda draws them (PLAN-24): in
 * order of day and start, each with its day; only the actor's own plans in the workspace (PLAN-12). The list of a
 * task block is the task's; blocks whose list is archived are left out (PLAN-40). With `pendingOnly`, as the Agenda
 * reads them, a block of a done task is left out too, as a done task leaves the scheduled blocks (PLAN-39, D5).
 */
export async function listPlanned(
  db: Database,
  actor: PlanActor,
  from: string,
  to: string,
  { pendingOnly = false }: { pendingOnly?: boolean } = {},
): Promise<PlannedBlock[]> {
  const found = await rows<BlockRow & { day: string }>(
    db,
    sql`SELECT b.id, b.kind, to_char(b.start_time, 'HH24:MI') AS start, b.minutes, b.name, p.day::text AS day, b.started_at,
               t.id AS task_id, t.title AS task_title, t."column" AS task_column, t.scheduled_on::text AS task_scheduled_on,
               t.estimate_minutes AS task_estimate, l.id AS list_id, l.name AS list_name, l.color AS list_color
        FROM day_plans p
        JOIN day_plan_blocks b ON b.plan_id = p.id
        LEFT JOIN tasks t ON t.id = b.task_id
        JOIN lists l ON l.id = coalesce(t.list_id, b.list_id)
        WHERE p.user_id = ${actor.userId} AND p.workspace_id = ${actor.workspaceId}
          AND p.day BETWEEN ${from}::date AND ${to}::date AND NOT l.is_archived
          AND (${!pendingOnly} OR t.id IS NULL OR t."column" <> 'done')
          AND (${!pendingOnly} OR b.started_at IS NULL)
        ORDER BY p.day, b.start_time, b.kind DESC, b.id`,
  )
  return found.map((row) => {
    const list = { id: row.list_id, name: row.list_name, color: row.list_color }
    const base = { id: row.id, start: row.start, minutes: row.minutes, day: row.day }
    if (row.kind === 'break') {
      const startedAt = row.started_at === null ? null : new Date(row.started_at).toISOString()
      return { ...base, kind: 'break', name: row.name!, list, started_at: startedAt }
    }
    return {
      ...base,
      kind: 'task',
      task: {
        id: row.task_id!,
        title: row.task_title!,
        list,
        done: row.task_column === 'done',
        scheduled_on: row.task_scheduled_on,
        estimate_minutes: row.task_estimate,
      },
    }
  })
}

/**
 * The actor's plan of `day`: the saved blocks, or none with version 0; `editable` while the day is today or
 * later in the workspace's timezone (PLAN-34); and the user's workday (PLAN-22).
 */
export async function getPlan(db: Database, actor: PlanActor, day: string, now: Date = new Date()): Promise<PlanRead> {
  const [plan] = await rows<{ version: number }>(
    db,
    sql`SELECT version FROM day_plans WHERE user_id = ${actor.userId} AND workspace_id = ${actor.workspaceId} AND day = ${day}::date`,
  )
  const [user] = await db.select({ preferences: users.preferences }).from(users).where(eq(users.id, actor.userId))
  const { today } = await workspaceClock(db, actor.workspaceId, now)
  const blocks = (await listPlanned(db, actor, day, day)).map(({ day: _day, ...block }) => block as PlanBlockRead)
  return { day, version: plan?.version ?? 0, editable: day >= today, workday: workdayOf(user?.preferences ?? null), blocks }
}

interface CandidateRow {
  id: string
  title: string
  list_id: string
  list_name: string
  list_color: number
  column: PendingColumn
  position: number
  estimate_minutes: number | null
  scheduled_on: string | null
  scheduled_time: string | null
}

/**
 * The pending tasks of the workspace's active lists the plan of `day` offers (PLAN-02): those scheduled for the
 * day first, then Today, This week and Backlog in the order of the board, at most MAX_CANDIDATES. Applies the
 * due schedules first, as every read of the task columns does (AD-009).
 */
export async function listCandidates(db: Database, actor: PlanActor, day: string, now: Date = new Date()): Promise<Candidate[]> {
  await applyDueSchedules(db, actor.workspaceId, now)
  const found = await rows<CandidateRow>(
    db,
    sql`SELECT t.id, t.title, l.id AS list_id, l.name AS list_name, l.color AS list_color, t."column", t.position,
               t.estimate_minutes, t.scheduled_on::text AS scheduled_on, to_char(t.scheduled_time, 'HH24:MI') AS scheduled_time
        FROM tasks t
        JOIN lists l ON l.id = t.list_id
        WHERE l.workspace_id = ${actor.workspaceId} AND NOT l.is_archived AND t."column" <> 'done'
        ORDER BY t.scheduled_on IS DISTINCT FROM ${day}::date,
                 CASE t."column" WHEN 'today' THEN 0 WHEN 'this_week' THEN 1 ELSE 2 END,
                 l.position, t.position, t.created_at, t.id
        LIMIT ${MAX_CANDIDATES}`,
  )
  return found.map((row) => ({
    id: row.id,
    title: row.title,
    list: { id: row.list_id, name: row.list_name, color: row.list_color },
    column: row.column,
    position: row.position,
    estimate_minutes: row.estimate_minutes,
    scheduled_on: row.scheduled_on,
    scheduled_time: row.scheduled_time,
  }))
}

/** A block of the plan as the client sends it (`start` is `HH:MM`). */
export type BlockInput =
  | { kind: 'task'; taskId: string; start: string; minutes: number }
  | { kind: 'break'; name: string; listId: string; start: string; minutes: number; id?: string }

const planError = (status: number, message: string, code: string) => new HttpError(status, message, {}, { code })

/**
 * Replaces the actor's plan of `day` with `blocks`, in one transaction (PLAN-08). Refuses a day before today in
 * the workspace's timezone (422 `plan_day_past`), and a `baseVersion` other than the saved one, 0 while nothing
 * is saved (409 `plan_changed`, PLAN-35); tasks and break lists must be of the workspace (422, PLAN-43). Each
 * pending planned task without a day gets the plan's day, without a time, by the rules of saving a schedule
 * (PLAN-09, D3); no other task changes (PLAN-10, PLAN-38). Answers the saved plan, one version up.
 */
export async function savePlan(
  db: Database,
  actor: PlanActor,
  day: string,
  input: { baseVersion: number; blocks: BlockInput[] },
  now: Date = new Date(),
): Promise<PlanRead> {
  const { today } = await workspaceClock(db, actor.workspaceId, now)
  if (day < today) throw planError(422, 'The plan of a past day cannot change', 'plan_day_past')

  const taskIds = [...new Set(input.blocks.flatMap((block) => (block.kind === 'task' ? [block.taskId] : [])))]
  const listIds = [...new Set(input.blocks.flatMap((block) => (block.kind === 'break' ? [block.listId] : [])))]

  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    // Creates the header if missing, then locks it, so two saves of the same day run one after the other.
    await tx
      .insert(dayPlans)
      .values({ id: randomUUID(), userId: actor.userId, workspaceId: actor.workspaceId, day, version: 0, updatedAt: now })
      .onConflictDoNothing()
    const [plan] = await rows<{ id: string; version: number }>(
      tx,
      sql`SELECT id, version FROM day_plans WHERE user_id = ${actor.userId} AND workspace_id = ${actor.workspaceId} AND day = ${day}::date FOR UPDATE`,
    )
    if (plan!.version !== input.baseVersion) throw planError(409, 'The plan changed elsewhere', 'plan_changed')

    const found =
      taskIds.length === 0
        ? []
        : await tx
            .select({ id: tasks.id, listId: tasks.listId, column: tasks.column, scheduledOn: tasks.scheduledOn })
            .from(tasks)
            .innerJoin(lists, eq(lists.id, tasks.listId))
            .where(and(inArray(tasks.id, taskIds), eq(lists.workspaceId, actor.workspaceId)))
    if (found.length !== taskIds.length) throw planError(422, 'Every planned task must be of the workspace', 'plan_task_unknown')
    const breakLists =
      listIds.length === 0
        ? []
        : await tx
            .select({ id: lists.id })
            .from(lists)
            .where(and(inArray(lists.id, listIds), eq(lists.workspaceId, actor.workspaceId)))
    if (breakLists.length !== listIds.length) throw planError(422, 'Every break list must be of the workspace', 'plan_list_unknown')

    // A break already started keeps its id and its start when the plan is saved again (PLAN-49).
    const started = new Map(
      (
        await tx
          .select({ id: dayPlanBlocks.id, startedAt: dayPlanBlocks.startedAt })
          .from(dayPlanBlocks)
          .where(and(eq(dayPlanBlocks.planId, plan!.id), sql`${dayPlanBlocks.startedAt} IS NOT NULL`))
      ).map((row) => [row.id, row.startedAt]),
    )
    await tx.delete(dayPlanBlocks).where(eq(dayPlanBlocks.planId, plan!.id))
    if (input.blocks.length > 0) {
      await tx.insert(dayPlanBlocks).values(
        input.blocks.map((block) => ({
          id: block.kind === 'break' && block.id && started.has(block.id) ? block.id : randomUUID(),
          startedAt: block.kind === 'break' && block.id ? (started.get(block.id) ?? null) : null,
          planId: plan!.id,
          kind: block.kind,
          taskId: block.kind === 'task' ? block.taskId : null,
          name: block.kind === 'break' ? block.name : null,
          listId: block.kind === 'break' ? block.listId : null,
          startTime: block.start,
          minutes: block.minutes,
        })),
      )
    }
    await tx.update(dayPlans).set({ version: plan!.version + 1, updatedAt: now }).where(eq(dayPlans.id, plan!.id))

    // In order of list, as setSchedule locks each task's list: two saves cannot wait on each other.
    const unscheduled = found
      .filter((task) => task.scheduledOn === null && task.column !== 'done')
      .sort((a, b) => a.listId.localeCompare(b.listId) || a.id.localeCompare(b.id))
    for (const task of unscheduled) {
      await setSchedule(tx, task.id, actor.workspaceId, { on: day, time: null }, actor.userId, now)
    }
    return getPlan(tx, actor, day, now)
  })
}
