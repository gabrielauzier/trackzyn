import { and, eq, inArray, isNull, lt, lte, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { focusActions, focusSessions } from '../db/schema.ts'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Closes every open session of the user whose deadline has passed, exactly at the deadline (AD-001):
 * a task session ends with `estimate`, a break with `break_end`. Also forgets the actions applied more
 * than 24h ago, which no client may resend any more (AD-002).
 */
export async function settle(tx: Database, userId: string, now: Date): Promise<void> {
  await tx
    .update(focusSessions)
    .set({
      endedAt: sql`${focusSessions.deadlineAt}`,
      endReason: sql`CASE ${focusSessions.kind} WHEN 'task' THEN 'estimate' ELSE 'break_end' END`,
    })
    .where(and(eq(focusSessions.userId, userId), isNull(focusSessions.endedAt), lte(focusSessions.deadlineAt, now)))
  await tx
    .delete(focusActions)
    .where(and(eq(focusActions.userId, userId), lt(focusActions.appliedAt, new Date(now.getTime() - DAY_MS))))
}

/**
 * Whole seconds of focus spent on each task, over every task session up to `now`. An open session
 * counts until `now`, and never past its deadline, so a session nobody settled yet is still exact.
 * Tasks without sessions are absent from the map.
 */
export async function spentSeconds(tx: Database, taskIds: string[], now: Date): Promise<Map<string, number>> {
  if (taskIds.length === 0) return new Map()
  const instant = sql`${now.toISOString()}::timestamptz`
  const end = sql`coalesce(${focusSessions.endedAt}, least(${instant}, coalesce(${focusSessions.deadlineAt}, ${instant})))`
  const found = await tx
    .select({
      taskId: focusSessions.taskId,
      seconds: sql<number>`floor(extract(epoch FROM sum(${end} - ${focusSessions.startedAt})))::int`,
    })
    .from(focusSessions)
    .where(and(eq(focusSessions.kind, 'task'), inArray(focusSessions.taskId, taskIds)))
    .groupBy(focusSessions.taskId)
  return new Map(found.map((row) => [row.taskId as string, row.seconds]))
}
