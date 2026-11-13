import { randomUUID } from 'node:crypto'
import { and, asc, eq, ne } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type Priority, type TaskGroup, taskGroups, tasks } from '../db/schema.ts'

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
