import { createHash, randomUUID } from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import type { Database } from '../db/client.ts'
import { type TaskColumn, taskIdempotencyKeys, tasks } from '../db/schema.ts'
import { HttpError } from '../http/http-error.ts'
import type { TokenPrincipal } from './access-tokens.ts'
import { type TaskWithSubtasks, createTask, getTask } from './tasks.ts'

const KEY_LIFETIME_MS = 86_400_000

/** A task to create, the same whichever channel asks for it (REST or MCP). */
export interface TaskIntake {
  listId: string
  title: string
  estimateMinutes: number | null
  column: TaskColumn
  notes: string
  subtasks: string[]
}

/** The body of `POST /api/tasks` after its schema, with every default filled: two ways of saying the same thing hash the same (IDEM-03). */
export function toTaskIntake(body: {
  list_id: string
  title: string
  estimate_minutes?: number | null
  column: TaskColumn
  notes?: string
  subtasks?: string[]
}): TaskIntake {
  return {
    listId: body.list_id.toLowerCase(),
    title: body.title,
    estimateMinutes: body.estimate_minutes ?? null,
    column: body.column,
    notes: body.notes ?? '',
    subtasks: body.subtasks ?? [],
  }
}

function requestHash({ listId, title, estimateMinutes, column, notes, subtasks }: TaskIntake): string {
  return createHash('sha256')
    .update(JSON.stringify({ listId, title, estimateMinutes, column, notes, subtasks }))
    .digest('hex')
}

/**
 * The only way a token creates a task. With a key, everything runs in one transaction: a retry waits on
 * the key's row until the first attempt ends, and a failed attempt takes its key with it, so nothing but a
 * task that was really created can answer a retry. Keys come before the list's lock in every path.
 */
export async function createTaskFromToken(
  db: Database,
  workspaceId: string,
  principal: Pick<TokenPrincipal, 'tokenId' | 'user'>,
  input: TaskIntake,
  idempotencyKey?: string,
  now: Date = new Date(),
): Promise<{ task: TaskWithSubtasks; replayed: boolean }> {
  const create = (tx: Database, id: string) =>
    createTask(tx, workspaceId, { ...input, id, userId: principal.user.id, createdViaTokenId: principal.tokenId, rejectArchived: true }, now)

  if (idempotencyKey === undefined) return { task: await create(db, randomUUID()), replayed: false }

  return db.transaction(async (tx) => {
    const ofToken = eq(taskIdempotencyKeys.tokenId, principal.tokenId)
    await tx.delete(taskIdempotencyKeys).where(and(ofToken, lt(taskIdempotencyKeys.createdAt, new Date(now.getTime() - KEY_LIFETIME_MS))))

    const hash = requestHash(input)
    const taskId = randomUUID()
    const inserted = await tx
      .insert(taskIdempotencyKeys)
      .values({ tokenId: principal.tokenId, key: idempotencyKey, requestHash: hash, taskId, createdAt: now })
      .onConflictDoNothing()
      .returning({ taskId: taskIdempotencyKeys.taskId })
    if (inserted.length > 0) return { task: await create(tx as Database, taskId), replayed: false }

    const [used] = await tx.select().from(taskIdempotencyKeys).where(and(ofToken, eq(taskIdempotencyKeys.key, idempotencyKey)))
    if (used!.requestHash !== hash) throw new HttpError(409, 'Idempotency key reused with a different payload')
    const [existing] = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, used!.taskId))
    if (!existing) throw new HttpError(410, 'Task was deleted')
    return { task: await getTask(tx as Database, existing.id, workspaceId), replayed: true }
  })
}
