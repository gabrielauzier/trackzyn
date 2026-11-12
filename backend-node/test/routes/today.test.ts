import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { inWorkspace, ownerViewerStranger } from '../support/roles.ts'
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

/** An owner in a UTC workspace with one pending Today task and one task the owner completed; a viewer and a stranger. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  const { owner, workspaceId } = roles
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'UTC' } })
  const listId = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Work', color: 3 })).json().id as string
  const pendingId = (
    await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Pending', estimate_minutes: 30, column: 'today' })
  ).json().id as string
  const doneId = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Done', column: 'today' })).json()
    .id as string
  await call('POST', `/api/tasks/${doneId}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
  return { ...roles, listId, pendingId, doneId }
}

describe('GET /api/today (HOJE-06)', () => {
  it("answers the owner's day: the clock, the workday, Pendente, Feito hoje, the plan and the sessions", async () => {
    const { owner, workspaceId, listId, pendingId, doneId } = await setup()
    const reply = await call('GET', '/api/today', owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    const body = reply.json()
    const today = new Date().toISOString().slice(0, 10)
    expect(body).toMatchObject({
      timezone: 'UTC',
      workday: { start: '09:00', end: '18:00' },
      plan: { saved: false, blocks: [] },
      sessions: [],
    })
    // The day may turn while the request runs, a few milliseconds before midnight UTC.
    expect([today, new Date(Date.now() - 60_000).toISOString().slice(0, 10)]).toContain(body.day)
    expect(body.now_minute).toBeGreaterThanOrEqual(0)
    expect(body.now_minute).toBeLessThan(1440)
    expect(body.pending).toEqual([
      {
        id: pendingId,
        title: 'Pending',
        list: { id: listId, name: 'Work', color: 3 },
        estimate_minutes: 30,
        position: 0,
        scheduled_on: null,
        scheduled_minute: null,
        plan_minute: null,
        has_session_today: false,
        days_late: null,
        subtasks: { done: 0, total: 0 },
      },
    ])
    expect(body.done).toEqual([
      {
        id: doneId,
        title: 'Done',
        list: { id: listId, name: 'Work', color: 3 },
        estimate_minutes: null,
        completed_at: expect.any(String),
        spent_seconds: 0,
        verdict: null,
        diff_seconds: 0,
        series: false,
      },
    ])
  })

  it("answers 200 to a viewer, with the workspace's Pendente and none of the owner's completions", async () => {
    const { viewer, workspaceId, pendingId } = await setup()
    const reply = await call('GET', '/api/today', viewer.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json().pending.map((task: { id: string }) => task.id)).toEqual([pendingId])
    expect(reply.json().done).toEqual([])
  })

  it('answers 404 for a workspace the user is not a member of, and for one that does not exist', async () => {
    const { stranger, workspaceId } = await setup()
    expect((await call('GET', '/api/today', stranger.token, workspaceId)).statusCode).toBe(404)
    expect((await call('GET', '/api/today', stranger.token, randomUUID())).statusCode).toBe(404)
  })

  it('answers 401 without a session', async () => {
    const { workspaceId } = await setup()
    expect((await t.app.inject({ method: 'GET', url: '/api/today', headers: { 'x-workspace-id': workspaceId } })).statusCode).toBe(401)
  })

  it('answers 403 to an access token, whatever its scopes (AD-007)', async () => {
    const { owner, workspaceId } = await setup()
    const token = await mintToken(t, owner.token, workspaceId)
    const reply = await t.app.inject({ method: 'GET', url: '/api/today', headers: bearer(token.value) })
    expect(reply.statusCode).toBe(403)
    expect(reply.json().detail).toBe('Route not available for tokens')
  })
})

describe('POST /api/today/close (HOJE-61, HOJE-67)', () => {
  const close = (token: string, workspaceId: string, moves: unknown) =>
    call('POST', '/api/today/close', token, workspaceId, { moves })

  it('answers the owner 200 with the new day: the task sent to Backlog leaves Pendente', async () => {
    const { owner, workspaceId, pendingId } = await setup()
    const reply = await close(owner.token, workspaceId, [{ task_id: pendingId, to: 'backlog' }])
    expect(reply.statusCode).toBe(200)
    expect(reply.json().pending).toEqual([])
    const task = (await call('GET', `/api/tasks/${pendingId}`, owner.token, workspaceId)).json()
    expect(task.column).toBe('backlog')
  })

  it('answers the owner 200 with the task sent to tomorrow in Amanhã', async () => {
    const { owner, workspaceId, pendingId } = await setup()
    const reply = await close(owner.token, workspaceId, [{ task_id: pendingId, to: 'tomorrow' }])
    expect(reply.statusCode).toBe(200)
    expect(reply.json().tomorrow_tasks.map((task: { id: string }) => task.id)).toEqual([pendingId])
  })

  it('answers 403 to a viewer and moves nothing (HOJE-67)', async () => {
    const { owner, viewer, workspaceId, pendingId } = await setup()
    expect((await close(viewer.token, workspaceId, [{ task_id: pendingId, to: 'backlog' }])).statusCode).toBe(403)
    expect((await call('GET', `/api/tasks/${pendingId}`, owner.token, workspaceId)).json().column).toBe('today')
  })

  it('answers 403 to an access token, whatever its scopes (AD-007)', async () => {
    const { owner, workspaceId, pendingId } = await setup()
    const token = await mintToken(t, owner.token, workspaceId)
    const reply = await t.app.inject({
      method: 'POST',
      url: '/api/today/close',
      headers: bearer(token.value),
      payload: { moves: [{ task_id: pendingId, to: 'backlog' }] },
    })
    expect(reply.statusCode).toBe(403)
    expect(reply.json().detail).toBe('Route not available for tokens')
  })

  it('answers 422 for a destination out of the three', async () => {
    const { owner, workspaceId, pendingId } = await setup()
    expect((await close(owner.token, workspaceId, [{ task_id: pendingId, to: 'today' }])).statusCode).toBe(422)
  })

  it('answers 422 for a task moved twice and moves nothing', async () => {
    const { owner, workspaceId, pendingId } = await setup()
    const reply = await close(owner.token, workspaceId, [
      { task_id: pendingId, to: 'backlog' },
      { task_id: pendingId, to: 'tomorrow' },
    ])
    expect(reply.statusCode).toBe(422)
    expect((await call('GET', `/api/tasks/${pendingId}`, owner.token, workspaceId)).json().column).toBe('today')
  })

  it('answers 422 for 501 moves, and accepts 500', async () => {
    const { owner, workspaceId, pendingId } = await setup()
    const many = (count: number) => Array.from({ length: count }, () => ({ task_id: randomUUID(), to: 'backlog' }))
    expect((await close(owner.token, workspaceId, many(501))).statusCode).toBe(422)
    // 500 moves pass the body check; unknown tasks are then refused by the close itself.
    const reply = await close(owner.token, workspaceId, [{ task_id: pendingId, to: 'backlog' }, ...many(499)])
    expect(reply.statusCode).toBe(422)
    expect(reply.json().code).toBe('close_task_not_pending')
  })

  it('answers 422 close_task_not_pending for a done task', async () => {
    const { owner, workspaceId, doneId } = await setup()
    const reply = await close(owner.token, workspaceId, [{ task_id: doneId, to: 'backlog' }])
    expect(reply.statusCode).toBe(422)
    expect(reply.json().code).toBe('close_task_not_pending')
  })

  it('answers 200 to an empty close', async () => {
    const { owner, workspaceId, pendingId } = await setup()
    const reply = await close(owner.token, workspaceId, [])
    expect(reply.statusCode).toBe(200)
    expect(reply.json().pending.map((task: { id: string }) => task.id)).toEqual([pendingId])
  })
})
