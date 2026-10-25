import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import {
  type FocusEndReason,
  type FocusSession,
  type Task,
  type Workspace,
  focusActions,
  focusSessions,
  lists,
  tasks,
  users,
  workspaces,
} from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { settle, spentMilliseconds } from './focus-settle.ts'
import { type FocusState, STALE_AFTER_MS, isAwaitingExtend, openSession, readFocusState, toSessionView } from './focus-state.ts'
import { getList } from './lists.ts'
import { findTask, moveTask } from './tasks.ts'

/** Who acts: the user and the workspace the request addresses. */
export interface FocusActor {
  userId: string
  workspaceId: string
}

/** What every focus action carries (AD-002). */
export interface FocusActionInput {
  actionId: string
  /** When the user clicked, on the server's clock as the client estimates it. */
  occurredAt: Date
  deviceId: string
}

/** What a transition sees: the actor, the device and the instant the action happened. */
interface TransitionContext extends FocusActor {
  deviceId: string
  at: Date
}

/** A transition changes the sessions and answers the list whose focus state the response shows. */
type Transition = (tx: Database, context: TransitionContext) => Promise<string>

const FUTURE_TOLERANCE_MS = 5_000
const MAX_AGE_MS = 24 * 60 * 60 * 1000

export const invalidTransition = () =>
  new HttpError(409, 'The focus state does not allow this action', {}, { code: 'invalid_transition' })

const focusElsewhere = (session: FocusSession) =>
  new HttpError(409, 'Focus is running on another device', {}, { code: 'focus_elsewhere', session: toSessionView(session) })

const invalidTime = () => new HttpError(422, 'occurred_at is outside the accepted window', {}, { code: 'invalid_time' })

/** The latest instant a session of the user started or ended: an action may not happen before it. */
async function lastChange(tx: Database, userId: string): Promise<Date | null> {
  const [row] = await tx
    .select({
      at: sql<string | null>`greatest(max(${focusSessions.startedAt}), max(${focusSessions.endedAt}))`,
    })
    .from(focusSessions)
    .where(eq(focusSessions.userId, userId))
  return row?.at ? new Date(row.at) : null
}

/** AD-002: no later than 5 s after `now`, no earlier than 24h before it, and not before the last change. */
async function checkTime(tx: Database, userId: string, occurredAt: Date, now: Date): Promise<void> {
  if (occurredAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) throw invalidTime()
  if (occurredAt.getTime() < now.getTime() - MAX_AGE_MS) throw invalidTime()
  const last = await lastChange(tx, userId)
  if (last && occurredAt.getTime() < last.getTime()) throw invalidTime()
}

async function workspaceOfList(tx: Database, listId: string): Promise<Pick<Workspace, 'id' | 'timezone'>> {
  const [row] = await tx
    .select({ id: workspaces.id, timezone: workspaces.timezone })
    .from(lists)
    .innerJoin(workspaces, eq(workspaces.id, lists.workspaceId))
    .where(eq(lists.id, listId))
  if (!row) throw new HttpError(404, 'List not found')
  return row
}

/**
 * Runs one focus action (design, "Cada ação segue os mesmos passos"): locks the user, answers the stored
 * response for a known `action_id` (with a fresh `server_now`), checks `occurred_at`, settles up to it,
 * applies the transition at `occurred_at`, records the action and answers the state at `now`.
 */
async function applyAction(
  db: Database,
  actor: FocusActor,
  input: FocusActionInput,
  now: Date,
  transition: Transition,
): Promise<FocusState> {
  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.userId)).for('update')

    const [applied] = await tx.select().from(focusActions).where(eq(focusActions.actionId, input.actionId))
    if (applied) {
      if (applied.userId !== actor.userId) throw invalidTransition()
      return { ...(applied.response as FocusState), server_now: now.toISOString() }
    }

    await checkTime(tx, actor.userId, input.occurredAt, now)
    await settle(tx, actor.userId, input.occurredAt)
    const listId = await transition(tx, { ...actor, deviceId: input.deviceId, at: input.occurredAt })
    const state = await readFocusState(tx, actor.userId, await workspaceOfList(tx, listId), listId, now)
    await tx.insert(focusActions).values({ actionId: input.actionId, userId: actor.userId, appliedAt: now, response: state })
    return state
  })
}

async function endSession(tx: Database, session: FocusSession, at: Date, reason: FocusEndReason): Promise<void> {
  await tx.update(focusSessions).set({ endedAt: at, endReason: reason }).where(eq(focusSessions.id, session.id))
}

/**
 * Opens a task session at `context.at`. The deadline is the start plus what is left of the estimate;
 * a task without estimate, or one already extended past it, counts up without deadline (FOCUS-13,
 * FOCUS-14). A task that used up its estimate and awaits `Estender` gets no session (Edge Cases).
 */
async function openTaskSession(tx: Database, context: TransitionContext, task: Task): Promise<void> {
  const spentMs = (await spentMilliseconds(tx, [task.id], context.at)).get(task.id) ?? 0
  let deadlineAt: Date | null = null
  if (task.estimateMinutes !== null) {
    const leftMs = task.estimateMinutes * 60_000 - spentMs
    if (leftMs > 0) deadlineAt = new Date(context.at.getTime() + leftMs)
    else if (await isAwaitingExtend(tx, context.userId, task, Math.floor(spentMs / 1000))) return
  }
  await insertTaskSession(tx, context, task, deadlineAt)
}

async function insertTaskSession(tx: Database, context: TransitionContext, task: Task, deadlineAt: Date | null): Promise<void> {
  await tx.insert(focusSessions).values({
    id: randomUUID(),
    userId: context.userId,
    workspaceId: context.workspaceId,
    listId: task.listId,
    taskId: task.id,
    kind: 'task',
    deviceId: context.deviceId,
    startedAt: context.at,
    endedAt: null,
    deadlineAt,
    plannedSeconds: null,
    lastSeenAt: context.at,
    endReason: null,
  })
}

/** The pending tasks of Today of the list, in board order. */
async function todayTasks(tx: Database, listId: string): Promise<Task[]> {
  return tx
    .select()
    .from(tasks)
    .where(and(eq(tasks.listId, listId), eq(tasks.column, 'today')))
    .orderBy(asc(tasks.position), asc(tasks.createdAt))
}

/**
 * The task of Today the action is about, and the open session, which must be on that task or absent:
 * a break or another task counting refuses the action (FOCUS-18).
 */
async function focusedTask(tx: Database, context: TransitionContext, taskId: string) {
  const task = await findTask(tx, taskId, context.workspaceId)
  if (task.column !== 'today') throw invalidTransition()
  const open = await openSession(tx, context.userId)
  if (open && (open.kind !== 'task' || open.taskId !== task.id)) throw invalidTransition()
  return { task, open }
}

/** Opens a session on the first pending task of Today, if there is one (FOCUS-06, FOCUS-08, FOCUS-09). */
async function startNext(tx: Database, context: TransitionContext, listId: string): Promise<void> {
  const [next] = await todayTasks(tx, listId)
  if (next) await openTaskSession(tx, context, next)
}

/**
 * Starts (or resumes) the focus on a pending task of Today (FOCUS-02, FOCUS-05). With a session open on
 * another device it answers `focus_elsewhere` unless `takeover` (SYNC-02); taking over the same task
 * keeps its session and moves it to this device (SYNC-03); another task ends the old session at the same
 * instant (SYNC-04). Starting the task already counting changes nothing (SYNC-01). While the open
 * session has had no signal for more than 120 s, only `recover` resolves it (SYNC-11).
 */
export function startFocus(
  db: Database,
  actor: FocusActor,
  input: FocusActionInput,
  payload: { taskId: string; takeover: boolean },
  now: Date,
): Promise<FocusState> {
  return applyAction(db, actor, input, now, async (tx, context) => {
    const task = await findTask(tx, payload.taskId, context.workspaceId)
    if (task.column !== 'today') throw invalidTransition()

    const open = await openSession(tx, context.userId)
    if (open) {
      // A session left without signal waits for the user's `Manter` or `Cortar no último sinal` (SYNC-11).
      if (now.getTime() - open.lastSeenAt.getTime() > STALE_AFTER_MS) throw invalidTransition()
      const here = open.deviceId === context.deviceId
      if (!here && !payload.takeover) throw focusElsewhere(open)
      if (open.kind === 'task' && open.taskId === task.id) {
        if (!here) {
          await tx
            .update(focusSessions)
            .set({ deviceId: context.deviceId, lastSeenAt: context.at })
            .where(eq(focusSessions.id, open.id))
        }
        return task.listId
      }
      if (open.kind === 'break' && here) throw invalidTransition()
      await endSession(tx, open, context.at, 'switch')
    }
    await openTaskSession(tx, context, task)
    return task.listId
  })
}

/** Ends the open task session at the click, keeping the time spent (FOCUS-04). */
export function pauseFocus(db: Database, actor: FocusActor, input: FocusActionInput, now: Date): Promise<FocusState> {
  return applyAction(db, actor, input, now, async (tx, context) => {
    const open = await openSession(tx, context.userId)
    if (!open || open.kind !== 'task') throw invalidTransition()
    await endSession(tx, open, context.at, 'pause')
    return open.listId
  })
}

/**
 * Ends the session, moves the task to the end of Today and starts the next one (FOCUS-06). Refused with
 * a single pending task in Today (FOCUS-07).
 */
export function skipFocus(
  db: Database,
  actor: FocusActor,
  input: FocusActionInput,
  payload: { taskId: string },
  now: Date,
): Promise<FocusState> {
  return applyAction(db, actor, input, now, async (tx, context) => {
    const { task, open } = await focusedTask(tx, context, payload.taskId)
    if ((await todayTasks(tx, task.listId)).length <= 1) throw invalidTransition()
    if (open) await endSession(tx, open, context.at, 'skip')
    await moveTask(tx, task.id, context.workspaceId, { column: 'today', beforeTaskId: null, byUserId: context.userId }, context.at)
    await startNext(tx, context, task.listId)
    return task.listId
  })
}

/**
 * Ends the session, moves the task to done with `completed_at` = the click and starts the next task of
 * Today, or leaves no session when Today is clear (FOCUS-08, FOCUS-09). A task already done is refused
 * and keeps its `completed_at` (FOCUS-18).
 */
export function completeFocus(
  db: Database,
  actor: FocusActor,
  input: FocusActionInput,
  payload: { taskId: string },
  now: Date,
): Promise<FocusState> {
  return applyAction(db, actor, input, now, async (tx, context) => {
    const { task, open } = await focusedTask(tx, context, payload.taskId)
    if (open) await endSession(tx, open, context.at, 'complete')
    await moveTask(tx, task.id, context.workspaceId, { column: 'done', beforeTaskId: null, byUserId: context.userId }, context.at)
    await startNext(tx, context, task.listId)
    return task.listId
  })
}

/**
 * Opens a session without deadline on a task that awaits `Estender`, so the timer counts up from the
 * estimate; the estimate itself does not change (FOCUS-12).
 */
export function extendFocus(
  db: Database,
  actor: FocusActor,
  input: FocusActionInput,
  payload: { taskId: string },
  now: Date,
): Promise<FocusState> {
  return applyAction(db, actor, input, now, async (tx, context) => {
    const { task, open } = await focusedTask(tx, context, payload.taskId)
    if (open) throw invalidTransition()
    const spent = (await spentMilliseconds(tx, [task.id], context.at)).get(task.id) ?? 0
    if (!(await isAwaitingExtend(tx, context.userId, task, Math.floor(spent / 1000)))) throw invalidTransition()
    await insertTaskSession(tx, context, task, null)
    return task.listId
  })
}

/**
 * Ends the task session, if one is counting, and opens a break of `minutes` (1 to 120) whose deadline
 * is its end (BREAK-01, BREAK-02). Settlement closes it there with `break_end` (BREAK-03, BREAK-05).
 */
export function breakFocus(
  db: Database,
  actor: FocusActor,
  input: FocusActionInput,
  payload: { minutes: number; listId: string },
  now: Date,
): Promise<FocusState> {
  if (!Number.isInteger(payload.minutes) || payload.minutes < 1 || payload.minutes > 120) {
    return Promise.reject(new HttpError(422, 'minutes must be an integer from 1 to 120'))
  }
  return applyAction(db, actor, input, now, async (tx, context) => {
    const list = await getList(tx, payload.listId, context.workspaceId)
    const open = await openSession(tx, context.userId)
    if (open?.kind === 'break') throw invalidTransition()
    if (open) await endSession(tx, open, context.at, 'break')
    const plannedSeconds = payload.minutes * 60
    await tx.insert(focusSessions).values({
      id: randomUUID(),
      userId: context.userId,
      workspaceId: context.workspaceId,
      listId: list.id,
      taskId: null,
      kind: 'break',
      deviceId: context.deviceId,
      startedAt: context.at,
      endedAt: null,
      deadlineAt: new Date(context.at.getTime() + plannedSeconds * 1000),
      plannedSeconds,
      lastSeenAt: context.at,
      endReason: null,
    })
    return list.id
  })
}

/** Ends the break at the click with the time that passed; the task stays paused (BREAK-04). */
export function endBreakFocus(db: Database, actor: FocusActor, input: FocusActionInput, now: Date): Promise<FocusState> {
  return applyAction(db, actor, input, now, async (tx, context) => {
    const open = await openSession(tx, context.userId)
    if (open?.kind !== 'break') throw invalidTransition()
    await endSession(tx, open, context.at, 'break_stop')
    return open.listId
  })
}

/**
 * The signal of an open app (SYNC-10): records `now` as the last signal of the open session of this
 * device. Without `action_id`: resending it is harmless. Another device's session, none, or one left
 * without signal for more than 120 s (SYNC-11) is refused.
 */
export function heartbeatFocus(db: Database, actor: FocusActor, payload: { deviceId: string }, now: Date): Promise<FocusState> {
  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    await tx.select({ id: users.id }).from(users).where(eq(users.id, actor.userId)).for('update')
    await settle(tx, actor.userId, now)
    const open = await openSession(tx, actor.userId)
    if (!open || open.deviceId !== payload.deviceId) throw invalidTransition()
    // A session left without signal waits for the user's `Manter` or `Cortar no último sinal` (SYNC-11).
    if (now.getTime() - open.lastSeenAt.getTime() > STALE_AFTER_MS) throw invalidTransition()
    await tx.update(focusSessions).set({ lastSeenAt: now }).where(eq(focusSessions.id, open.id))
    return readFocusState(tx, actor.userId, await workspaceOfList(tx, open.listId), open.listId, now)
  })
}

/**
 * Resolves a session left open without signal for more than 120 s (SYNC-11): `keep` records a fresh
 * signal and keeps it counting, `cut` ends it at its last signal.
 */
export function recoverFocus(
  db: Database,
  actor: FocusActor,
  input: FocusActionInput,
  payload: { decision: 'keep' | 'cut' },
  now: Date,
): Promise<FocusState> {
  return applyAction(db, actor, input, now, async (tx, context) => {
    const open = await openSession(tx, context.userId)
    if (!open || now.getTime() - open.lastSeenAt.getTime() <= STALE_AFTER_MS) throw invalidTransition()
    if (payload.decision === 'keep') {
      await tx.update(focusSessions).set({ lastSeenAt: now }).where(eq(focusSessions.id, open.id))
    } else {
      await endSession(tx, open, open.lastSeenAt, 'crash_cut')
    }
    return open.listId
  })
}
