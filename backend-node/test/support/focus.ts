import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import type { Database } from '../../src/db/client.ts'
import { type FocusSession, type TaskColumn, focusSessions, lists, tasks, users, workspaces } from '../../src/db/schema.ts'

/** A user with a workspace and a list, for focus service tests. */
export async function seedFocus(db: Database, now: Date) {
  const userId = randomUUID()
  const workspaceId = randomUUID()
  const listId = randomUUID()
  await db.insert(users).values({ id: userId, email: `${userId}@example.com`, hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
  await db.insert(workspaces).values({ id: workspaceId, name: 'Mine', timezone: 'America/Sao_Paulo', createdAt: now })
  await db.insert(lists).values({ id: listId, workspaceId, name: 'Work', color: 1, position: 0, createdByUserId: userId, createdAt: now })
  let position = 0
  const addTask = async (options: { title?: string; estimate?: number | null; column?: TaskColumn; listId?: string } = {}) => {
    const id = randomUUID()
    const column = options.column ?? 'today'
    await db.insert(tasks).values({
      id,
      listId: options.listId ?? listId,
      title: options.title ?? `task ${position}`,
      estimateMinutes: options.estimate ?? null,
      column,
      position: position++,
      completedAt: column === 'done' ? now : null,
      createdAt: now,
    })
    return id
  }
  const addUser = async () => {
    const id = randomUUID()
    await db.insert(users).values({ id, email: `${id}@example.com`, hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
    return id
  }
  const addSession = async (values: Partial<FocusSession> & { startedAt: Date }) => {
    const id = randomUUID()
    const kind = values.kind ?? (values.taskId ? 'task' : 'break')
    await db.insert(focusSessions).values({
      id,
      userId,
      workspaceId,
      listId,
      taskId: null,
      kind,
      deviceId: 'device-a',
      endedAt: null,
      deadlineAt: null,
      plannedSeconds: null,
      lastSeenAt: values.startedAt,
      endReason: values.endedAt ? 'pause' : null,
      ...values,
    })
    return id
  }
  const session = async (id: string) => {
    const [row] = await db.select().from(focusSessions).where(eq(focusSessions.id, id))
    return row!
  }
  return { userId, workspaceId, listId, addTask, addUser, addSession, session }
}

/** `base` plus `minutes` (and `seconds`). */
export const at = (base: Date, minutes: number, seconds = 0) => new Date(base.getTime() + (minutes * 60 + seconds) * 1000)
