import { randomUUID } from 'node:crypto'
import { and, asc, eq, ne } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type Priority, type TaskColumn, type TaskGroup, lists, taskGroups, tasks } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { type GroupWithoutNextAction, type TaskWithSubtasks, moveTask } from './tasks.ts'

/** Creates a group of tasks in the list `listId` (GRP-01); its tasks are added apart. */
export async function createGroup(
  tx: Database,
  listId: string,
  input: { name: string; priority?: Priority; dueOn?: string | null; notes?: string | null },
  now: Date = new Date(),
): Promise<TaskGroup> {
  const group: TaskGroup = {
    id: randomUUID(),
    listId,
    name: input.name,
    notes: input.notes ?? null,
    priority: input.priority ?? 'none',
    dueOn: input.dueOn ?? null,
    createdAt: now,
    updatedAt: now,
  }
  await tx.insert(taskGroups).values(group)
  return group
}

/** The groups of the list `listId`, oldest first, as the board orders them (MODAL-04). */
export async function listGroups(db: Database, listId: string): Promise<TaskGroup[]> {
  return db.select().from(taskGroups).where(eq(taskGroups.listId, listId)).orderBy(asc(taskGroups.createdAt), asc(taskGroups.id))
}

/**
 * The ids of one column, in order, with the tasks of each group joined at the place of the group's first
 * task, in the order they had among themselves; tasks without a group keep their place (AD-013).
 */
export function normalizeBlocks(ids: readonly string[], groupOf: (id: string) => string | null): string[] {
  const blocks = new Map<string, string[]>()
  for (const id of ids) {
    const group = groupOf(id)
    if (group !== null) blocks.set(group, [...(blocks.get(group) ?? []), id])
  }
  const placed = new Set<string>()
  const result: string[] = []
  for (const id of ids) {
    const group = groupOf(id)
    if (group === null) result.push(id)
    else if (!placed.has(group)) {
      placed.add(group)
      result.push(...blocks.get(group)!)
    }
  }
  return result
}

/** Whether the group still has a task out of done: its next action (GRP-10). */
export async function hasOpenTasks(tx: Database, groupId: string): Promise<boolean> {
  const [open] = await tx
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.groupId, groupId), ne(tasks.column, 'done')))
    .limit(1)
  return open !== undefined
}

/** The group `groupId` if its list belongs to `workspaceId`, or 404. */
export async function findGroup(db: Database, groupId: string, workspaceId: string): Promise<TaskGroup> {
  const [row] = await db
    .select({ group: taskGroups })
    .from(taskGroups)
    .innerJoin(lists, eq(lists.id, taskGroups.listId))
    .where(and(eq(taskGroups.id, groupId), eq(lists.workspaceId, workspaceId)))
    .limit(1)
  if (!row) throw new HttpError(404, 'Group not found')
  return row.group
}

/**
 * Moves every task of the group in the column `from` to the column `to`, right before `beforeTaskId` (or at
 * the end for null), in the order they had (GRP-09), in one transaction. Each task moves as `moveTask` moves
 * it, so entering done completes it and takes its flag off; the group's tasks of other columns stay.
 */
export async function moveGroupBlock(
  db: Database,
  groupId: string,
  workspaceId: string,
  target: { from: TaskColumn; to: TaskColumn; beforeTaskId: string | null },
  byUserId: string,
  now: Date = new Date(),
): Promise<{ tasks: TaskWithSubtasks[]; groupWithoutNextAction: GroupWithoutNextAction | null }> {
  const group = await findGroup(db, groupId, workspaceId)
  return db.transaction(async (transaction) => {
    const tx = transaction as Database
    const block = await tx
      .select({ id: tasks.id })
      .from(tasks)
      .where(and(eq(tasks.groupId, group.id), eq(tasks.column, target.from)))
      .orderBy(asc(tasks.position), asc(tasks.createdAt))
    const moved: TaskWithSubtasks[] = []
    let groupWithoutNextAction: GroupWithoutNextAction | null = null
    // One after the other before the same task keeps their order.
    for (const { id } of block) {
      const task = await moveTask(tx, id, workspaceId, { column: target.to, beforeTaskId: target.beforeTaskId, byUserId }, now)
      groupWithoutNextAction = task.groupWithoutNextAction ?? groupWithoutNextAction
      moved.push(task)
    }
    return { tasks: moved, groupWithoutNextAction }
  })
}
