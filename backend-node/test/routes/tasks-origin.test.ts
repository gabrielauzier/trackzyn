import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { personalAccessTokens, tasks } from '../../src/db/schema.ts'
import { purgeEnded } from '../../src/services/access-tokens.ts'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

const DAY_MS = 86_400_000

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

/** The roles, a list, a token of the owner and a task it created. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const list = await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })
  const listId = list.json().id as string
  const token = await mintToken(t, roles.owner.token, roles.workspaceId)
  const [row] = await t.ctx.db.select({ name: personalAccessTokens.name }).from(personalAccessTokens).where(eq(personalAccessTokens.id, token.id))
  const created = await t.app.inject({ method: 'POST', url: '/api/tasks', headers: bearer(token.value), payload: { list_id: listId, title: 'Via token' } })
  expect(created.statusCode).toBe(201)
  const taskId = created.json().id as string
  const asOwner = (method: 'GET' | 'POST' | 'PATCH', url: string, payload?: object) => call(method, url, roles.owner.token, roles.workspaceId, payload)
  return { ...roles, listId, token, tokenName: row!.name, created, taskId, asOwner, read: () => asOwner('GET', `/api/tasks/${taskId}`) }
}

describe('created_via', () => {
  it('ORIGIN-02 a task created by a token answers the name of the token, on creating and on reading, to every member', async () => {
    const { tokenName, created, read, viewer, workspaceId, taskId } = await setup()
    expect(created.json().created_via).toBe(tokenName)
    expect((await read()).json().created_via).toBe(tokenName)
    expect((await call('GET', `/api/tasks/${taskId}`, viewer.token, workspaceId)).json().created_via).toBe(tokenName)
  })

  it('ORIGIN-02 a replay answers the name of the token too', async () => {
    const { token, tokenName, listId } = await setup()
    const post = () =>
      t.app.inject({ method: 'POST', url: '/api/tasks', headers: { ...bearer(token.value), 'idempotency-key': 'retry-1' }, payload: { list_id: listId, title: 'Twice' } })
    expect((await post()).json().created_via).toBe(tokenName)
    expect((await post()).json().created_via).toBe(tokenName)
  })

  it('ORIGIN-02 a task created by the session answers null, on creating and on reading', async () => {
    const { listId, asOwner } = await setup()
    const created = await asOwner('POST', '/api/tasks', { list_id: listId, title: 'By hand', column: 'today' })
    expect(created.json().created_via).toBeNull()
    expect((await asOwner('GET', `/api/tasks/${created.json().id}`)).json().created_via).toBeNull()
  })

  it('ORIGIN-04 keeps the name after the token is revoked', async () => {
    const { owner, token, tokenName, read } = await setup()
    const revoked = await t.app.inject({ method: 'DELETE', url: `/api/tokens/${token.id}`, headers: bearer(owner.token) })
    expect(revoked.statusCode).toBe(204)
    expect((await read()).json().created_via).toBe(tokenName)
  })

  it('ORIGIN-04 keeps the name after the token expires', async () => {
    const { token, tokenName, read } = await setup()
    await t.ctx.db.update(personalAccessTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(personalAccessTokens.id, token.id))
    expect((await read()).json().created_via).toBe(tokenName)
  })

  it('ORIGIN-05 a token removed by the purge leaves the task with null', async () => {
    const { owner, token, read } = await setup()
    await t.app.inject({ method: 'DELETE', url: `/api/tokens/${token.id}`, headers: bearer(owner.token) })

    await purgeEnded(t.ctx.db, owner.id, new Date(Date.now() + 90 * DAY_MS + 60_000))

    const reply = await read()
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ title: 'Via token', created_via: null })
  })

  it('ORIGIN-06 editing and moving keep the name', async () => {
    const { tokenName, taskId, workspaceId, asOwner, owner } = await setup()
    const other = (await asOwner('POST', '/api/lists', { name: 'Other', color: 2 })).json().id as string

    const edited = await asOwner('PATCH', `/api/tasks/${taskId}`, { title: 'Edited', notes: 'more' })
    expect(edited.json()).toMatchObject({ title: 'Edited', created_via: tokenName })
    const moved = await asOwner('POST', `/api/tasks/${taskId}/move`, { column: 'today', before_task_id: null })
    expect(moved.json()).toMatchObject({ column: 'today', created_via: tokenName })
    const toList = await call('POST', `/api/tasks/${taskId}/move-to-list`, owner.token, workspaceId, { list_id: other })
    expect(toList.json()).toMatchObject({ list_id: other, created_via: tokenName })
  })

  it('ORIGIN-06 the copy made by the session is null, stored and answered, and the original keeps the name', async () => {
    const { tokenName, taskId, asOwner, read } = await setup()

    const copy = await asOwner('POST', `/api/tasks/${taskId}/duplicate`)

    expect(copy.statusCode).toBe(201)
    expect(copy.json().created_via).toBeNull()
    expect((await asOwner('GET', `/api/tasks/${copy.json().id}`)).json().created_via).toBeNull()
    expect((await read()).json().created_via).toBe(tokenName)
  })

  it('ORIGIN-06 the copy made by a token is null too', async () => {
    const { token, taskId, asOwner } = await setup()

    const copy = await t.app.inject({ method: 'POST', url: `/api/tasks/${taskId}/duplicate`, headers: bearer(token.value) })

    expect(copy.statusCode).toBe(201)
    expect(copy.json().created_via).toBeNull()
    expect((await asOwner('GET', `/api/tasks/${copy.json().id}`)).json().created_via).toBeNull()
    const [row] = await t.ctx.db.select({ via: tasks.createdViaTokenId }).from(tasks).where(eq(tasks.id, copy.json().id))
    expect(row?.via).toBeNull()
  })

  it('PICK-17 a task from the agenda answers Agenda, on reading and on the board', async () => {
    const { listId, asOwner, viewer, workspaceId } = await setup()
    const created = await asOwner('POST', '/api/tasks', { list_id: listId, title: 'Logged', column: 'today' })
    const id = created.json().id as string
    await t.ctx.db.update(tasks).set({ createdFrom: 'agenda' }).where(eq(tasks.id, id))

    expect((await asOwner('GET', `/api/tasks/${id}`)).json().created_via).toBe('Agenda')
    const board = (await call('GET', `/api/lists/${listId}/board`, viewer.token, workspaceId)).json()
    const cards = Object.values(board.columns as Record<string, { tasks: Array<{ id: string; created_via: string | null }> }>).flatMap(
      (column) => column.tasks,
    )
    expect(cards.find((card) => card.id === id)?.created_via).toBe('Agenda')
  })
})
