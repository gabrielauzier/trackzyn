import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type User, lists, taskIdempotencyKeys, tasks, users, workspaceMembers, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { type TokenPrincipal, authenticate, createToken } from '../../src/services/access-tokens.ts'
import { createList } from '../../src/services/lists.ts'
import { type TaskIntake, createTaskFromToken, toTaskIntake } from '../../src/services/task-intake.ts'
import { deleteTask, moveTask, updateTask } from '../../src/services/tasks.ts'
import { migratedDb } from '../support/db.ts'

const NOW = new Date('2026-11-02T12:00:00.000Z')
const DAY_MS = 86_400_000

let db: Database
let client: PGlite
let user: User
let workspaceId: string
let listId: string
let principal: TokenPrincipal

async function newPrincipal(name: string): Promise<TokenPrincipal> {
  const { plaintext } = await createToken(db, user, { name, workspaceId, scopes: ['tasks:create'], expiresInDays: 365 }, NOW)
  return (await authenticate(db, plaintext, NOW)) as TokenPrincipal
}

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  const id = randomUUID()
  ;[user] = (await db
    .insert(users)
    .values({ id, email: 'a@b.c', hashedPassword: 'x', isActive: true, isSuperuser: false, isVerified: true })
    .returning()) as [User]
  workspaceId = randomUUID()
  await db.insert(workspaces).values({ id: workspaceId, name: 'Mine', createdAt: NOW })
  await db.insert(workspaceMembers).values({ id: randomUUID(), workspaceId, userId: id, role: 'owner', joinedAt: NOW })
  listId = (await createList(db, { workspaceId, userId: id, name: 'Work', color: 1 })).id
  principal = await newPrincipal('n8n')
})
afterEach(async () => {
  await client.close()
})

const input = (changes: Partial<TaskIntake> = {}): TaskIntake => ({
  listId,
  title: 'From automation',
  estimateMinutes: 30,
  column: 'backlog',
  notes: 'details',
  subtasks: ['one', 'two'],
  ...changes,
})

const send = (changes: Partial<TaskIntake> = {}, key?: string, now: Date = NOW, by: TokenPrincipal = principal) =>
  createTaskFromToken(db, workspaceId, by, input(changes), key, now)

const storedTasks = () => db.select().from(tasks)
const storedKeys = () => db.select().from(taskIdempotencyKeys)

const refusal = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (caught: unknown) => caught,
  )

describe('createTaskFromToken', () => {
  it('IDEM-01 the same key twice creates one task and answers the same id', async () => {
    const first = await send({}, 'retry-1')
    const second = await send({}, 'retry-1')

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(true)
    expect(second.task.id).toBe(first.task.id)
    expect((await storedTasks()).map((task) => task.id)).toEqual([first.task.id])
  })

  it('IDEM-02 a replay answers the current state of the task, even after its list is archived', async () => {
    const { task } = await send({}, 'retry-1')
    await updateTask(db, task.id, workspaceId, { title: 'Edited by hand' })
    await moveTask(db, task.id, workspaceId, { column: 'today', beforeTaskId: null, byUserId: user.id }, NOW)
    await db.update(lists).set({ isArchived: true }).where(eq(lists.id, listId))

    const replay = await send({}, 'retry-1')

    expect(replay.replayed).toBe(true)
    expect(replay.task).toMatchObject({ id: task.id, title: 'Edited by hand', column: 'today' })
    expect(replay.task.subtasks.map((subtask) => subtask.title)).toEqual(['one', 'two'])
  })

  it.each<[string, () => Partial<TaskIntake>]>([
    ['title', () => ({ title: 'Other' })],
    ['estimate', () => ({ estimateMinutes: 31 })],
    ['estimate removed', () => ({ estimateMinutes: null })],
    ['column', () => ({ column: 'today' })],
    ['notes', () => ({ notes: 'other details' })],
    ['subtask title', () => ({ subtasks: ['one', 'other'] })],
    ['subtask order', () => ({ subtasks: ['two', 'one'] })],
    ['no subtasks', () => ({ subtasks: [] })],
    ['scheduled day', () => ({ scheduledOn: '2026-11-13' })],
  ])('IDEM-03 the same key with a different %s answers 409 and creates nothing', async (_field, changes) => {
    await send({}, 'retry-1')

    const error = await refusal(send(changes(), 'retry-1'))

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 409, detail: 'Idempotency key reused with a different payload' })
    expect(await storedTasks()).toHaveLength(1)
  })

  it('IDEM-03 the same key with the same day and another time answers 409; with the same time it replays', async () => {
    const first = await send({ scheduledOn: '2026-11-13', scheduledTime: '14:00' }, 'retry-1')
    expect((await send({ scheduledOn: '2026-11-13', scheduledTime: '14:00' }, 'retry-1')).task.id).toBe(first.task.id)

    const error = await refusal(send({ scheduledOn: '2026-11-13', scheduledTime: '14:15' }, 'retry-1'))

    expect(error).toMatchObject({ statusCode: 409, detail: 'Idempotency key reused with a different payload' })
    expect(await storedTasks()).toHaveLength(1)
  })

  it('IDEM-03 the same key on another list answers 409', async () => {
    const other = await createList(db, { workspaceId, userId: user.id, name: 'Other', color: 2 })
    await send({}, 'retry-1')
    expect(await refusal(send({ listId: other.id }, 'retry-1'))).toMatchObject({ statusCode: 409 })
  })

  it('IDEM-03 what normalizes to the same entry is the same payload', async () => {
    const body = { list_id: listId.toUpperCase(), title: 'Short', column: 'backlog' as const }
    const first = await createTaskFromToken(db, workspaceId, principal, toTaskIntake(body), 'retry-1', NOW)
    const explicit = toTaskIntake({ notes: '', subtasks: [], estimate_minutes: null, column: 'backlog', title: 'Short', list_id: listId })

    const second = await createTaskFromToken(db, workspaceId, principal, explicit, 'retry-1', NOW)

    expect(second).toMatchObject({ replayed: true, task: { id: first.task.id } })
  })

  it('IDEM-04 a key whose task was deleted answers 410 and does not bring it back', async () => {
    const { task } = await send({}, 'retry-1')
    await deleteTask(db, task.id, workspaceId)

    const error = await refusal(send({}, 'retry-1'))

    expect(error).toBeInstanceOf(HttpError)
    expect(error).toMatchObject({ statusCode: 410, detail: 'Task was deleted' })
    expect(await storedTasks()).toEqual([])
  })

  it('IDEM-03 comes before IDEM-04: a different payload on a deleted task answers 409', async () => {
    const { task } = await send({}, 'retry-1')
    await deleteTask(db, task.id, workspaceId)
    expect(await refusal(send({ title: 'Other' }, 'retry-1'))).toMatchObject({ statusCode: 409 })
  })

  it('IDEM-01 with exactly 24h the key still answers with the same task', async () => {
    const first = await send({}, 'retry-1')
    const atLimit = new Date(NOW.getTime() + DAY_MS)

    const second = await send({}, 'retry-1', atLimit)

    expect(second).toMatchObject({ replayed: true, task: { id: first.task.id } })
    expect(await storedTasks()).toHaveLength(1)
  })

  it('IDEM-06 past 24h the key creates a new task and keeps the old one', async () => {
    const first = await send({}, 'retry-1')
    const pastLimit = new Date(NOW.getTime() + DAY_MS + 1)

    const second = await send({}, 'retry-1', pastLimit)

    expect(second.replayed).toBe(false)
    expect(second.task.id).not.toBe(first.task.id)
    expect((await storedTasks()).map((task) => task.id).sort()).toEqual([first.task.id, second.task.id].sort())
    // The renewed key answers with the new task, with a new 24h.
    expect(await send({}, 'retry-1', new Date(pastLimit.getTime() + DAY_MS))).toMatchObject({ replayed: true, task: { id: second.task.id } })
  })

  it('IDEM-06 expired keys of the token are removed at the next write, those of other tokens stay', async () => {
    const other = await newPrincipal('other')
    await send({}, 'old', NOW)
    await send({}, 'old of other', NOW, other)
    await send({}, 'recent', new Date(NOW.getTime() + DAY_MS))

    await send({}, 'new', new Date(NOW.getTime() + DAY_MS + 1))

    expect((await storedKeys()).map((row) => row.key).sort()).toEqual(['new', 'old of other', 'recent'])
  })

  it('IDEM-07 two tokens with the same key create one task each, even with different payloads', async () => {
    const other = await newPrincipal('other')
    const mine = await send({}, 'shared')
    const theirs = await send({ title: 'Other payload' }, 'shared', NOW, other)

    expect(theirs.replayed).toBe(false)
    expect(theirs.task.id).not.toBe(mine.task.id)
    expect(await storedTasks()).toHaveLength(2)
  })

  it('without a key each call creates a task and stores no key', async () => {
    const first = await send()
    const second = await send()

    expect(first.replayed).toBe(false)
    expect(second.replayed).toBe(false)
    expect(second.task.id).not.toBe(first.task.id)
    expect(await storedTasks()).toHaveLength(2)
    expect(await storedKeys()).toEqual([])
  })

  it.each([
    ['without a key', undefined],
    ['with a key', 'retry-1'],
  ])('API-10, ORIGIN-01 %s: the task records the token and counts its completion for the owner', async (_case, key) => {
    const { task } = await send({ column: 'done' }, key)
    const [row] = await db.select().from(tasks).where(eq(tasks.id, task.id))
    expect(row).toMatchObject({ createdViaTokenId: principal.tokenId, completedByUserId: user.id, completedAt: NOW, notes: 'details', estimateMinutes: 30 })
    expect(task.subtasks.map((subtask) => subtask.title)).toEqual(['one', 'two'])
  })

  it('stores the id of the created task in the key', async () => {
    const { task } = await send({}, 'retry-1')
    expect((await storedKeys()).map((row) => [row.tokenId, row.key, row.taskId, row.createdAt])).toEqual([[principal.tokenId, 'retry-1', task.id, NOW]])
  })
})

describe('createTaskFromToken when the creation fails', () => {
  it('API-09 answers 409 for an archived list, with or without a key', async () => {
    await db.update(lists).set({ isArchived: true }).where(eq(lists.id, listId))
    for (const key of [undefined, 'retry-1']) {
      const error = await refusal(send({}, key))
      expect(error).toBeInstanceOf(HttpError)
      expect(error).toMatchObject({ statusCode: 409, detail: 'List is archived' })
    }
    expect(await storedTasks()).toEqual([])
  })

  it('API-09 a 409 leaves no key: after the list is restored, the retry creates the task instead of answering 410', async () => {
    await db.update(lists).set({ isArchived: true }).where(eq(lists.id, listId))
    await refusal(send({}, 'retry-1'))
    expect(await storedKeys()).toEqual([])

    await db.update(lists).set({ isArchived: false }).where(eq(lists.id, listId))
    const retry = await send({}, 'retry-1')

    expect(retry.replayed).toBe(false)
    expect((await storedTasks()).map((task) => task.id)).toEqual([retry.task.id])
  })

  it('API-08 a list of another workspace answers 404 and leaves no key', async () => {
    const error = await refusal(send({ listId: randomUUID() }, 'retry-1'))
    expect(error).toMatchObject({ statusCode: 404, detail: 'List not found' })
    expect(await storedKeys()).toEqual([])
  })

  it('API-07 a subtask the column refuses undoes the task and the key, so the same key can create it later', async () => {
    await expect(send({ subtasks: ['fits', 'x'.repeat(256)] }, 'retry-1')).rejects.toThrow()
    expect(await storedTasks()).toEqual([])
    expect(await storedKeys()).toEqual([])

    // A key left behind would answer 409 here: this payload is not the one that failed.
    const retry = await send({ subtasks: ['fits'] }, 'retry-1')

    expect(retry.replayed).toBe(false)
    expect(retry.task.subtasks.map((subtask) => subtask.title)).toEqual(['fits'])
  })
})
