import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type User, inWorkspace, ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, createTestApp } from '../support/test-app.ts'

let t: TestApp
let call: ReturnType<typeof inWorkspace>
beforeAll(async () => {
  t = await createTestApp()
  call = inWorkspace(t)
})
afterAll(async () => {
  await t.close()
})

let owner: User
let viewer: User
let stranger: User
let workspaceId: string
let strangerWorkspaceId: string
let listId: string
let taskA: string
let taskB: string

beforeEach(async () => {
  ;({ owner, viewer, workspaceId, stranger, strangerWorkspaceId } = await ownerViewerStranger(t))
  listId = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Work', color: 1 })).json().id
  const task = async (title: string, estimate: number | null) =>
    (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title, estimate_minutes: estimate, column: 'today' })).json()
      .id as string
  taskA = await task('A', 60)
  taskB = await task('B', 30)
})

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString()
const action = (extra: Record<string, unknown> = {}) => ({ action_id: randomUUID(), occurred_at: ago(0), device_id: 'A', ...extra })
const post = (path: string, body: Record<string, unknown>, token = owner.token) => call('POST', `/api/focus/${path}`, token, workspaceId, body)
const start = (taskId = taskA, extra: Record<string, unknown> = {}) => post('start', action({ task_id: taskId, ...extra }))

const expectServerNow = (body: { server_now?: unknown }) => {
  expect(typeof body.server_now).toBe('string')
  expect(Math.abs(new Date(body.server_now as string).getTime() - Date.now())).toBeLessThan(5_000)
}

describe('GET /api/focus', () => {
  it('FOCUS-02 answers the focus state of the list, also to a viewer, with server_now', async () => {
    const owners = await call('GET', `/api/focus?list_id=${listId}`, owner.token, workspaceId)
    expect(owners.statusCode).toBe(200)
    expect(owners.json()).toMatchObject({
      session: null,
      task: { id: taskA, title: 'A', estimate_minutes: 60, spent_seconds: 0, awaiting_extend: false },
      today: {
        pending: 2,
        done: 0,
        estimate_minutes: 90,
        tasks: [
          { id: taskA, title: 'A', estimate_minutes: 60, spent_seconds: 0, awaiting_extend: false },
          { id: taskB, title: 'B', estimate_minutes: 30, spent_seconds: 0, awaiting_extend: false },
        ],
      },
      stale: null,
    })
    expect(owners.json().today.tasks.map((task: { position: unknown }) => typeof task.position)).toEqual(['number', 'number'])
    expectServerNow(owners.json())

    const viewers = await call('GET', `/api/focus?list_id=${listId}`, viewer.token, workspaceId)
    expect(viewers.statusCode).toBe(200)
    expect(viewers.json().task.id).toBe(taskA)
  })

  it('answers 422 for a list_id that is not a UUID and 404 for a list of another workspace, with server_now', async () => {
    const invalid = await call('GET', '/api/focus?list_id=nope', owner.token, workspaceId)
    expect(invalid.statusCode).toBe(422)
    expectServerNow(invalid.json())

    const foreign = await call('GET', `/api/focus?list_id=${listId}`, stranger.token, strangerWorkspaceId)
    expect(foreign.statusCode).toBe(404)
    expect(foreign.json()).toMatchObject({ detail: 'List not found' })
    expectServerNow(foreign.json())
  })
})

describe('GET /api/focus without list_id', () => {
  it('SYNC-08 SYNC-09 answers no session and an empty Today when nothing is open', async () => {
    const reply = await call('GET', '/api/focus', owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({
      session: null,
      task: null,
      today: { pending: 0, done: 0, estimate_minutes: 0, tasks: [] },
      stale: null,
    })
    expectServerNow(reply.json())
  })

  it('SYNC-08 SYNC-09 answers the open session with the state of its list', async () => {
    const opened = (await start(taskA)).json()
    const reply = await call('GET', '/api/focus', owner.token, workspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toMatchObject({
      session: { id: opened.session.id, kind: 'task', task_id: taskA, list_id: listId, device_id: 'A' },
      task: { id: taskA, title: 'A' },
      today: { pending: 2, estimate_minutes: 90 },
      stale: null,
    })
  })
})

describe('POST /api/focus/start', () => {
  it('FOCUS-02 opens a session on the task with deadline = start + estimate', async () => {
    const occurred = ago(1)
    const reply = await post('start', action({ task_id: taskA, occurred_at: occurred }))
    expect(reply.statusCode).toBe(200)
    expect(reply.json().session).toMatchObject({
      kind: 'task',
      task_id: taskA,
      list_id: listId,
      device_id: 'A',
      started_at: occurred,
      deadline_at: new Date(new Date(occurred).getTime() + 3_600_000).toISOString(),
      planned_seconds: null,
    })
    expectServerNow(reply.json())
  })

  it('AD-002 the same action_id twice answers the same state and opens one session', async () => {
    const body = action({ task_id: taskA })
    const first = await post('start', body)
    const again = await post('start', body)
    expect(again.statusCode).toBe(200)
    expect({ ...again.json(), server_now: null }).toEqual({ ...first.json(), server_now: null })
    const state = (await call('GET', `/api/focus?list_id=${listId}`, owner.token, workspaceId)).json()
    expect(state.session.id).toBe(first.json().session.id)
  })

  it('SYNC-02 answers 409 focus_elsewhere with the open session of another device; SYNC-04 takeover switches', async () => {
    const opened = (await start(taskA)).json().session
    const elsewhere = await post('start', action({ task_id: taskB, device_id: 'B' }))
    expect(elsewhere.statusCode).toBe(409)
    expect(elsewhere.json()).toMatchObject({ code: 'focus_elsewhere', session: { id: opened.id, device_id: 'A', task_id: taskA } })
    expectServerNow(elsewhere.json())

    const taken = await post('start', action({ task_id: taskB, device_id: 'B', takeover: true }))
    expect(taken.statusCode).toBe(200)
    expect(taken.json().session).toMatchObject({ task_id: taskB, device_id: 'B' })
  })

  it('FOCUS-18 answers 409 invalid_transition for a task outside Today', async () => {
    const later = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Later', column: 'backlog' })).json().id
    const reply = await start(later)
    expect(reply.statusCode).toBe(409)
    expect(reply.json()).toMatchObject({ code: 'invalid_transition' })
    expectServerNow(reply.json())
  })

  it('AD-002 answers 422 invalid_time for occurred_at 6 s in the future or 25h old', async () => {
    for (const occurred of [new Date(Date.now() + 6_000).toISOString(), ago(25 * 3600)]) {
      const reply = await post('start', action({ task_id: taskA, occurred_at: occurred }))
      expect(reply.statusCode).toBe(422)
      expect(reply.json()).toMatchObject({ code: 'invalid_time' })
      expectServerNow(reply.json())
    }
  })
})

describe('POST /api/focus/pause', () => {
  it('FOCUS-04 ends the session; FOCUS-18 a second pause answers 409; a resent pause answers 200 again', async () => {
    await start(taskA, { occurred_at: ago(10) })
    const body = action()
    const paused = await post('pause', body)
    expect(paused.statusCode).toBe(200)
    expect(paused.json()).toMatchObject({ session: null, task: { id: taskA } })
    expect(paused.json().task.spent_seconds).toBeGreaterThanOrEqual(10)

    const again = await post('pause', action())
    expect(again.statusCode).toBe(409)
    expect(again.json()).toMatchObject({ code: 'invalid_transition' })

    const resent = await post('pause', body)
    expect(resent.statusCode).toBe(200)
    expect(resent.json().task).toEqual(paused.json().task)
  })
})

describe('POST /api/focus/skip', () => {
  it('FOCUS-06 moves the task to the end of Today and starts the next one; FOCUS-07 409 with one pending', async () => {
    await start(taskA, { occurred_at: ago(5) })
    const body = action({ task_id: taskA })
    const skipped = await post('skip', body)
    expect(skipped.statusCode).toBe(200)
    expect(skipped.json().session).toMatchObject({ task_id: taskB })
    expect((await post('skip', body)).json().session.task_id).toBe(taskB)

    await call('POST', `/api/tasks/${taskA}/move`, owner.token, workspaceId, { column: 'backlog', before_task_id: null })
    const single = await post('skip', action({ task_id: taskB }))
    expect(single.statusCode).toBe(409)
    expect(single.json()).toMatchObject({ code: 'invalid_transition' })
  })
})

describe('POST /api/focus/complete', () => {
  it('FOCUS-08 moves the task to done and starts the next one; FOCUS-18 completing it again answers 409', async () => {
    await start(taskA, { occurred_at: ago(5) })
    const body = action({ task_id: taskA })
    const done = await post('complete', body)
    expect(done.statusCode).toBe(200)
    expect(done.json()).toMatchObject({ session: { task_id: taskB }, today: { pending: 1, done: 1 } })
    const task = (await call('GET', `/api/tasks/${taskA}`, owner.token, workspaceId)).json()
    expect(task).toMatchObject({ column: 'done', completed_at: body.occurred_at })

    expect((await post('complete', body)).statusCode).toBe(200)
    const twice = await post('complete', action({ task_id: taskA }))
    expect(twice.statusCode).toBe(409)
    expect(twice.json()).toMatchObject({ code: 'invalid_transition' })
    expect((await call('GET', `/api/tasks/${taskA}`, owner.token, workspaceId)).json().completed_at).toBe(body.occurred_at)
  })
})

describe('POST /api/focus/extend', () => {
  it('FOCUS-12 opens a session without deadline after the estimate ran out; FOCUS-18 409 otherwise', async () => {
    const short = (await call('POST', '/api/tasks', owner.token, workspaceId, { list_id: listId, title: 'Short', estimate_minutes: 1, column: 'today' }))
      .json().id
    const early = await post('extend', action({ task_id: short }))
    expect(early.statusCode).toBe(409)
    expect(early.json()).toMatchObject({ code: 'invalid_transition' })

    await start(short, { occurred_at: ago(120) })
    const body = action({ task_id: short })
    const extended = await post('extend', body)
    expect(extended.statusCode).toBe(200)
    expect(extended.json()).toMatchObject({ session: { task_id: short, deadline_at: null }, task: { estimate_minutes: 1 } })
    expect((await post('extend', body)).json().session.id).toBe(extended.json().session.id)
  })
})

describe('POST /api/focus/break and /api/focus/break/end', () => {
  it('BREAK-01 opens a break; BREAK-02 422 for 0 and 121; 409 during a break; BREAK-04 break/end ends it', async () => {
    for (const minutes of [0, 121]) {
      const refused = await post('break', action({ minutes, list_id: listId }))
      expect(refused.statusCode).toBe(422)
      expectServerNow(refused.json())
    }
    const body = action({ minutes: 5, list_id: listId, occurred_at: ago(30) })
    const opened = await post('break', body)
    expect(opened.statusCode).toBe(200)
    expect(opened.json().session).toMatchObject({ kind: 'break', task_id: null, list_id: listId, planned_seconds: 300 })
    expect((await post('break', body)).json().session.id).toBe(opened.json().session.id)

    const twice = await post('break', action({ minutes: 5, list_id: listId }))
    expect(twice.statusCode).toBe(409)
    expect(twice.json()).toMatchObject({ code: 'invalid_transition' })

    const endBody = action()
    const ended = await post('break/end', endBody)
    expect(ended.statusCode).toBe(200)
    expect(ended.json()).toMatchObject({ session: null, task: { id: taskA } })
    expect((await post('break/end', endBody)).statusCode).toBe(200)
    const none = await post('break/end', action())
    expect(none.statusCode).toBe(409)
    expect(none.json()).toMatchObject({ code: 'invalid_transition' })
  })
})

describe('POST /api/focus/heartbeat', () => {
  it('SYNC-10 refreshes the signal of this device; another device or no session answers 409; resending is harmless', async () => {
    const none = await post('heartbeat', { device_id: 'A' })
    expect(none.statusCode).toBe(409)
    expect(none.json()).toMatchObject({ code: 'invalid_transition' })

    await start(taskA, { occurred_at: ago(150) })
    expect((await call('GET', `/api/focus?list_id=${listId}`, owner.token, workspaceId)).json().stale).not.toBeNull()
    const beat = await post('heartbeat', { device_id: 'A' })
    expect(beat.statusCode).toBe(200)
    expect(beat.json()).toMatchObject({ session: { device_id: 'A' }, stale: null })
    expectServerNow(beat.json())
    expect((await post('heartbeat', { device_id: 'A' })).statusCode).toBe(200)

    const other = await post('heartbeat', { device_id: 'B' })
    expect(other.statusCode).toBe(409)
    expect(other.json()).toMatchObject({ code: 'invalid_transition' })
  })
})

describe('POST /api/focus/recover', () => {
  it('SYNC-11 cut ends a stale session at its last signal; keep refreshes it; a fresh session answers 409', async () => {
    const lastSignal = ago(300)
    await start(taskB, { occurred_at: lastSignal })
    const body = action({ decision: 'cut' })
    const cut = await post('recover', body)
    expect(cut.statusCode).toBe(200)
    expect(cut.json()).toMatchObject({ session: null, stale: null })
    const board = (await call('GET', `/api/lists/${listId}/board`, owner.token, workspaceId)).json()
    expect(board.columns.today.tasks.find((card: { id: string }) => card.id === taskB).spent_seconds).toBe(0)
    expect((await post('recover', body)).statusCode).toBe(200)

    await start(taskB, { occurred_at: ago(200) })
    const kept = await post('recover', action({ decision: 'keep' }))
    expect(kept.statusCode).toBe(200)
    expect(kept.json()).toMatchObject({ session: { task_id: taskB }, stale: null })

    const fresh = await post('recover', action({ decision: 'keep' }))
    expect(fresh.statusCode).toBe(409)
    expect(fresh.json()).toMatchObject({ code: 'invalid_transition' })
  })
})

describe('every focus action', () => {
  const bodies = (): Array<[string, Record<string, unknown>]> => [
    ['start', action({ task_id: taskA })],
    ['pause', action()],
    ['skip', action({ task_id: taskA })],
    ['complete', action({ task_id: taskA })],
    ['extend', action({ task_id: taskA })],
    ['break', action({ minutes: 5, list_id: listId })],
    ['break/end', action()],
    ['heartbeat', { device_id: 'A' }],
    ['recover', action({ decision: 'keep' })],
  ]

  it('FOCUS-17 answers 403 Read-only role to a viewer, with server_now, and records nothing', async () => {
    for (const [path, body] of bodies()) {
      const reply = await post(path, body, viewer.token)
      expect(reply.statusCode, path).toBe(403)
      expect(reply.json()).toMatchObject({ detail: 'Read-only role' })
      expectServerNow(reply.json())
    }
    const state = (await call('GET', `/api/focus?list_id=${listId}`, owner.token, workspaceId)).json()
    expect(state.session).toBeNull()
  })

  it('answers 422 to a body without device_id, and the actions to a body without action_id or occurred_at', async () => {
    for (const [path, body] of bodies()) {
      const { device_id: _device, ...withoutDevice } = body
      expect((await post(path, withoutDevice)).statusCode, path).toBe(422)
      if (path === 'heartbeat') continue
      const { action_id: _id, ...withoutId } = body
      expect((await post(path, withoutId)).statusCode, path).toBe(422)
      const reply = await post(path, { ...body, occurred_at: 'yesterday' })
      expect(reply.statusCode, path).toBe(422)
      expectServerNow(reply.json())
    }
  })
})
