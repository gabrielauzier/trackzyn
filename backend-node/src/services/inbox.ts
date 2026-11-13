import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type InboxItem, type InboxSource, type TaskGroup, inboxItems, personalAccessTokens, tasks } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import { type Decision, targetColumn } from './decision.ts'
import { createGroup } from './groups.ts'
import { getList } from './lists.ts'
import { workspaceClock } from './schedule.ts'
import { type TaskWithSubtasks, createTask, getTask } from './tasks.ts'

/** Whose inbox: one user in one workspace (INBOX-03, EDGE-07). */
export interface InboxOwner {
  workspaceId: string
  userId: string
}

/** An item with the name of the token that captured it, while that token exists. */
export type InboxItemView = InboxItem & { createdVia: string | null }

/** How long an item stays in the trash before the next read of the inbox deletes it (INBOX-06). */
export const TRASH_DAYS = 30
const DAY_MS = 86_400_000

const notFound = () => new HttpError(404, 'Item not found')
const ofOwner = (owner: InboxOwner) => and(eq(inboxItems.userId, owner.userId), eq(inboxItems.workspaceId, owner.workspaceId))

/** The item `itemId` of `owner`'s inbox, or 404: another user's item is as missing as one that does not exist (INBOX-03). */
export async function findItem(db: Database, owner: InboxOwner, itemId: string): Promise<InboxItemView> {
  const [row] = await db
    .select({ item: inboxItems, createdVia: personalAccessTokens.name })
    .from(inboxItems)
    .leftJoin(personalAccessTokens, eq(personalAccessTokens.id, inboxItems.createdViaTokenId))
    .where(and(eq(inboxItems.id, itemId), ofOwner(owner)))
    .limit(1)
  if (!row) throw notFound()
  return { ...row.item, createdVia: row.createdVia }
}

/**
 * Puts `text` in `owner`'s inbox, without its surrounding spaces, with the time it arrived and where it came
 * from (CAP-01, CAP-09); an empty text or one over 500 characters is refused with 422 (CAP-02, CAP-03).
 */
export async function captureItem(
  db: Database,
  owner: InboxOwner,
  input: { text: string; source: InboxSource; tokenId?: string },
  now: Date = new Date(),
): Promise<InboxItemView> {
  const text = input.text.trim()
  if (text.length === 0) throw new HttpError(422, 'Text is empty', {}, { code: 'text_empty' })
  if (text.length > 500) throw new HttpError(422, 'Text has more than 500 characters', {}, { code: 'text_too_long' })
  const id = randomUUID()
  await db.insert(inboxItems).values({
    id,
    workspaceId: owner.workspaceId,
    userId: owner.userId,
    text,
    source: input.source,
    createdViaTokenId: input.tokenId ?? null,
    createdAt: now,
  })
  return findItem(db, owner, id)
}

/**
 * `owner`'s items of Atuais, oldest first, or of the trash, last discarded first (INBOX-02, INBOX-04). Items
 * discarded more than 30 days ago are deleted first (INBOX-06): no job runs in local mode (AD-001).
 */
export async function listItems(db: Database, owner: InboxOwner, tab: 'current' | 'trash', now: Date = new Date()): Promise<InboxItemView[]> {
  await db.delete(inboxItems).where(and(ofOwner(owner), lt(inboxItems.discardedAt, new Date(now.getTime() - TRASH_DAYS * DAY_MS))))
  const rows = await db
    .select({ item: inboxItems, createdVia: personalAccessTokens.name })
    .from(inboxItems)
    .leftJoin(personalAccessTokens, eq(personalAccessTokens.id, inboxItems.createdViaTokenId))
    .where(and(ofOwner(owner), tab === 'current' ? isNull(inboxItems.discardedAt) : isNotNull(inboxItems.discardedAt)))
    .orderBy(...(tab === 'current' ? [asc(inboxItems.createdAt)] : [desc(inboxItems.discardedAt)]), asc(inboxItems.id))
  return rows.map((row) => ({ ...row.item, createdVia: row.createdVia }))
}

/** How many items `owner` has in Atuais, for the sidebar (INBOX-01). */
export async function countCurrent(db: Database, owner: InboxOwner): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(inboxItems)
    .where(and(ofOwner(owner), isNull(inboxItems.discardedAt)))
  return Number(row?.n ?? 0)
}

/**
 * Stores the list and the estimate picked on the row (QUICK-02) and the decision of Processar tudo (ALL-02);
 * a field left out keeps its value. The list must be one of the workspace.
 */
export async function updateItem(
  db: Database,
  owner: InboxOwner,
  itemId: string,
  changes: { listId?: string | null; estimateMinutes?: number | null; draft?: Decision | null },
): Promise<InboxItemView> {
  const item = await findItem(db, owner, itemId)
  if (changes.listId != null) await getList(db, changes.listId, owner.workspaceId)
  const given = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined))
  if (Object.keys(given).length > 0) await db.update(inboxItems).set(given).where(eq(inboxItems.id, item.id))
  return findItem(db, owner, item.id)
}

/** Sends the item to the trash, keeping its list, estimate and draft (INBOX-04, EDGE-03). */
export async function discardItem(db: Database, owner: InboxOwner, itemId: string, now: Date = new Date()): Promise<InboxItemView> {
  const item = await findItem(db, owner, itemId)
  if (item.discardedAt === null) await db.update(inboxItems).set({ discardedAt: now }).where(eq(inboxItems.id, item.id))
  return findItem(db, owner, item.id)
}

/** Brings the item back to Atuais, at the place of its arrival, with its list and estimate (INBOX-05, EDGE-03). */
export async function restoreItem(db: Database, owner: InboxOwner, itemId: string): Promise<InboxItemView> {
  const item = await findItem(db, owner, itemId)
  await db.update(inboxItems).set({ discardedAt: null }).where(eq(inboxItems.id, item.id))
  return findItem(db, owner, item.id)
}

/** The owner of an inbox and whether they write in the workspace's lists (Assumptions: only owner and editor send). */
export interface InboxSender extends InboxOwner {
  canWrite: boolean
}

/** What an item became: the tasks created, and the group when it became one. */
export interface SendResult {
  tasks: TaskWithSubtasks[]
  group: TaskGroup | null
}

/** Why an item cannot go to its list (QUICK-06, ALL-07): the reason travels next to `detail`. */
const conflict = (detail: string, reason: SendRefusal) => new HttpError(409, detail, {}, { reason })
export type SendRefusal = 'list_archived' | 'list_read_only' | 'already_processed'

/** 409 when the list was archived or the sender cannot write in it, 404 when it is not of the workspace. */
async function checkList(tx: Database, sender: InboxSender, listId: string): Promise<void> {
  const list = await getList(tx, listId, sender.workspaceId)
  if (list.isArchived) throw conflict('List is archived', 'list_archived')
  if (!sender.canWrite) throw conflict('Read-only role', 'list_read_only')
}

/** Takes the item out of Atuais for good, or 409 when another send took it first (EDGE-01). */
async function takeItem(tx: Database, owner: InboxOwner, itemId: string): Promise<InboxItem> {
  const [taken] = await tx
    .delete(inboxItems)
    .where(and(eq(inboxItems.id, itemId), ofOwner(owner), isNull(inboxItems.discardedAt)))
    .returning()
  if (!taken) throw conflict('Item already processed', 'already_processed')
  return taken
}

/**
 * The item to send: the caller's own one, 404 for another user's item (INBOX-03), and 409 already_processed
 * for an id no inbox holds any more, as a send in another window leaves it (EDGE-01).
 */
async function findSendable(db: Database, owner: InboxOwner, itemId: string): Promise<InboxItemView> {
  try {
    return await findItem(db, owner, itemId)
  } catch (error) {
    const [anyone] = await db.select({ id: inboxItems.id }).from(inboxItems).where(eq(inboxItems.id, itemId))
    if (anyone) throw error
    throw conflict('Item already processed', 'already_processed')
  }
}

/**
 * Creates what `decision` says from `item`, in the transaction `tx` (PROC-05, PROC-06, REM-01, GRP-01): a task
 * or a reminder at the end of the column of its schedule or of `Vai para`, a task done now by the sender, or
 * a group with its tasks in the order typed. The name left out is the item's text; the estimate left out is
 * the row's. The list must be checked by the caller.
 */
async function applyDecision(
  tx: Database,
  owner: InboxOwner,
  item: InboxItem,
  decision: Exclude<Decision, { type: 'discard' }>,
  now: Date,
): Promise<SendResult> {
  const name = decision.name ?? item.text
  if (name.length > 255) throw new HttpError(422, 'The name has more than 255 characters', {}, { code: 'name_too_long' })
  const base = { listId: decision.list_id.toLowerCase(), userId: owner.userId, rejectArchived: true }
  if (decision.type === 'done') {
    return { tasks: [await createTask(tx, owner.workspaceId, { ...base, title: name, estimateMinutes: null, column: 'done' }, now)], group: null }
  }
  const clock = await workspaceClock(tx, owner.workspaceId, now)
  if (decision.type === 'group') {
    const column = targetColumn(null, clock.today, clock.weekEnd, decision.column)
    const group = await createGroup(tx, base.listId, { name, priority: decision.priority, dueOn: decision.due_on, notes: decision.notes }, now)
    const created: TaskWithSubtasks[] = []
    for (const line of decision.tasks) {
      created.push(
        await createTask(tx, owner.workspaceId, { ...base, title: line.title, estimateMinutes: line.estimate_minutes ?? null, column, groupId: group.id }, now),
      )
    }
    return { tasks: created, group }
  }
  const scheduledOn = decision.scheduled_on ?? null
  const column = targetColumn(scheduledOn, clock.today, clock.weekEnd, decision.column)
  const estimateMinutes = decision.type === 'task' ? (decision.estimate_minutes !== undefined ? decision.estimate_minutes : item.estimateMinutes) : null
  const task = await createTask(
    tx,
    owner.workspaceId,
    {
      ...base,
      title: name,
      estimateMinutes,
      column,
      notes: decision.notes,
      kind: decision.type,
      priority: decision.priority,
      dueOn: decision.due_on,
    },
    now,
  )
  if (scheduledOn === null) return { tasks: [task], group: null }
  // The column is already the one of the schedule or the one chosen in Vai para (PROC-04): a day up to
  // today is marked applied, so the next read does not take the task to Today against that choice (AD-009).
  await tx
    .update(tasks)
    .set({ scheduledOn, scheduledTime: decision.scheduled_time ?? null, scheduleAppliedAt: scheduledOn <= clock.today ? now : null })
    .where(eq(tasks.id, task.id))
  return { tasks: [await getTask(tx, task.id, owner.workspaceId)], group: null }
}

/**
 * Sends the item `itemId` as `decision` says, from its row or from Processar (QUICK-04, PROC-05 to PROC-07):
 * the item leaves the inbox and what it becomes is created in one transaction, so a failure keeps the item
 * (PROC-08) and a second send of the same item answers 409 (EDGE-01). An archived list or one the sender
 * cannot write in answers 409 and clears the item's list (QUICK-06). `discard` sends it to the trash.
 */
export async function sendItem(db: Database, sender: InboxSender, itemId: string, decision: Decision, now: Date = new Date()): Promise<SendResult> {
  const item = await findSendable(db, sender, itemId)
  if (decision.type === 'discard') {
    if (item.discardedAt !== null) throw conflict('Item already processed', 'already_processed')
    await discardItem(db, sender, item.id, now)
    return { tasks: [], group: null }
  }
  try {
    return await db.transaction(async (transaction) => {
      const tx = transaction as Database
      const taken = await takeItem(tx, sender, item.id)
      await checkList(tx, sender, decision.list_id.toLowerCase())
      return applyDecision(tx, sender, taken, decision, now)
    })
  } catch (error) {
    const reason = error instanceof HttpError ? error.extra.reason : undefined
    if (reason === 'list_archived' || reason === 'list_read_only') {
      await db.update(inboxItems).set({ listId: null }).where(eq(inboxItems.id, item.id))
    }
    throw error
  }
}
