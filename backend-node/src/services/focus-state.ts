import { and, desc, eq, isNull } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type FocusSession, type Workspace, focusSessions, tasks } from '../db/schema.ts'
import { buildBoard } from './board.ts'
import { spentSeconds } from './focus-settle.ts'

/** A session with no signal for longer than this was left open by a crash (SYNC-11). */
export const STALE_AFTER_MS = 120_000

export interface FocusSessionView {
  id: string
  kind: 'task' | 'break'
  task_id: string | null
  list_id: string
  device_id: string
  started_at: string
  deadline_at: string | null
  planned_seconds: number | null
}

export interface FocusTaskView {
  id: string
  title: string
  estimate_minutes: number | null
  spent_seconds: number
  awaiting_extend: boolean
}

/** A pending task of Today, as the client needs it to apply skip, complete or start offline. */
export interface FocusTodayTaskView extends FocusTaskView {
  position: number
}

export interface FocusState {
  server_now: string
  session: FocusSessionView | null
  task: FocusTaskView | null
  /** Totals of Today and its pending tasks in board order. */
  today: { pending: number; done: number; estimate_minutes: number; tasks: FocusTodayTaskView[] }
  stale: { session_id: string; last_seen_at: string; seconds: number } | null
}

export function toSessionView(session: FocusSession): FocusSessionView {
  return {
    id: session.id,
    kind: session.kind,
    task_id: session.taskId,
    list_id: session.listId,
    device_id: session.deviceId,
    started_at: session.startedAt.toISOString(),
    deadline_at: session.deadlineAt?.toISOString() ?? null,
    planned_seconds: session.plannedSeconds,
  }
}

/** The user's open session, if any (at most one, SYNC-01). Settle first to leave no due session open. */
export async function openSession(tx: Database, userId: string): Promise<FocusSession | null> {
  const [found] = await tx
    .select()
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), isNull(focusSessions.endedAt)))
    .limit(1)
  return found ?? null
}

/**
 * Whether the task waits for `Estender` or `Concluir`: its estimate is used up and the user's last
 * session on it ended because the estimate ran out (FOCUS-10, FOCUS-14).
 */
export async function isAwaitingExtend(
  tx: Database,
  userId: string,
  task: { id: string; estimateMinutes: number | null },
  spent: number,
): Promise<boolean> {
  if (task.estimateMinutes === null || spent < task.estimateMinutes * 60) return false
  const [last] = await tx
    .select({ endReason: focusSessions.endReason })
    .from(focusSessions)
    .where(and(eq(focusSessions.userId, userId), eq(focusSessions.taskId, task.id)))
    .orderBy(desc(focusSessions.startedAt))
    .limit(1)
  return last?.endReason === 'estimate'
}

/**
 * The focus of `userId` as the focus screen of `listId` shows it at `now`, after settling (AD-001): the
 * open session, the task in focus (or the first pending task of Today), the totals and the pending
 * tasks of Today in board order, and the open session when it has had no signal for more than 120 s.
 */
export async function readFocusState(
  tx: Database,
  userId: string,
  workspace: Pick<Workspace, 'id' | 'timezone'>,
  listId: string,
  now: Date,
): Promise<FocusState> {
  const board = await buildBoard(tx, listId, workspace, userId, now)
  const today = board.columns.today
  const session = await openSession(tx, userId)

  let task: FocusTaskView | null = null
  const focusedId = session?.kind === 'task' ? session.taskId : (today.tasks[0]?.id ?? null)
  if (focusedId !== null) {
    const [row] = await tx.select().from(tasks).where(eq(tasks.id, focusedId))
    if (row) {
      const spent = (await spentSeconds(tx, [row.id], now)).get(row.id) ?? 0
      task = {
        id: row.id,
        title: row.title,
        estimate_minutes: row.estimateMinutes,
        spent_seconds: spent,
        awaiting_extend: await isAwaitingExtend(tx, userId, row, spent),
      }
    }
  }

  const todayTasks: FocusTodayTaskView[] = []
  for (const card of today.tasks) {
    todayTasks.push({
      id: card.id,
      title: card.title,
      estimate_minutes: card.estimate_minutes,
      spent_seconds: card.spent_seconds,
      awaiting_extend: await isAwaitingExtend(tx, userId, { id: card.id, estimateMinutes: card.estimate_minutes }, card.spent_seconds),
      position: card.position,
    })
  }

  const silentMs = session ? now.getTime() - session.lastSeenAt.getTime() : 0
  return {
    server_now: now.toISOString(),
    session: session ? toSessionView(session) : null,
    task,
    today: { pending: today.tasks.length, done: today.done, estimate_minutes: today.estimate_minutes, tasks: todayTasks },
    stale:
      session && silentMs > STALE_AFTER_MS
        ? { session_id: session.id, last_seen_at: session.lastSeenAt.toISOString(), seconds: Math.floor(silentMs / 1000) }
        : null,
  }
}
