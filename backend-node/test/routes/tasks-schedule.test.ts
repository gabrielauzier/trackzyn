import { sql } from 'drizzle-orm'
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

const TZ = 'America/Sao_Paulo'

/** The day `offset` days from today in the workspace's timezone, as `YYYY-MM-DD`. */
async function day(offset: number): Promise<string> {
  const result = (await t.ctx.db.execute(sql`SELECT ((now() AT TIME ZONE ${TZ})::date + ${offset}::int)::text AS day`)) as unknown as {
    rows: Array<{ day: string }>
  }
  return result.rows[0]!.day
}

/** The roles, a workspace in Sao Paulo time, one list and one Backlog task. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${roles.workspaceId}`, headers: bearer(roles.owner.token), payload: { timezone: TZ } })
  const listId = (await call('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
  const taskId = (await call('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, title: 'Plan' })).json().id as string
  return { ...roles, listId, taskId }
}

describe('PATCH /api/tasks/:id with a schedule (US-1, US-2, US-7)', () => {
  it('saves the day and the time, answers them on the task, and GET reads them back', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const on = await day(30)
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { scheduled_on: on, scheduled_time: '14:30' })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ id: taskId, scheduled_on: on, scheduled_time: '14:30', column: 'backlog' })
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ scheduled_on: on, scheduled_time: '14:30' })
  })

  it('applies the rules of saving: today takes a Backlog task to Today', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const today = await day(0)
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { scheduled_on: today })
    expect(reply.json()).toMatchObject({ scheduled_on: today, scheduled_time: null, column: 'today' })
  })

  it('a new day keeps the time; clearing the time keeps the day; clearing the day clears both', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const [first, second] = [await day(30), await day(31)]
    const patch = (body: object) => call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, body)
    await patch({ scheduled_on: first, scheduled_time: '09:00' })

    expect((await patch({ scheduled_on: second })).json()).toMatchObject({ scheduled_on: second, scheduled_time: '09:00' })
    expect((await patch({ scheduled_time: null })).json()).toMatchObject({ scheduled_on: second, scheduled_time: null })
    await patch({ scheduled_time: '10:15' })
    expect((await patch({ scheduled_on: null })).json()).toMatchObject({ scheduled_on: null, scheduled_time: null })
  })

  it('answers 422 for a time without a day, an invalid date and a time out of the 15-minute step', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const on = await day(30)
    const patch = (body: object) => call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, body)
    const location = async (body: object) => {
      const reply = await patch(body)
      expect(reply.statusCode).toBe(422)
      return reply.json().detail[0].loc
    }

    expect(await location({ scheduled_on: null, scheduled_time: '10:00' })).toEqual(['body', 'scheduled_time'])
    expect(await location({ scheduled_on: '2026-02-30' })).toEqual(['body', 'scheduled_on'])
    expect(await location({ scheduled_on: '13/11/2026' })).toEqual(['body', 'scheduled_on'])
    expect(await location({ scheduled_on: on, scheduled_time: '14:10' })).toEqual(['body', 'scheduled_time'])
    expect(await location({ scheduled_on: on, scheduled_time: '24:00' })).toEqual(['body', 'scheduled_time'])
    // A time alone on a task without a day is a time without a day too.
    const alone = await patch({ scheduled_time: '10:00' })
    expect(alone.statusCode).toBe(422)
    expect(alone.json()).toMatchObject({ code: 'schedule_time_needs_day' })
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ scheduled_on: null, scheduled_time: null })
  })

  it('D31 accepts a day before today with 200, and the next read of the board shows the task in Today', async () => {
    const { owner, workspaceId, listId, taskId } = await setup()
    const yesterday = await day(-1)
    const reply = await call('PATCH', `/api/tasks/${taskId}`, owner.token, workspaceId, { scheduled_on: yesterday })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ id: taskId, scheduled_on: yesterday, scheduled_time: null })
    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    expect(board.columns.today.tasks).toEqual([expect.objectContaining({ id: taskId, scheduled_on: yesterday })])
    expect(board.columns.backlog.tasks).toEqual([])
  })

  it('answers 403 Read-only role to a viewer and 404 to another workspace, and changes nothing', async () => {
    const { owner, viewer, stranger, workspaceId, strangerWorkspaceId, taskId } = await setup()
    const body = { scheduled_on: await day(30) }
    const refused = await call('PATCH', `/api/tasks/${taskId}`, viewer.token, workspaceId, body)
    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual({ detail: 'Read-only role' })
    expect((await call('PATCH', `/api/tasks/${taskId}`, stranger.token, strangerWorkspaceId, body)).statusCode).toBe(404)
    expect((await call('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ scheduled_on: null })
  })

  it('a token with tasks:write schedules the task', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['tasks:write'])
    const on = await day(30)
    const reply = await t.app.inject({ method: 'PATCH', url: `/api/tasks/${taskId}`, headers: bearer(token.value), payload: { scheduled_on: on, scheduled_time: '08:45' } })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({ scheduled_on: on, scheduled_time: '08:45' })
  })
})

describe('POST /api/tasks with a schedule (US-7)', () => {
  it('creates the task with its day and time and applies the rules of saving', async () => {
    const { owner, workspaceId, listId } = await setup()
    const [later, today] = [await day(30), await day(0)]
    const ahead = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Later', scheduled_on: later, scheduled_time: '16:00' })
    expect(ahead.statusCode).toBe(201)
    expect(ahead.json()).toMatchObject({ title: 'Later', column: 'backlog', scheduled_on: later, scheduled_time: '16:00' })
    const due = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Today', scheduled_on: today })
    expect(due.json()).toMatchObject({ column: 'today', scheduled_on: today, scheduled_time: null })
  })

  it('answers 422 for a time without a day and creates nothing; D31 creates a task with a day before today', async () => {
    const { owner, workspaceId, listId } = await setup()
    const timeOnly = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Orphan time', scheduled_time: '10:00' })
    expect(timeOnly.statusCode).toBe(422)
    expect(timeOnly.json().detail[0].loc).toEqual(['body', 'scheduled_time'])
    const yesterday = await day(-1)
    const past = await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Past', scheduled_on: yesterday })
    expect(past.statusCode).toBe(201)
    expect(past.json()).toMatchObject({ title: 'Past', scheduled_on: yesterday })
    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    expect(board.columns.backlog.tasks.map((task: { title: string }) => task.title)).toEqual(['Plan'])
    expect(board.columns.today.tasks.map((task: { title: string }) => task.title)).toEqual(['Past'])
  })

  it('a token with tasks:create creates a scheduled task; a viewer gets 403', async () => {
    const { owner, viewer, workspaceId, listId } = await setup()
    const token = await mintToken(t, owner.token, workspaceId, ['tasks:create'])
    const on = await day(30)
    const created = await t.app.inject({ method: 'POST', url: '/api/tasks', headers: bearer(token.value), payload: { list_id: listId, title: 'Via token', scheduled_on: on } })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ scheduled_on: on, scheduled_time: null })
    const refused = await call('POST', '/api/tasks', viewer.token, workspaceId, { list_id: listId, title: 'No', scheduled_on: on })
    expect(refused.statusCode).toBe(403)
  })
})
