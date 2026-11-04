import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type User, inWorkspace, invite, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

const MINUTE = 60_000
const DAY_MS = 24 * 60 * MINUTE
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString()
const date = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)
const week = () => `from=${date(-3)}&to=${date(3)}`

let owner: User
let viewer: User
let stranger: User
let workspaceId: string
let strangerWorkspaceId: string
let listId: string
let taskId: string

beforeEach(async () => {
  ;({ owner, viewer, stranger, workspaceId, strangerWorkspaceId } = await ownerViewerStranger(t))
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'UTC' } })
  listId = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Work', color: 3 })).json().id as string
  taskId = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Write', column: 'today' })).json().id as string
})

/** A manual session of `minutes` on the task, ending `endMinutesAgo` before now. */
const create = (minutes: number, endMinutesAgo: number, token = owner.token) =>
  call('POST', '/api/sessions', token, workspaceId, {
    kind: 'task',
    task_id: taskId,
    started_at: ago(endMinutesAgo + minutes),
    ended_at: ago(endMinutesAgo),
  })

const spentOnTask = async () => {
  const state = await call('GET', `/api/focus?list_id=${listId}`, owner.token, workspaceId)
  return (state.json().today.tasks as Array<{ id: string; spent_seconds: number }>).find((task) => task.id === taskId)!.spent_seconds
}

/** Starts the focus on the task 10 minutes ago: the open session. */
async function startFocus(): Promise<string> {
  const started = await call('POST', '/api/focus/start', owner.token, workspaceId, {
    action_id: randomUUID(),
    occurred_at: ago(10),
    device_id: 'A',
    task_id: taskId,
  })
  expect(started.statusCode).toBe(200)
  return started.json().session.id as string
}

describe('GET /api/sessions', () => {
  it('AGENDA-01 AGENDA-05 AGENDA-10 answers the user sessions with the open one; a viewer reads their own, empty agenda', async () => {
    const manual = (await create(75, 120)).json()
    const open = await startFocus()

    const owners = await call('GET', `/api/sessions?${week()}`, owner.token, workspaceId)
    expect(owners.statusCode).toBe(200)
    expect(owners.json().sessions).toEqual([
      {
        id: manual.id,
        kind: 'task',
        origin: 'manual',
        task_id: taskId,
        task_title: 'Write',
        list_id: listId,
        list_name: 'Work',
        list_color: 3,
        started_at: manual.started_at,
        ended_at: manual.ended_at,
      },
      expect.objectContaining({ id: open, origin: 'focus', task_id: taskId, ended_at: null }),
    ])

    const viewers = await call('GET', `/api/sessions?${week()}`, viewer.token, workspaceId)
    expect(viewers.statusCode).toBe(200)
    expect(viewers.json()).toEqual({ sessions: [] })
  })

  it('AGENDA-09 filters by list_id', async () => {
    await create(30, 60)
    const other = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Home', color: 2 })).json().id as string

    const filtered = await call('GET', `/api/sessions?${week()}&list_id=${other}`, owner.token, workspaceId)
    expect(filtered.statusCode).toBe(200)
    expect(filtered.json()).toEqual({ sessions: [] })
  })

  it('AGENDA-45 answers 422 for 43 days or an end before the start, and 200 for 42 days', async () => {
    const get = (query: string) => call('GET', `/api/sessions?${query}`, owner.token, workspaceId)

    const tooLong = await get('from=2026-10-01&to=2026-11-12')
    expect(tooLong.statusCode).toBe(422)
    expect(tooLong.json().detail[0]).toMatchObject({ loc: ['query', 'to'], msg: 'The period can have at most 42 days' })
    const reversed = await get('from=2026-11-08&to=2026-11-02')
    expect(reversed.statusCode).toBe(422)
    expect(reversed.json().detail[0]).toMatchObject({ loc: ['query', 'to'], msg: 'The period must not end before it starts' })
    expect((await get('from=2026-10-01&to=2026-11-11')).statusCode).toBe(200)
  })
})

describe('GET /api/sessions/tasks (AGENDA-16)', () => {
  it('answers the tasks of the active lists to any member, a done one included', async () => {
    const done = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Shipped', column: 'done' })).json().id as string

    for (const token of [owner.token, viewer.token]) {
      const found = await call('GET', '/api/sessions/tasks', token, workspaceId)
      expect(found.statusCode).toBe(200)
      expect(found.json()).toEqual({
        tasks: [
          { id: taskId, title: 'Write', list_id: listId, list_name: 'Work', list_color: 3, column: 'today' },
          { id: done, title: 'Shipped', list_id: listId, list_name: 'Work', list_color: 3, column: 'done' },
        ],
      })
    }
  })

  it('answers only the tasks of the workspace asked for', async () => {
    const theirList = (await call('POST', '/api/lists', stranger.token, strangerWorkspaceId, { name: 'Theirs', color: 1 })).json().id as string
    await call('POST', '/api/tasks', stranger.token, strangerWorkspaceId, { list_id: theirList, title: 'X', column: 'today' })

    const found = await call('GET', '/api/sessions/tasks', owner.token, workspaceId)
    expect((found.json().tasks as Array<{ id: string }>).map((task) => task.id)).toEqual([taskId])
  })
})

describe('POST /api/sessions', () => {
  it('AGENDA-20 AGENDA-21 AGENDA-22 AGENDA-46 answers 201 with origin manual; focus and reports count it', async () => {
    const created = await create(75, 120)

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ kind: 'task', origin: 'manual', task_id: taskId, task_title: 'Write', list_id: listId })
    expect(await spentOnTask()).toBe(4500)
    const day = created.json().started_at.slice(0, 10) as string
    const end = created.json().ended_at.slice(0, 10) as string
    const report = await call('GET', `/api/reports/overview?from=${day}&to=${end}`, owner.token, workspaceId)
    expect(report.json().tiles.task_seconds).toBe(4500)
  })

  it('AGENDA-16 records a break on a list', async () => {
    const created = await call('POST', '/api/sessions', owner.token, workspaceId, {
      kind: 'break',
      list_id: listId,
      started_at: ago(30),
      ended_at: ago(20),
    })

    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ kind: 'break', origin: 'manual', task_id: null, task_title: null, list_id: listId })
  })

  it('AGENDA-44 answers 403 Read-only role to a viewer and records nothing', async () => {
    const refused = await create(30, 60, viewer.token)

    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual({ detail: 'Read-only role' })
    expect((await call('GET', `/api/sessions?${week()}`, owner.token, workspaceId)).json().sessions).toEqual([])
  })

  it('AGENDA-25 answers 404 Task not found for a task of another workspace', async () => {
    const theirList = (await call('POST', '/api/lists', stranger.token, strangerWorkspaceId, { name: 'Theirs', color: 1 })).json().id as string
    const theirs = (await call('POST', '/api/tasks', stranger.token, strangerWorkspaceId, { list_id: theirList, title: 'X', column: 'today' })).json()
      .id as string

    const refused = await call('POST', '/api/sessions', owner.token, workspaceId, {
      kind: 'task',
      task_id: theirs,
      started_at: ago(60),
      ended_at: ago(30),
    })

    expect(refused.statusCode).toBe(404)
    expect(refused.json()).toEqual({ detail: 'Task not found' })
  })

  it('AGENDA-23 AGENDA-24 answers 422 invalid_time for an end in the future and invalid_duration for 30 s', async () => {
    const future = await call('POST', '/api/sessions', owner.token, workspaceId, {
      kind: 'task',
      task_id: taskId,
      started_at: ago(30),
      ended_at: new Date(Date.now() + 10 * MINUTE).toISOString(),
    })
    expect(future.statusCode).toBe(422)
    expect(future.json()).toMatchObject({ code: 'invalid_time' })

    const short = await call('POST', '/api/sessions', owner.token, workspaceId, {
      kind: 'task',
      task_id: taskId,
      started_at: new Date(Date.now() - 90_000).toISOString(),
      ended_at: new Date(Date.now() - 60_000).toISOString(),
    })
    expect(short.statusCode).toBe(422)
    expect(short.json()).toMatchObject({ code: 'invalid_duration' })

    const noTask = await call('POST', '/api/sessions', owner.token, workspaceId, { kind: 'task', started_at: ago(30), ended_at: ago(10) })
    expect(noTask.statusCode).toBe(422)
  })
})

describe('PATCH /api/sessions/:id', () => {
  it('AGENDA-29 AGENDA-31 answers 200 with the new end, keeps the origin and adds the time', async () => {
    const created = (await create(60, 120)).json()

    const updated = await call('PATCH', `/api/sessions/${created.id}`, owner.token, workspaceId, { ended_at: ago(90) })

    expect(updated.statusCode).toBe(200)
    expect(updated.json()).toMatchObject({ id: created.id, origin: 'manual', started_at: created.started_at })
    expect(await spentOnTask()).toBe(90 * 60)
  })

  it('AGENDA-44 answers 403 Read-only role to a viewer', async () => {
    const created = (await create(60, 120)).json()

    const refused = await call('PATCH', `/api/sessions/${created.id}`, viewer.token, workspaceId, { ended_at: ago(90) })

    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual({ detail: 'Read-only role' })
  })

  it('AGENDA-34 AGENDA-25 answers 404 Session not found for an unknown session and 404 Task not found for a foreign task', async () => {
    const created = (await create(60, 120)).json()
    const theirList = (await call('POST', '/api/lists', stranger.token, strangerWorkspaceId, { name: 'Theirs', color: 1 })).json().id as string
    const theirs = (await call('POST', '/api/tasks', stranger.token, strangerWorkspaceId, { list_id: theirList, title: 'X', column: 'today' })).json()
      .id as string

    const unknown = await call('PATCH', `/api/sessions/${randomUUID()}`, owner.token, workspaceId, { ended_at: ago(90) })
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json()).toEqual({ detail: 'Session not found' })
    const foreign = await call('PATCH', `/api/sessions/${created.id}`, owner.token, workspaceId, { task_id: theirs })
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toEqual({ detail: 'Task not found' })
  })

  it('AGENDA-34 answers 404 Session not found for the session of another member', async () => {
    const created = (await create(60, 120)).json()
    const editor = await invite(t, owner.token, workspaceId, 'editor')

    const refused = await call('PATCH', `/api/sessions/${created.id}`, editor.token, workspaceId, { ended_at: ago(90) })

    expect(refused.statusCode).toBe(404)
    expect(refused.json()).toEqual({ detail: 'Session not found' })
  })

  it('AGENDA-33 answers 409 session_running for the open session', async () => {
    const open = await startFocus()

    const refused = await call('PATCH', `/api/sessions/${open}`, owner.token, workspaceId, { started_at: ago(20) })

    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({ code: 'session_running' })
  })

  it('AGENDA-24 answers 422 invalid_duration for an end before the start', async () => {
    const created = (await create(60, 120)).json()

    const refused = await call('PATCH', `/api/sessions/${created.id}`, owner.token, workspaceId, { ended_at: ago(200) })

    expect(refused.statusCode).toBe(422)
    expect(refused.json()).toMatchObject({ code: 'invalid_duration' })
  })
})

describe('a session of the same user in another workspace (AGENDA-10, AGENDA-34)', () => {
  it('answers 404 Session not found to PATCH and DELETE through this workspace and keeps it', async () => {
    const other = (await t.app.inject({ method: 'POST', url: '/api/workspaces', headers: bearer(owner.token), payload: { name: 'Mine too', self_membership: true } }))
      .json().id as string
    const otherList = (await call('POST', '/api/lists', owner.token, other, { name: 'Elsewhere', color: 1 })).json().id as string
    const elsewhere = (
      await call('POST', '/api/sessions', owner.token, other, { kind: 'break', list_id: otherList, started_at: ago(60), ended_at: ago(30) })
    ).json()

    const edited = await call('PATCH', `/api/sessions/${elsewhere.id}`, owner.token, workspaceId, { ended_at: ago(20) })
    expect(edited.statusCode).toBe(404)
    expect(edited.json()).toEqual({ detail: 'Session not found' })
    const deleted = await call('DELETE', `/api/sessions/${elsewhere.id}`, owner.token, workspaceId)
    expect(deleted.statusCode).toBe(404)
    expect(deleted.json()).toEqual({ detail: 'Session not found' })

    const kept = await call('GET', `/api/sessions?${week()}`, owner.token, other)
    expect(kept.json().sessions).toEqual([expect.objectContaining({ id: elsewhere.id, started_at: elsewhere.started_at, ended_at: elsewhere.ended_at })])
  })
})

describe('DELETE /api/sessions/:id', () => {
  it('AGENDA-32 AGENDA-46 answers 204 and takes the time out of the task', async () => {
    const created = (await create(60, 120)).json()
    expect(await spentOnTask()).toBe(3600)

    const deleted = await call('DELETE', `/api/sessions/${created.id}`, owner.token, workspaceId)

    expect(deleted.statusCode).toBe(204)
    expect(await spentOnTask()).toBe(0)
  })

  it('AGENDA-44 answers 403 Read-only role to a viewer', async () => {
    const created = (await create(60, 120)).json()

    const refused = await call('DELETE', `/api/sessions/${created.id}`, viewer.token, workspaceId)

    expect(refused.statusCode).toBe(403)
    expect(refused.json()).toEqual({ detail: 'Read-only role' })
    expect(await spentOnTask()).toBe(3600)
  })

  it('AGENDA-34 answers 404 Session not found', async () => {
    const refused = await call('DELETE', `/api/sessions/${randomUUID()}`, owner.token, workspaceId)

    expect(refused.statusCode).toBe(404)
    expect(refused.json()).toEqual({ detail: 'Session not found' })
  })

  it('AGENDA-33 answers 409 session_running for the open session', async () => {
    const open = await startFocus()

    const refused = await call('DELETE', `/api/sessions/${open}`, owner.token, workspaceId)

    expect(refused.statusCode).toBe(409)
    expect(refused.json()).toMatchObject({ code: 'session_running' })
  })
})
