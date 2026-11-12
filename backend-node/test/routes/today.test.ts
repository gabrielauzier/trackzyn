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
