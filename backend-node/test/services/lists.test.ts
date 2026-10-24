import { randomUUID } from 'node:crypto'
import type { PGlite } from '@electric-sql/pglite'
import { eq } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { Database } from '../../src/db/client.ts'
import { type TaskColumn, subtasks, tasks, users, workspaces } from '../../src/db/schema.ts'
import { HttpError } from '../../src/http/http-error.ts'
import { createList, deleteList, getList, listLists, moveList, updateList } from '../../src/services/lists.ts'
import { migratedDb } from '../support/db.ts'

let db: Database
let client: PGlite
let userId: string
let workspaceId: string
let otherWorkspaceId: string

async function newWorkspace(name: string) {
  const id = randomUUID()
  await db.insert(workspaces).values({ id, name, createdAt: new Date() })
  return id
}

beforeEach(async () => {
  ;({ db, client } = await migratedDb())
  userId = randomUUID()
  await db.insert(users).values({
    id: userId,
    email: 'a@b.c',
    hashedPassword: 'x',
    isActive: true,
    isSuperuser: false,
    isVerified: true,
  })
  workspaceId = await newWorkspace('Mine')
  otherWorkspaceId = await newWorkspace('Theirs')
})
afterEach(async () => {
  await client.close()
})

const create = (name: string, color = 1, workspace = workspaceId) => createList(db, { workspaceId: workspace, userId, name, color })

let taskCounter = 0
async function addTask(listId: string, column: TaskColumn, title: string, position: number) {
  const id = randomUUID()
  await db.insert(tasks).values({
    id,
    listId,
    title,
    column,
    position,
    completedAt: column === 'done' ? new Date() : null,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, ++taskCounter)),
  })
  return id
}

const expect404 = async (promise: Promise<unknown>) => {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  )
  expect(error).toBeInstanceOf(HttpError)
  expect(error).toMatchObject({ statusCode: 404, detail: 'List not found' })
}

const order = async () => (await listLists(db, workspaceId)).map((card) => card.list.name)

describe('lists service', () => {
  it('LIST-03 creates a list at the end with its name, color and no pending task', async () => {
    await create('First', 2)
    const second = await create('Second', 7)
    expect(second).toMatchObject({ workspaceId, name: 'Second', color: 7, position: 1, isArchived: false, createdByUserId: userId })

    const cards = await listLists(db, workspaceId)
    expect(cards.map((card) => [card.list.name, card.list.color])).toEqual([
      ['First', 2],
      ['Second', 7],
    ])
    expect(cards[1]).toMatchObject({ pendingCount: 0, preview: [] })
  })

  it('LIST-05 previews the first 4 pending tasks: Today, then This week, then Backlog, and counts the pending ones', async () => {
    const list = await create('Work')
    await addTask(list.id, 'backlog', 'backlog 1', 0)
    await addTask(list.id, 'backlog', 'backlog 2', 1)
    await addTask(list.id, 'this_week', 'week 1', 0)
    await addTask(list.id, 'today', 'today 2', 1)
    await addTask(list.id, 'today', 'today 1', 0)
    await addTask(list.id, 'done', 'finished', 0)

    const [card] = await listLists(db, workspaceId)
    expect(card!.preview.map((task) => task.title)).toEqual(['today 1', 'today 2', 'week 1', 'backlog 1'])
    expect(card!.pendingCount).toBe(5)
  })

  it('LIST-05 leaves the preview short when there are fewer than 4 pending tasks', async () => {
    const list = await create('Work')
    await addTask(list.id, 'backlog', 'only one', 0)
    await addTask(list.id, 'done', 'finished', 0)
    const [card] = await listLists(db, workspaceId)
    expect(card!.preview.map((task) => task.title)).toEqual(['only one'])
    expect(card!.pendingCount).toBe(1)
  })

  it('LIST-06 moves a list before another one and keeps the order', async () => {
    const a = await create('A')
    await create('B')
    const c = await create('C')

    await moveList(db, c.id, workspaceId, a.id)
    expect(await order()).toEqual(['C', 'A', 'B'])

    await moveList(db, c.id, workspaceId, null)
    expect(await order()).toEqual(['A', 'B', 'C'])

    const positions = (await listLists(db, workspaceId)).map((card) => card.list.position)
    expect(positions).toEqual([0, 1, 2])
  })

  it('LIST-06 renumbers from 0 to n-1 without repeated positions under two concurrent moves, the last one winning', async () => {
    const a = await create('A')
    const b = await create('B')
    const c = await create('C')
    const d = await create('D')

    await Promise.all([moveList(db, d.id, workspaceId, a.id), moveList(db, c.id, workspaceId, b.id)])

    const cards = await listLists(db, workspaceId)
    expect(cards.map((card) => card.list.position)).toEqual([0, 1, 2, 3])
    // D before A, then C before B.
    expect(cards.map((card) => card.list.name)).toEqual(['D', 'A', 'C', 'B'])
  })

  it('LIST-07 renames a list and changes its color', async () => {
    const list = await create('Old', 1)
    const renamed = await updateList(db, list.id, workspaceId, { name: 'New', color: 5 })
    expect(renamed).toMatchObject({ id: list.id, name: 'New', color: 5 })
    expect((await getList(db, list.id, workspaceId)).name).toBe('New')
  })

  it('LIST-08 archives a list out of the default listing, keeps its tasks, and unarchives it', async () => {
    const list = await create('Work')
    await create('Other')
    await addTask(list.id, 'today', 'keep me', 0)

    await updateList(db, list.id, workspaceId, { isArchived: true })
    expect(await order()).toEqual(['Other'])
    const archived = await listLists(db, workspaceId, { archived: true })
    expect(archived.map((card) => card.list.name)).toEqual(['Work'])
    expect(archived[0]!.pendingCount).toBe(1)

    await updateList(db, list.id, workspaceId, { isArchived: false })
    expect(await order()).toEqual(['Work', 'Other'])
    expect(await listLists(db, workspaceId, { archived: true })).toEqual([])
  })

  it('LIST-09 deletes a list with its tasks and subtasks, and the list is then not found', async () => {
    const list = await create('Work')
    const task = await addTask(list.id, 'today', 'task', 0)
    await db.insert(subtasks).values({ id: randomUUID(), taskId: task, title: 'sub', position: 0 })

    await deleteList(db, list.id, workspaceId)
    await expect404(getList(db, list.id, workspaceId))
    expect(await db.select().from(tasks).where(eq(tasks.listId, list.id))).toEqual([])
    expect(await db.select().from(subtasks).where(eq(subtasks.taskId, task))).toEqual([])
  })

  it('LIST-11 answers 404 for a list of another workspace and leaves it unchanged', async () => {
    const theirs = await create('Theirs', 3, otherWorkspaceId)
    const mine = await create('Mine')

    await expect404(getList(db, theirs.id, workspaceId))
    await expect404(updateList(db, theirs.id, workspaceId, { name: 'Hijacked' }))
    await expect404(moveList(db, theirs.id, workspaceId, null))
    await expect404(moveList(db, mine.id, workspaceId, theirs.id))
    await expect404(deleteList(db, theirs.id, workspaceId))
    await expect404(getList(db, randomUUID(), workspaceId))

    expect(await getList(db, theirs.id, otherWorkspaceId)).toMatchObject({ name: 'Theirs', position: 0 })
    expect((await listLists(db, workspaceId)).map((card) => card.list.name)).toEqual(['Mine'])
  })
})
