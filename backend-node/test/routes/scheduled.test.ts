import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type User, inWorkspace, ownerViewerStranger } from '../support/roles.ts'
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

const DAY_MS = 24 * 60 * 60_000
const date = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY_MS).toISOString().slice(0, 10)
const period = `from=${date(0)}&to=${date(13)}`

let owner: User
let viewer: User
let stranger: User
let workspaceId: string
let strangerWorkspaceId: string
let listId: string

beforeEach(async () => {
  ;({ owner, viewer, stranger, workspaceId, strangerWorkspaceId } = await ownerViewerStranger(t))
  await t.app.inject({ method: 'PATCH', url: `/api/workspaces/${workspaceId}`, headers: bearer(owner.token), payload: { timezone: 'UTC' } })
  listId = (await call('POST', '/api/lists', owner.token, workspaceId, { name: 'Work', color: 3 })).json().id as string
})

const schedule = async (title: string, on: string, time: string | null) =>
  (
    await call('POST', '/api/tasks', owner.token, workspaceId, {
      list_id: listId,
      title,
      estimate_minutes: 30,
      scheduled_on: on,
      scheduled_time: time,
    })
  ).json().id as string

describe('GET /api/agenda/scheduled (US-5, US-14)', () => {
  it('answers the timed, untimed and projected tasks of the period to the owner and to a viewer of the workspace (D9)', async () => {
    const timed = await schedule('Write', date(2), '10:00')
    const untimed = await schedule('Read', date(3), null)

    for (const token of [owner.token, viewer.token]) {
      const reply = await call('GET', `/api/agenda/scheduled?${period}`, token, workspaceId)
      expect(reply.statusCode).toBe(200)
      expect(reply.json()).toEqual({
        timed: [
          {
            id: timed,
            title: 'Write',
            list: { id: listId, name: 'Work', color: 3 },
            column: expect.any(String),
            position: expect.any(Number),
            estimate_minutes: 30,
            scheduled_on: date(2),
            scheduled_time: '10:00',
            series: null,
            kind: 'task',
          },
        ],
        untimed: [expect.objectContaining({ id: untimed, scheduled_on: date(3), scheduled_time: null })],
        projected: [],
      })
    }
  })

  it('answers the projections of a series with a time, and the rule of its open occurrence', async () => {
    const id = await schedule('Daily', date(1), '09:00')
    await call('PATCH', `/api/tasks/${id}`, owner.token, workspaceId, { recurrence: { freq: 'daily', interval: 1, count: 3 } })
    const reply = (await call('GET', `/api/agenda/scheduled?${period}`, owner.token, workspaceId)).json()
    expect(reply.timed[0].series).toEqual({
      id: expect.any(String),
      rule: { freq: 'daily', interval: 1, weekdays: null, month_day: null, until: null, count: 3 },
    })
    const rule = { freq: 'daily', interval: 1, weekdays: null, month_day: null, until: null, count: 3 }
    const projection = (on: string) => ({
      series_id: reply.timed[0].series.id,
      task_id: id,
      title: 'Daily',
      list: { id: listId, name: 'Work', color: 3 },
      on,
      time: '09:00',
      estimate_minutes: 30,
      rule,
    })
    expect(reply.projected).toEqual([projection(date(2)), projection(date(3))])
  })

  it('answers nothing of another workspace', async () => {
    await schedule('Write', date(2), '10:00')
    const reply = await call('GET', `/api/agenda/scheduled?${period}`, stranger.token, strangerWorkspaceId)
    expect(reply.statusCode).toBe(200)
    expect(reply.json()).toEqual({ timed: [], untimed: [], projected: [] })
    expect((await call('GET', `/api/agenda/scheduled?${period}`, stranger.token, workspaceId)).statusCode).toBe(404)
  })

  it('answers 422 for 43 days, an end before the start or a missing date, and 200 for 42 days', async () => {
    const get = (query: string) => call('GET', `/api/agenda/scheduled?${query}`, owner.token, workspaceId)

    const tooLong = await get('from=2026-10-01&to=2026-11-12')
    expect(tooLong.statusCode).toBe(422)
    expect(tooLong.json().detail[0]).toMatchObject({ loc: ['query', 'to'], msg: 'The period can have at most 42 days' })
    const reversed = await get('from=2026-11-08&to=2026-11-02')
    expect(reversed.statusCode).toBe(422)
    expect(reversed.json().detail[0]).toMatchObject({ loc: ['query', 'to'], msg: 'The period must not end before it starts' })
    expect((await get('from=2026-11-08')).statusCode).toBe(422)
    expect((await get('from=2026-13-01&to=2026-13-02')).statusCode).toBe(422)
    expect((await get('from=2026-10-01&to=2026-11-11')).statusCode).toBe(200)
  })

  it('AD-007 answers 403 to an access token with every scope', async () => {
    const token = await mintToken(t, owner.token, workspaceId)
    const reply = await t.app.inject({ method: 'GET', url: `/api/agenda/scheduled?${period}`, headers: bearer(token.value) })
    expect(reply.statusCode).toBe(403)
    expect(reply.json().detail).toBe('Route not available for tokens')
  })

  it('answers 401 without a session', async () => {
    expect((await t.app.inject({ method: 'GET', url: `/api/agenda/scheduled?${period}` })).statusCode).toBe(401)
  })
})
