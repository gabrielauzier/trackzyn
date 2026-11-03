import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type User, lists, subtasks, taskIdempotencyKeys, tasks, users, workspaceMembers, workspaces } from '../../src/db/schema.ts'
import { type TokenPrincipal, authenticate, createToken } from '../../src/services/access-tokens.ts'
import { createList } from '../../src/services/lists.ts'
import { type TaskIntake, createTaskFromToken } from '../../src/services/task-intake.ts'
import { migratedPostgres } from '../support/postgres.ts'

const NOW = new Date('2026-11-02T12:00:00.000Z')

let db: Database
let close: () => Promise<void>
let workspaceId: string
let listId: string
let principal: TokenPrincipal

beforeEach(async () => {
  ;({ db, close } = await migratedPostgres())
  const id = randomUUID()
  const [user] = (await db
    .insert(users)
    .values({ id, email: `${id}@example.com`, hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
    .returning()) as [User]
  workspaceId = randomUUID()
  await db.insert(workspaces).values({ id: workspaceId, name: 'Shared', createdAt: NOW })
  await db.insert(workspaceMembers).values({ id: randomUUID(), workspaceId, userId: id, role: 'owner', joinedAt: NOW })
  listId = (await createList(db, { workspaceId, userId: id, name: 'Work', color: 1 })).id
  const { plaintext } = await createToken(db, user, { name: 'n8n', workspaceId, scopes: ['tasks:create'], expiresInDays: 365 }, NOW)
  principal = (await authenticate(db, plaintext, NOW)) as TokenPrincipal
})
afterEach(async () => {
  await close()
})

const input = (): TaskIntake => ({ listId, title: 'From automation', estimateMinutes: null, column: 'backlog', notes: '', subtasks: ['one', 'two', 'three'] })
const send = (key?: string) => createTaskFromToken(db, workspaceId, principal, input(), key, NOW)

describe('createTaskFromToken at the same time', () => {
  it('IDEM-01 10 calls with the same key create one task and all answer it', async () => {
    const results = await Promise.all(Array.from({ length: 10 }, () => send('same')))

    const stored = await db.select().from(tasks)
    expect(stored).toHaveLength(1)
    expect(new Set(results.map((result) => result.task.id))).toEqual(new Set([stored[0]!.id]))
    expect(results.filter((result) => !result.replayed)).toHaveLength(1)
    expect(await db.select().from(subtasks)).toHaveLength(3)
    // Every replay already sees the subtasks: it only reads after the first attempt commits.
    expect(results.map((result) => result.task.subtasks.length)).toEqual(Array(10).fill(3))
  })

  it('the lock on the list still orders positions from inside the transaction of a key', async () => {
    const calls = [...Array.from({ length: 5 }, () => send('same')), ...Array.from({ length: 4 }, (_, index) => send(`key-${index}`)), send()]

    await Promise.all(calls)

    const stored = await db.select({ position: tasks.position }).from(tasks).orderBy(asc(tasks.position))
    expect(stored.map((task) => task.position)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('API-09 failed attempts on the same key undo it one by one: all answer 409, none 410, and the retry creates', async () => {
    await db.update(lists).set({ isArchived: true }).where(eq(lists.id, listId))

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => send('same')))

    expect(results.map((result) => (result.status === 'rejected' ? (result.reason as { statusCode: number }).statusCode : 201))).toEqual(Array(10).fill(409))
    expect(await db.select().from(taskIdempotencyKeys)).toEqual([])

    await db.update(lists).set({ isArchived: false }).where(eq(lists.id, listId))
    expect(await send('same')).toMatchObject({ replayed: false })
  })
})
