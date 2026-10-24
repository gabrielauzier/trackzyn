import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type List, lists, tasks, workspaces } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'

export interface ListCard {
  list: List
  pendingCount: number
  /** Up to 4 pending tasks: Today, then This week, then Backlog, each in column order. */
  preview: Array<{ id: string; title: string }>
}

const PREVIEW_SIZE = 4

const notFound = () => new HttpError(404, 'List not found')

/** The list `listId` of `workspaceId`, or 404: a list of another workspace does not exist for the caller. */
export async function getList(db: Database, listId: string, workspaceId: string): Promise<List> {
  const [list] = await db
    .select()
    .from(lists)
    .where(and(eq(lists.id, listId), eq(lists.workspaceId, workspaceId)))
    .limit(1)
  if (!list) throw notFound()
  return list
}

export async function listLists(db: Database, workspaceId: string, options: { archived?: boolean } = {}): Promise<ListCard[]> {
  const found = await db
    .select()
    .from(lists)
    .where(and(eq(lists.workspaceId, workspaceId), eq(lists.isArchived, options.archived ?? false)))
    .orderBy(asc(lists.position), asc(lists.createdAt))
  if (found.length === 0) return []

  const ids = found.map((list) => list.id)
  const counts = await db
    .select({ listId: tasks.listId, n: sql<number>`count(*)::int` })
    .from(tasks)
    .where(and(inArray(tasks.listId, ids), ne(tasks.column, 'done')))
    .groupBy(tasks.listId)

  const rank = sql`row_number() OVER (
    PARTITION BY ${tasks.listId}
    ORDER BY CASE ${tasks.column} WHEN 'today' THEN 0 WHEN 'this_week' THEN 1 ELSE 2 END, ${tasks.position}, ${tasks.createdAt}
  )`
  const ranked = db
    .select({ id: tasks.id, listId: tasks.listId, title: tasks.title, rank: sql<number>`${rank}`.as('rank') })
    .from(tasks)
    .where(and(inArray(tasks.listId, ids), ne(tasks.column, 'done')))
    .as('ranked')
  const previews = await db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= ${PREVIEW_SIZE}`)
    .orderBy(asc(ranked.rank))

  return found.map((list) => ({
    list,
    pendingCount: counts.find((row) => row.listId === list.id)?.n ?? 0,
    preview: previews.filter((row) => row.listId === list.id).map((row) => ({ id: row.id, title: row.title })),
  }))
}

/** Serialises every change to the order of a workspace's lists. */
async function lockWorkspace(tx: Database, workspaceId: string): Promise<void> {
  await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('update')
}

export async function createList(
  db: Database,
  input: { workspaceId: string; userId: string; name: string; color: number },
): Promise<List> {
  return db.transaction(async (tx) => {
    await lockWorkspace(tx as Database, input.workspaceId)
    const [last] = await tx
      .select({ next: sql<number>`coalesce(max(${lists.position}) + 1, 0)::int` })
      .from(lists)
      .where(eq(lists.workspaceId, input.workspaceId))
    const list: List = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      color: input.color,
      position: last?.next ?? 0,
      isArchived: false,
      createdByUserId: input.userId,
      createdAt: new Date(),
    }
    await tx.insert(lists).values(list)
    return list
  })
}

export async function updateList(
  db: Database,
  listId: string,
  workspaceId: string,
  changes: { name?: string; color?: number; isArchived?: boolean },
): Promise<List> {
  const list = await getList(db, listId, workspaceId)
  const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
  const updated: List = { ...list, ...given }
  await db
    .update(lists)
    .set({ name: updated.name, color: updated.color, isArchived: updated.isArchived })
    .where(eq(lists.id, list.id))
  return updated
}

/** Puts the list right before `beforeListId` (or at the end for null) and renumbers the workspace's lists 0..n-1. */
export async function moveList(db: Database, listId: string, workspaceId: string, beforeListId: string | null): Promise<void> {
  await db.transaction(async (tx) => {
    await lockWorkspace(tx as Database, workspaceId)
    await getList(tx as Database, listId, workspaceId)
    if (beforeListId !== null) await getList(tx as Database, beforeListId, workspaceId)

    const ordered = await tx
      .select({ id: lists.id })
      .from(lists)
      .where(eq(lists.workspaceId, workspaceId))
      .orderBy(asc(lists.position), asc(lists.createdAt))
    const ids = ordered.map((row) => row.id)
    const from = ids.indexOf(listId)
    const rest = ids.filter((id) => id !== listId)
    const to = beforeListId === null ? rest.length : beforeListId === listId ? from : rest.indexOf(beforeListId)
    rest.splice(to, 0, listId)

    for (const [position, id] of rest.entries()) {
      await tx.update(lists).set({ position }).where(eq(lists.id, id))
    }
  })
}

/** Deletes the list; its tasks and subtasks go with it (cascade, AD-005). */
export async function deleteList(db: Database, listId: string, workspaceId: string): Promise<void> {
  const list = await getList(db, listId, workspaceId)
  await db.delete(lists).where(eq(lists.id, list.id))
}
