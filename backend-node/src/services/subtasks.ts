import { randomUUID } from 'node:crypto'
import { and, asc, eq, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type Subtask, lists, subtasks, tasks } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { findTask } from './tasks.ts'

/** The subtask `subtaskId` if its task's list belongs to `workspaceId`, or 404. */
async function findSubtask(db: Database, subtaskId: string, workspaceId: string): Promise<Subtask> {
  const [row] = await db
    .select({ subtask: subtasks })
    .from(subtasks)
    .innerJoin(tasks, eq(tasks.id, subtasks.taskId))
    .innerJoin(lists, eq(lists.id, tasks.listId))
    .where(and(eq(subtasks.id, subtaskId), eq(lists.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw new HttpError(404, 'Subtask not found')
  return row.subtask
}

/** Adds a subtask at the end of the task's subtasks. */
export async function createSubtask(db: Database, taskId: string, workspaceId: string, title: string): Promise<Subtask> {
  const task = await findTask(db, taskId, workspaceId)
  const [last] = await db
    .select({ next: sql<number>`coalesce(max(${subtasks.position}) + 1, 0)::int` })
    .from(subtasks)
    .where(eq(subtasks.taskId, task.id))
  const subtask: Subtask = { id: randomUUID(), taskId: task.id, title, done: false, position: last?.next ?? 0 }
  await db.insert(subtasks).values(subtask)
  return subtask
}

export async function updateSubtask(
  db: Database,
  subtaskId: string,
  workspaceId: string,
  changes: { title?: string; done?: boolean },
): Promise<Subtask> {
  const subtask = await findSubtask(db, subtaskId, workspaceId)
  const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
  if (Object.keys(given).length > 0) await db.update(subtasks).set(given).where(eq(subtasks.id, subtask.id))
  return { ...subtask, ...given }
}

export async function deleteSubtask(db: Database, subtaskId: string, workspaceId: string): Promise<void> {
  const subtask = await findSubtask(db, subtaskId, workspaceId)
  await db.delete(subtasks).where(eq(subtasks.id, subtask.id))
}

/**
 * Puts the subtask right before `beforeSubtaskId` (or last for null) among the subtasks of its task and
 * renumbers them from 0 to n-1. Two moves at once are serialised on the task: the last one wins.
 */
export async function moveSubtask(
  db: Database,
  subtaskId: string,
  workspaceId: string,
  beforeSubtaskId: string | null,
): Promise<Subtask> {
  const subtask = await findSubtask(db, subtaskId, workspaceId)
  await db.transaction(async (tx) => {
    await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, subtask.taskId)).for('update')
    const others = (
      await tx
        .select({ id: subtasks.id })
        .from(subtasks)
        .where(eq(subtasks.taskId, subtask.taskId))
        .orderBy(asc(subtasks.position))
    )
      .map((row) => row.id)
      .filter((id) => id !== subtask.id)
    const at = beforeSubtaskId === null || beforeSubtaskId === subtask.id ? others.length : others.indexOf(beforeSubtaskId)
    if (at < 0) throw new HttpError(404, 'Subtask not found')
    others.splice(at, 0, subtask.id)
    for (const [position, id] of others.entries()) await tx.update(subtasks).set({ position }).where(eq(subtasks.id, id))
  })
  return { ...subtask, position: (await findSubtask(db, subtask.id, workspaceId)).position }
}
