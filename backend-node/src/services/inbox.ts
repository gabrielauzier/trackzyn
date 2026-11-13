import { randomUUID } from 'node:crypto'
import { and, asc, count, desc, eq, isNotNull, isNull, lt } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type InboxItem, type InboxSource, inboxItems, personalAccessTokens } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import type { Decision } from './decision.ts'
import { getList } from './lists.ts'

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
