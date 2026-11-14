import { and, eq } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { CARD_FIELDS, type CardField, listCardFields } from '../db/schema.ts'

/** The card fields `userId` hides on the list `listId`; none while they never changed it, so every field is on (FIELDS-03). */
export async function getCardFields(db: Database, userId: string, listId: string): Promise<CardField[]> {
  const [row] = await db
    .select({ hidden: listCardFields.hidden })
    .from(listCardFields)
    .where(and(eq(listCardFields.userId, userId), eq(listCardFields.listId, listId)))
  return row?.hidden ?? []
}

/** Hides `hidden` on the cards of `listId` for `userId` alone, and shows the others (FIELDS-04); the data stays. */
export async function setCardFields(db: Database, userId: string, listId: string, hidden: readonly CardField[], now: Date = new Date()): Promise<CardField[]> {
  // In the order of CARD_FIELDS and without repeats, so the same choice is stored the same way.
  const stored = CARD_FIELDS.filter((field) => hidden.includes(field))
  await db
    .insert(listCardFields)
    .values({ userId, listId, hidden: stored, updatedAt: now })
    .onConflictDoUpdate({ target: [listCardFields.userId, listCardFields.listId], set: { hidden: stored, updatedAt: now } })
  return stored
}
