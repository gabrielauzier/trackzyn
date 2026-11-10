import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { invite, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

let t: TestApp
beforeAll(async () => {
  t = await createTestApp()
})
afterAll(async () => {
  await t.close()
})

const TZ = 'America/Sao_Paulo'

type Method = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
const send = (method: Method, url: string, token: string, workspaceId: string, payload?: unknown) =>
  t.app.inject({ method, url, headers: { ...bearer(token), 'x-workspace-id': workspaceId }, payload: payload as object })

/** The day `offset` days from today in the workspace's timezone, as `YYYY-MM-DD`. */
async function day(offset: number): Promise<string> {
  const result = (await t.ctx.db.execute(sql`SELECT ((now() AT TIME ZONE ${TZ})::date + ${offset}::int)::text AS day`)) as unknown as {
    rows: Array<{ day: string }>
  }
  return result.rows[0]!.day
}

/** The roles, a workspace in Sao Paulo time, one list and one Backlog task, and a task of the stranger. */
async function setup() {
  const roles = await ownerViewerStranger(t)
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${roles.workspaceId}`, headers: bearer(roles.owner.token), payload: { timezone: TZ } })
  const listId = (await send('POST', '/api/lists', roles.owner.token, roles.workspaceId, { name: 'Work', color: 1 })).json().id as string
  const taskId = (await send('POST', '/api/tasks', roles.owner.token, roles.workspaceId, { list_id: listId, title: 'Plan', estimate_minutes: 45 })).json()
    .id as string
  const strangerListId = (await send('POST', '/api/lists', roles.stranger.token, roles.strangerWorkspaceId, { name: 'Theirs', color: 2 })).json()
    .id as string
  const strangerTaskId = (
    await send('POST', '/api/tasks', roles.stranger.token, roles.strangerWorkspaceId, { list_id: strangerListId, title: 'Theirs' })
  ).json().id as string
  return { ...roles, listId, taskId, strangerListId, strangerTaskId }
}

describe('GET /api/plans/:day (PLAN-11, PLAN-12, PLAN-34)', () => {
  it('answers an empty plan with version 0 and the default workday', async () => {
    const { owner, workspaceId } = await setup()
    const tomorrow = await day(1)
    const reply = await send('GET', `/api/plans/${tomorrow}`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ day: tomorrow, version: 0, editable: true, workday: { start: '09:00', end: '18:00' }, blocks: [] })
  })

  it('answers a past day as read-only', async () => {
    const { owner, workspaceId } = await setup()
    expect((await send('GET', `/api/plans/${await day(-1)}`, owner.token, workspaceId)).json()).toMatchObject({ editable: false })
  })

  it('answers 422 for a day that is not a date', async () => {
    const { owner, workspaceId } = await setup()
    for (const bad of ['2026-02-30', '13-11-2026']) {
      const reply = await send('GET', `/api/plans/${bad}`, owner.token, workspaceId)
      expect(reply.statusCode).toBe(422)
      expect(reply.json().detail[0].loc).toEqual(['path', 'day'])
    }
  })
})

describe('PUT /api/plans/:day (PLAN-08, PLAN-09, PLAN-35, PLAN-41, PLAN-43)', () => {
  it('saves the day, answers the saved plan, GET reads it back and the task gets the day without a time', async () => {
    const { owner, workspaceId, taskId, listId } = await setup()
    const tomorrow = await day(1)
    const body = {
      base_version: 0,
      blocks: [
        { kind: 'task', task_id: taskId, start: '10:37', minutes: 45 },
        { kind: 'break', name: 'Almoço', list_id: listId, start: '12:00', minutes: 60 },
      ],
    }
    const reply = await send('PUT', `/api/plans/${tomorrow}`, owner.token, workspaceId, body)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({
      day: tomorrow,
      version: 1,
      editable: true,
      blocks: [
        { kind: 'task', start: '10:37', minutes: 45, task: { id: taskId, title: 'Plan', done: false, scheduled_on: tomorrow, estimate_minutes: 45 } },
        { kind: 'break', start: '12:00', minutes: 60, name: 'Almoço', list: { id: listId, name: 'Work', color: 1 } },
      ],
    })
    expect((await send('GET', `/api/plans/${tomorrow}`, owner.token, workspaceId)).json()).toEqual(reply.json())
    expect((await send('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({
      scheduled_on: tomorrow,
      scheduled_time: null,
      estimate_minutes: 45,
    })
  })

  it('answers 409 plan_changed for a stale version and keeps the saved plan (PLAN-35)', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const tomorrow = await day(1)
    await send('PUT', `/api/plans/${tomorrow}`, owner.token, workspaceId, { base_version: 0, blocks: [] })
    const reply = await send('PUT', `/api/plans/${tomorrow}`, owner.token, workspaceId, {
      base_version: 0,
      blocks: [{ kind: 'task', task_id: taskId, start: '09:00', minutes: 60 }],
    })
    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toMatchObject({ code: 'plan_changed' })
    expect((await send('GET', `/api/plans/${tomorrow}`, owner.token, workspaceId)).json()).toMatchObject({ version: 1, blocks: [] })
  })

  it('answers 422 plan_day_past for a day before today (PLAN-34)', async () => {
    const { owner, workspaceId } = await setup()
    const reply = await send('PUT', `/api/plans/${await day(-1)}`, owner.token, workspaceId, { base_version: 0, blocks: [] })
    expect(reply.statusCode).toBe(422)
    expect(reply.json()).toMatchObject({ code: 'plan_day_past' })
  })

  it('answers 422 for a start out of HH:MM, durations out of bounds and a break without a name, and writes nothing (PLAN-43)', async () => {
    const { owner, workspaceId, taskId, listId } = await setup()
    const tomorrow = await day(1)
    const location = async (block: object) => {
      const reply = await send('PUT', `/api/plans/${tomorrow}`, owner.token, workspaceId, { base_version: 0, blocks: [block] })
      expect(reply.statusCode).toBe(422)
      return reply.json().detail[0].loc
    }
    const task = { kind: 'task', task_id: taskId, start: '09:00', minutes: 60 }
    const pause = { kind: 'break', name: 'Café', list_id: listId, start: '10:00', minutes: 15 }

    expect(await location({ ...task, start: '9:05' })).toEqual(['body', 'blocks', 0, 'start'])
    expect(await location({ ...task, start: '24:00' })).toEqual(['body', 'blocks', 0, 'start'])
    expect(await location({ ...task, start: '10:15:00' })).toEqual(['body', 'blocks', 0, 'start'])
    expect(await location({ ...task, minutes: 4 })).toEqual(['body', 'blocks', 0, 'minutes'])
    expect(await location({ ...task, minutes: 1441 })).toEqual(['body', 'blocks', 0, 'minutes'])
    expect(await location({ ...pause, minutes: 4 })).toEqual(['body', 'blocks', 0, 'minutes'])
    expect(await location({ ...pause, minutes: 121 })).toEqual(['body', 'blocks', 0, 'minutes'])
    expect(await location({ ...pause, name: '' })).toEqual(['body', 'blocks', 0, 'name'])
    expect(await location({ ...pause, name: '   ' })).toEqual(['body', 'blocks', 0, 'name'])
    expect(await location({ ...pause, name: 'x'.repeat(41) })).toEqual(['body', 'blocks', 0, 'name'])
    const { name: _name, ...nameless } = pause
    expect(await location(nameless)).toEqual(['body', 'blocks', 0, 'name'])
    expect((await send('GET', `/api/plans/${tomorrow}`, owner.token, workspaceId)).json()).toMatchObject({ version: 0, blocks: [] })
  })

  it('answers 422 for a task or a break list of another workspace and writes nothing (PLAN-43)', async () => {
    const { owner, workspaceId, taskId, strangerTaskId, strangerListId } = await setup()
    const tomorrow = await day(1)
    for (const block of [
      { kind: 'task', task_id: strangerTaskId, start: '09:00', minutes: 60 },
      { kind: 'break', name: 'Café', list_id: strangerListId, start: '10:00', minutes: 15 },
    ]) {
      const reply = await send('PUT', `/api/plans/${tomorrow}`, owner.token, workspaceId, {
        base_version: 0,
        blocks: [{ kind: 'task', task_id: taskId, start: '08:00', minutes: 60 }, block],
      })
      expect(reply.statusCode).toBe(422)
    }
    expect((await send('GET', `/api/plans/${tomorrow}`, owner.token, workspaceId)).json()).toMatchObject({ version: 0, blocks: [] })
    expect((await send('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ scheduled_on: null })
  })

  it('answers 403 Read-only role to a viewer and writes nothing; the viewer reads an own empty plan (PLAN-41)', async () => {
    const { owner, viewer, workspaceId, taskId } = await setup()
    const tomorrow = await day(1)
    const reply = await send('PUT', `/api/plans/${tomorrow}`, viewer.token, workspaceId, {
      base_version: 0,
      blocks: [{ kind: 'task', task_id: taskId, start: '09:00', minutes: 60 }],
    })
    expect(reply.statusCode).toBe(403)
    expect(reply.json().detail).toBe('Read-only role')
    expect((await send('GET', `/api/plans/${tomorrow}`, viewer.token, workspaceId)).json()).toMatchObject({ version: 0, blocks: [] })
    expect((await send('GET', `/api/tasks/${taskId}`, owner.token, workspaceId)).json()).toMatchObject({ scheduled_on: null })
  })

  it('keeps the plan of each user apart (PLAN-12)', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const tomorrow = await day(1)
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    await send('PUT', `/api/plans/${tomorrow}`, owner.token, workspaceId, {
      base_version: 0,
      blocks: [{ kind: 'task', task_id: taskId, start: '09:00', minutes: 60 }],
    })
    expect((await send('GET', `/api/plans/${tomorrow}`, editor.token, workspaceId)).json()).toMatchObject({ version: 0, blocks: [] })
  })
})

describe('GET /api/plans/:day/candidates (PLAN-02)', () => {
  it('answers the pending tasks of the workspace with column, estimate and day', async () => {
    const { owner, workspaceId, taskId, listId } = await setup()
    const reply = await send('GET', `/api/plans/${await day(1)}/candidates`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({
      tasks: [
        {
          id: taskId,
          title: 'Plan',
          list: { id: listId, name: 'Work', color: 1 },
          column: 'backlog',
          position: expect.any(Number),
          estimate_minutes: 45,
          scheduled_on: null,
          scheduled_time: null,
        },
      ],
    })
  })
})

describe('GET /api/plans?from&to (PLAN-24)', () => {
  it('answers the saved blocks of the period with their day', async () => {
    const { owner, workspaceId, listId } = await setup()
    const [today, tomorrow] = [await day(0), await day(1)]
    await send('PUT', `/api/plans/${tomorrow}`, owner.token, workspaceId, {
      base_version: 0,
      blocks: [{ kind: 'break', name: 'Café', list_id: listId, start: '10:00', minutes: 15 }],
    })
    const reply = await send('GET', `/api/plans?from=${today}&to=${tomorrow}`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({
      blocks: [
        { id: expect.any(String), day: tomorrow, kind: 'break', start: '10:00', minutes: 15, name: 'Café', list: { id: listId, name: 'Work', color: 1 } },
      ],
    })
  })

  it('PLAN-39 leaves out the block of a done task, keeps it in the plan of the day, and brings it back when the task reopens', async () => {
    const { owner, workspaceId, listId, taskId } = await setup()
    const tomorrow = await day(1)
    await send('PUT', `/api/plans/${tomorrow}`, owner.token, workspaceId, {
      base_version: 0,
      blocks: [
        { kind: 'task', task_id: taskId, start: '09:00', minutes: 45 },
        { kind: 'break', name: 'Café', list_id: listId, start: '10:00', minutes: 15 },
      ],
    })
    const kinds = async () => ((await send('GET', `/api/plans?from=${tomorrow}&to=${tomorrow}`, owner.token, workspaceId)).json().blocks as Array<{ kind: string }>).map((block) => block.kind)
    expect(await kinds()).toEqual(['task', 'break'])

    await send('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'done', before_task_id: null })
    expect(await kinds()).toEqual(['break'])
    const plan = (await send('GET', `/api/plans/${tomorrow}`, owner.token, workspaceId)).json()
    expect(plan.blocks.map((block: { kind: string; task?: { done: boolean } }) => [block.kind, block.task?.done])).toEqual([
      ['task', true],
      ['break', undefined],
    ])

    await send('POST', `/api/tasks/${taskId}/move`, owner.token, workspaceId, { column: 'today', before_task_id: null })
    expect(await kinds()).toEqual(['task', 'break'])
  })

  it('answers 422 for a period longer than the agenda reads', async () => {
    const { owner, workspaceId } = await setup()
    const reply = await send('GET', `/api/plans?from=${await day(0)}&to=${await day(42)}`, owner.token, workspaceId)
    expect(reply.statusCode).toBe(422)
    expect(reply.json().detail[0].loc).toEqual(['query', 'to'])
  })
})

describe('PUT /api/users/me/workday (PLAN-22, PLAN-23, PLAN-41)', () => {
  it('saves the workday, keeps the other preferences and the plan answers it', async () => {
    const { owner, workspaceId } = await setup()
    await t.app.inject({ method: 'PATCH', url: '/api/users/me', headers: bearer(owner.token), payload: { preferences: { theme: 'dark' } } })
    const reply = await send('PUT', '/api/users/me/workday', owner.token, workspaceId, { start: '08:30', end: '17:15' })
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ start: '08:30', end: '17:15' })
    expect((await t.app.inject({ method: 'GET', url: '/api/users/me', headers: bearer(owner.token) })).json().preferences).toEqual({
      theme: 'dark',
      workday: { start: '08:30', end: '17:15' },
    })
    expect((await send('GET', `/api/plans/${await day(1)}`, owner.token, workspaceId)).json().workday).toEqual({ start: '08:30', end: '17:15' })
  })

  it('answers 422 for an end not after the start and for a time out of HH:MM (PLAN-23)', async () => {
    const { owner, workspaceId } = await setup()
    for (const body of [
      { start: '18:00', end: '09:00' },
      { start: '09:00', end: '09:00' },
    ]) {
      const reply = await send('PUT', '/api/users/me/workday', owner.token, workspaceId, body)
      expect(reply.statusCode).toBe(422)
      expect(reply.json()).toMatchObject({ code: 'workday_end_before_start' })
    }
    const reply = await send('PUT', '/api/users/me/workday', owner.token, workspaceId, { start: '9:00', end: '18:00' })
    expect(reply.statusCode).toBe(422)
    expect(reply.json().detail[0].loc).toEqual(['body', 'start'])
  })

  it('answers 403 Read-only role to a viewer and keeps the workday (PLAN-41)', async () => {
    const { viewer, workspaceId } = await setup()
    const reply = await send('PUT', '/api/users/me/workday', viewer.token, workspaceId, { start: '08:00', end: '17:00' })
    expect(reply.statusCode).toBe(403)
    expect(reply.json().detail).toBe('Read-only role')
    expect((await send('GET', `/api/plans/${await day(1)}`, viewer.token, workspaceId)).json().workday).toEqual({ start: '09:00', end: '18:00' })
  })
})

describe('the plan routes (PLAN-12, PLAN-42)', () => {
  const routes = async (taskId: string): Promise<Array<{ method: Method; url: string; payload?: object }>> => {
    const tomorrow = await day(1)
    return [
      { method: 'GET', url: `/api/plans/${tomorrow}` },
      { method: 'PUT', url: `/api/plans/${tomorrow}`, payload: { base_version: 0, blocks: [{ kind: 'task', task_id: taskId, start: '09:00', minutes: 60 }] } },
      { method: 'GET', url: `/api/plans/${tomorrow}/candidates` },
      { method: 'GET', url: `/api/plans?from=${tomorrow}&to=${tomorrow}` },
      { method: 'PUT', url: '/api/users/me/workday', payload: { start: '08:00', end: '17:00' } },
    ]
  }

  it('answer 403 to an access token, whatever its scopes (AD-007, PLAN-42)', async () => {
    const { owner, workspaceId, taskId } = await setup()
    const token = await mintToken(t, owner.token, workspaceId)
    for (const route of await routes(taskId)) {
      const reply = await t.app.inject({ method: route.method, url: route.url, headers: bearer(token.value), payload: route.payload })
      expect(reply.statusCode, route.url).toBe(403)
      expect(reply.json().detail, route.url).toBe('Route not available for tokens')
    }
  })

  it('answer 404 for a workspace the user is not a member of (PLAN-12)', async () => {
    const { stranger, workspaceId, taskId } = await setup()
    for (const route of await routes(taskId)) {
      const reply = await send(route.method, route.url, stranger.token, workspaceId, route.payload)
      expect(reply.statusCode, route.url).toBe(404)
    }
  })
})
