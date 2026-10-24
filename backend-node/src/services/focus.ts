import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import {
  type FocusEndReason,
  type FocusSession,
  type Task,
  type Workspace,
  focusActions,
  focusSessions,
  lists,
  users,
  workspaces,
} from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { settle, spentMilliseconds } from './focus-settle.ts'
import { type FocusState, isAwaitingExtend, openSession, readFocusState, toSessionView } from './focus-state.ts'
import { findTask } from './tasks.ts'

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

/**
 * Starts (or resumes) the focus on a pending task of Today (FOCUS-02, FOCUS-05). With a session open on
 * another device it answers `focus_elsewhere` unless `takeover` (SYNC-02); taking over the same task
 * keeps its session and moves it to this device (SYNC-03); another task ends the old session at the same
 * instant (SYNC-04). Starting the task already counting changes nothing (SYNC-01).
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
