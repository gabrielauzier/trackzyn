import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { sql } from 'drizzle-orm'
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

describe('GET /api/lists/:id/board', () => {
  it('BOARD-01 answers the board of the list, also to a viewer; LIST-11 404 for another workspace; 422 for a non-UUID id', async () => {
    const { owner, viewer, workspaceId, stranger, strangerWorkspaceId } = await ownerViewerStranger(t)
    await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'America/Sao_Paulo' } })
    const list = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Week', color: 2 })).json()
    const today = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'Focus', estimate_minutes: 30, column: 'today' })
    await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'Later', estimate_minutes: 60, column: 'backlog' })
    const finished = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'Finished', column: 'today' })
    await call('POST', `/api/tasks/${finished.json().id}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })

    const reply = await call('GET', `/api/lists/${list.id}/board`, viewer.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    const board = reply.json()
    expect(board).toMatchObject({
      list: { id: list.id, name: 'Week', color: 2 },
      timezone: 'America/Sao_Paulo',
      pending: { count: 2, estimate_minutes: 90 },
      columns: {
        backlog: { estimate_minutes: 60 },
        this_week: { tasks: [], estimate_minutes: 30, done: 1, total: 2 },
        today: { estimate_minutes: 30, done: 1, total: 2 },
        done: { today_count: 1 },
      },
    })
    expect(board.columns.today.tasks).toEqual([
      { id: today.json().id, title: 'Focus', estimate_minutes: 30, spent_seconds: 0, position: 0, subtasks: { done: 0, total: 0 }, created_via: null, scheduled_on: null, scheduled_time: null, series: null, kind: 'task', priority: 'none', due_on: null, waiting: false, waiting_for: null, flagged: false, flag_reason: null, group_id: null },
    ])
    expect(board.columns.done.days).toHaveLength(1)
    expect(board.columns.done.days[0].tasks.map((task: { title: string }) => task.title)).toEqual(['Finished'])

    const foreign = await call('GET', `/api/lists/${list.id}/board`, stranger.token, strangerWorkspaceId)
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toEqual({ detail: 'List not found' })

    const invalid = await call('GET', '/api/lists/nope/board', owner.token, workspaceId)
    expect(invalid.statusCode).toBe(422)
    expect(invalid.json().detail[0]).toMatchObject({ loc: ['path', 'list_id'], msg: 'Input should be a valid UUID' })
  })
})

describe('GET /api/lists/:id/board with the origin of the tasks', () => {
  it('ORIGIN-02 answers the name of the token on the card of its task, to the session and to a token; null on the others', async () => {
    const { owner, workspaceId } = await ownerViewerStranger(t)
    const list = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Week', color: 2 })).json()
    const token = await mintToken(t, owner.token, workspaceId)
    const created = await t.app.inject({ method: 'POST', url: '/api/tasks', headers: bearer(token.value), payload: { list_id: list.id, title: 'Via token' } })
    await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'By hand' })
    const expected = [
      { title: 'Via token', created_via: created.json().created_via },
      { title: 'By hand', created_via: null },
    ]
    expect(created.json().created_via).toEqual(expect.any(String))

    const bySession = await call('GET', `/api/lists/${list.id}/board`, owner.token, workspaceId)
    const byToken = await t.app.inject({ method: 'GET', url: `/api/lists/${list.id}/board`, headers: bearer(token.value) })

    expect(bySession.json().columns.backlog.tasks).toMatchObject(expected)
    expect(byToken.json().columns.backlog.tasks).toMatchObject(expected)
  })
})

describe('GET /api/lists/:id/board ordering Done', () => {
  it('done days list the latest completed task first', async () => {
    const { owner, workspaceId } = await ownerViewerStranger(t)
    const list = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Week', color: 2 })).json()
    const ids: Record<string, string> = {}
    for (const title of ['First', 'Second', 'Third', 'Old one', 'Old two']) {
      const created = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title, column: 'today' })
      ids[title] = created.json().id
      await call('POST', `/api/tasks/${ids[title]}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
    }
    // Completion times out of step with the creation and the position order: Second, then Third, then First.
    const at = async (title: string, offset: string) =>
      t.ctx.db.execute(sql`UPDATE tasks SET completed_at = now() - ${offset}::interval WHERE id = ${ids[title]}`)
    await at('First', '1 second')
    await at('Second', '3 seconds')
    await at('Third', '2 seconds')
    await at('Old one', '1 day 2 seconds')
    await at('Old two', '1 day 1 second')

    const board = (await call('GET', `/api/lists/${list.id}/board`, owner.token, workspaceId)).json()
    const days = board.columns.done.days as Array<{ date: string; tasks: Array<{ title: string }> }>

    expect(days).toHaveLength(2)
    expect(days[0]!.date > days[1]!.date).toBe(true)
    expect(days[0]!.tasks.map((task) => task.title)).toEqual(['First', 'Third', 'Second'])
    expect(days[1]!.tasks.map((task) => task.title)).toEqual(['Old two', 'Old one'])
  })
})

describe('GET /api/lists/:id/board with scheduled tasks (US-3, US-4)', () => {
  it('US-4 brings a Backlog task scheduled for today to Today on the first read of the day, with its day and time on the card', async () => {
    const { owner, viewer, workspaceId } = await ownerViewerStranger(t)
    await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'America/Sao_Paulo' } })
    const list = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Week', color: 2 })).json()
    const due = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'Due today' })).json()
    const later = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: list.id, title: 'Later' })).json()
    // Scheduled on an earlier day for today in the workspace's timezone, and for a day far ahead.
    const today = sql`(now() AT TIME ZONE 'America/Sao_Paulo')::date`
    await t.ctx.db.execute(sql`UPDATE tasks SET scheduled_on = ${today}, scheduled_time = '23:45' WHERE id = ${due.id}`)
    await t.ctx.db.execute(sql`UPDATE tasks SET scheduled_on = ${today} + 30 WHERE id = ${later.id}`)
    const on = ((await t.ctx.db.execute(sql`SELECT (${today})::text AS on`)) as unknown as { rows: Array<{ on: string }> }).rows[0]!.on

    const board = (await call('GET', `/api/lists/${list.id}/board`, viewer.token, workspaceId)).json()

    expect(board.columns.today.tasks).toMatchObject([{ id: due.id, title: 'Due today', scheduled_on: on, scheduled_time: '23:45' }])
    expect(board.columns.backlog.tasks).toMatchObject([{ id: later.id, scheduled_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), scheduled_time: null }])
  })
})
