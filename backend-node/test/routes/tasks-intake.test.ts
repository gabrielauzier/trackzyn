import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tasks } from '../../src/db/schema.ts'
import { completedBy, inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

/** The roles, one empty list and a token of the owner with every scope. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const list = await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })
  const listId = list.json().id as string
  const token = await mintToken(t, roles.owner.token, roles.workspaceId)
  const post = (payload: object, headers: Record<string, string> = {}, value = token.value) =>
    t.app.inject({ method: 'POST', url: '/api/tasks', headers: { ...bearer(value), ...headers }, payload })
  const stored = () => t.ctx.db.select().from(tasks).where(eq(tasks.listId, listId))
  return { ...roles, listId, token, post, stored }
}

describe('POST /api/tasks with a token', () => {
  it('API-01 list_id and title are enough: the task goes to the end of backlog', async () => {
    const { listId, post } = await setup()

    const first = await post({ list_id: listId, title: 'First' })
    const second = await post({ list_id: listId, title: 'Second' })

    expect(first.statusCode).toBe(201)
    expect(first.json()).toMatchObject({ list_id: listId, title: 'First', column: 'backlog', position: 0, notes: '', estimate_minutes: null, subtasks: [] })
    expect(second.json()).toMatchObject({ title: 'Second', column: 'backlog', position: 1 })
  })

  it('API-02 with column, the task goes to the end of that column', async () => {
    const { listId, post } = await setup()
    await post({ list_id: listId, title: 'In backlog' })
    await post({ list_id: listId, title: 'Today 1', column: 'today' })

    const reply = await post({ list_id: listId, title: 'Today 2', column: 'today' })

    expect(reply.statusCode).toBe(201)
    expect(reply.json()).toMatchObject({ column: 'today', position: 1 })
  })

  it('API-03, API-04, API-05 stores estimate, notes and subtasks in the order sent, at their largest', async () => {
    const { listId, post, stored } = await setup()
    const titles = Array.from({ length: 50 }, (_, index) => `step ${50 - index}`)
    const notes = 'n'.repeat(10_000)

    const reply = await post({ list_id: listId, title: 'Full', estimate_minutes: 1440, notes, subtasks: titles })

    expect(reply.statusCode).toBe(201)
    const body = reply.json() as { subtasks: Array<{ title: string; position: number; done: boolean }> }
    expect(body).toMatchObject({ estimate_minutes: 1440, notes })
    expect(body.subtasks.map((subtask) => subtask.title)).toEqual(titles)
    expect(body.subtasks.map((subtask) => subtask.position)).toEqual(titles.map((_, index) => index))
    expect((await stored())[0]).toMatchObject({ estimateMinutes: 1440, notes })
    expect((await post({ list_id: listId, title: 'Least', estimate_minutes: 1, subtasks: ['x'.repeat(255)] })).statusCode).toBe(201)
  })

  it.each<[string, object, Array<string | number>]>([
    ['51 subtasks', { subtasks: Array(51).fill('step') }, ['body', 'subtasks']],
    ['an empty subtask title', { subtasks: ['ok', ''] }, ['body', 'subtasks', 1]],
    ['a subtask title of 256 characters', { subtasks: ['x'.repeat(256)] }, ['body', 'subtasks', 0]],
    ['notes of 10 001 characters', { notes: 'n'.repeat(10_001) }, ['body', 'notes']],
    ['an estimate of 0', { estimate_minutes: 0 }, ['body', 'estimate_minutes']],
    ['an estimate of 1441', { estimate_minutes: 1441 }, ['body', 'estimate_minutes']],
    ['an unknown column', { column: 'later' }, ['body', 'column']],
  ])('API-06 %s answers 422 and creates nothing', async (_case, body, loc) => {
    const { listId, post, stored } = await setup()

    const reply = await post({ list_id: listId, title: 'Refused', ...body })

    expect(reply.statusCode).toBe(422)
    expect(reply.json().detail[0].loc).toEqual(loc)
    expect(await stored()).toEqual([])
  })

  it('API-08 a list of another workspace or that does not exist answers 404', async () => {
    const { stranger, strangerWorkspaceId, post } = await setup()
    const theirs = await call('POST', '/api/lists', stranger.token, strangerWorkspaceId, { name: 'Theirs', color: 1 })

    const foreign = await post({ list_id: theirs.json().id, title: 'x' })
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toEqual({ detail: 'List not found' })
    expect((await post({ list_id: '00000000-0000-4000-8000-000000000000', title: 'x' })).statusCode).toBe(404)
  })

  it('API-09 an archived list answers 409 to a token; the session keeps creating', async () => {
    const { owner, workspaceId, listId, post, stored } = await setup()
    await call('PATCH', `/api/lists/${listId}`, owner.token, workspaceId, { is_archived: true })

    const refused = await post({ list_id: listId, title: 'x' })
    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toEqual({ detail: 'List is archived' })
    expect(await stored()).toEqual([])

    const session = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'By hand', column: 'today' })
    expect(session.statusCode).toBe(201)
  })

  it('API-09 a key refused by an archived list creates the task once the list is back, instead of answering 410', async () => {
    const { owner, workspaceId, listId, post, stored } = await setup()
    const body = { list_id: listId, title: 'Retry' }
    const key = { 'idempotency-key': 'retry-1' }
    await call('PATCH', `/api/lists/${listId}`, owner.token, workspaceId, { is_archived: true })
    expect((await post(body, key)).statusCode).toBe(409)

    await call('PATCH', `/api/lists/${listId}`, owner.token, workspaceId, { is_archived: false })
    const retry = await post(body, key)

    expect(retry.statusCode).toBe(201)
    expect(retry.headers['idempotency-replayed']).toBeUndefined()
    expect(await stored()).toHaveLength(1)
  })

  it('API-10 creating in done counts for the owner of the token', async () => {
    const { owner, listId, post } = await setup()
    const reply = await post({ list_id: listId, title: 'Done', column: 'done' })
    expect(reply.json().completed_at).not.toBeNull()
    expect(await completedBy(t, reply.json().id)).toBe(owner.id)
  })

  it('ORIGIN-01 records the token that created the task', async () => {
    const { token, listId, post, stored } = await setup()
    await post({ list_id: listId, title: 'x' })
    expect((await stored())[0]?.createdViaTokenId).toBe(token.id)
  })
})

describe('Idempotency-Key', () => {
  it('IDEM-01, IDEM-02 a replay answers 201 with the same task and the header; the board shows one task', async () => {
    const { owner, workspaceId, listId, post } = await setup()
    const body = { list_id: listId, title: 'Once', notes: 'details', subtasks: ['one', 'two'] }

    const first = await post(body, { 'idempotency-key': 'retry-1' })
    const replay = await post(body, { 'idempotency-key': 'retry-1' })

    expect(first.statusCode).toBe(201)
    expect(first.headers['idempotency-replayed']).toBeUndefined()
    expect(replay.statusCode).toBe(201)
    expect(replay.headers['idempotency-replayed']).toBe('true')
    expect(replay.json()).toEqual(first.json())
    const board = await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)
    expect(board.json().columns.backlog.tasks.map((task: { id: string }) => task.id)).toEqual([first.json().id])
  })

  it('IDEM-02 a replay answers the current state of the task', async () => {
    const { owner, workspaceId, listId, post } = await setup()
    const body = { list_id: listId, title: 'Before' }
    const first = await post(body, { 'idempotency-key': 'retry-1' })
    await call('PATCH', `/api/tasks/${first.json().id}`, owner.token, workspaceId, { title: 'After' })

    const replay = await post(body, { 'idempotency-key': 'retry-1' })

    expect(replay.json()).toMatchObject({ id: first.json().id, title: 'After' })
  })

  it('IDEM-02 without a key there is no replay header and each request creates a task', async () => {
    const { listId, post, stored } = await setup()
    const body = { list_id: listId, title: 'Twice' }
    const replies = [await post(body), await post(body)]
    expect(replies.map((reply) => reply.headers['idempotency-replayed'])).toEqual([undefined, undefined])
    expect(await stored()).toHaveLength(2)
  })

  it('IDEM-03 a different body answers 409; the same fields written another way replay', async () => {
    const { listId, post, stored } = await setup()
    const key = { 'idempotency-key': 'retry-1' }
    const first = await post({ list_id: listId, title: 'Same' }, key)

    const different = await post({ list_id: listId, title: 'Same', notes: 'more' }, key)
    expect(different.statusCode).toBe(409)
    expect(different.json()).toEqual({ detail: 'Idempotency key reused with a different payload' })

    const same = await post(
      { subtasks: [], notes: '', column: 'backlog', estimate_minutes: null, unknown_field: 1, title: 'Same', list_id: listId.toUpperCase() },
      key,
    )
    expect(same.statusCode).toBe(201)
    expect(same.headers['idempotency-replayed']).toBe('true')
    expect(same.json().id).toBe(first.json().id)
    expect(await stored()).toHaveLength(1)
  })

  it('IDEM-04 the key of a deleted task answers 410', async () => {
    const { token, listId, post, stored } = await setup()
    const body = { list_id: listId, title: 'Gone' }
    const first = await post(body, { 'idempotency-key': 'retry-1' })
    await t.app.inject({ method: 'DELETE', url: `/api/tasks/${first.json().id}`, headers: bearer(token.value) })

    const again = await post(body, { 'idempotency-key': 'retry-1' })

    expect(again.statusCode).toBe(410)
    expect(again.json()).toEqual({ detail: 'Task was deleted' })
    expect(await stored()).toEqual([])
  })

  it.each([
    ['empty', '', { type: 'string_too_short', msg: 'String should have at least 1 characters' }],
    ['of 256 characters', 'k'.repeat(256), { type: 'string_too_long', msg: 'String should have at most 255 characters' }],
  ])('IDEM-05 a key %s answers 422 and creates nothing', async (_case, key, item) => {
    const { listId, post, stored } = await setup()

    const reply = await post({ list_id: listId, title: 'x' }, { 'idempotency-key': key })

    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toEqual({ detail: [{ ...item, loc: ['header', 'idempotency-key'] }] })
    expect(await stored()).toEqual([])
  })

  it('IDEM-05 a key of 255 characters is accepted', async () => {
    const { listId, post } = await setup()
    const body = { list_id: listId, title: 'x' }
    const key = { 'idempotency-key': 'k'.repeat(255) }
    expect((await post(body, key)).statusCode).toBe(201)
    expect((await post(body, key)).headers['idempotency-replayed']).toBe('true')
  })
})

describe('POST /api/tasks with the session', () => {
  it('IDEM-08 ignores Idempotency-Key: two requests create two tasks, without the replay header', async () => {
    const { owner, workspaceId, listId, stored } = await setup()
    const post = () =>
      t.app.inject({
        method: 'POST',
        url: '/api/tasks',
        headers: { ...bearer(owner.token), 'x-workspace-id': workspaceId, 'idempotency-key': 'retry-1' },
        payload: { list_id: listId, title: 'Twice', column: 'today' },
      })

    const replies = [await post(), await post()]

    expect(replies.map((reply) => reply.statusCode)).toEqual([201, 201])
    expect(replies.map((reply) => reply.headers['idempotency-replayed'])).toEqual([undefined, undefined])
    expect(replies[0]?.json().id).not.toBe(replies[1]?.json().id)
    expect(await stored()).toHaveLength(2)
  })

  it.each([
    ['empty', ''],
    ['of 256 characters', 'k'.repeat(256)],
  ])('IDEM-08 a key %s does not answer 422', async (_case, key) => {
    const { owner, workspaceId, listId } = await setup()
    const reply = await t.app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { ...bearer(owner.token), 'x-workspace-id': workspaceId, 'idempotency-key': key },
      payload: { list_id: listId, title: 'x', column: 'today' },
    })
    expect(reply.statusCode).toBe(201)
  })

  it('also sends notes and subtasks, column defaults to backlog, and no origin is recorded', async () => {
    const { owner, workspaceId, listId, stored } = await setup()

    const reply = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'By hand', notes: 'details', subtasks: ['one', 'two'] })

    expect(reply.statusCode).toBe(201)
    expect(reply.json()).toMatchObject({ column: 'backlog', position: 0, notes: 'details' })
    expect(reply.json().subtasks.map((subtask: { title: string }) => subtask.title)).toEqual(['one', 'two'])
    expect((await stored())[0]?.createdViaTokenId).toBeNull()
  })
})
