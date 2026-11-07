/**
 * @vitest-environment jsdom
 *
 * The requests the focus client builds, seen at the HTTP layer: axios runs for real (interceptors,
 * query serialization) and only the adapter that would hit the network is replaced. The auth
 * interceptor reads localStorage, hence the browser environment.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'

import type { QueuedAction } from '@/lib/focus/queue'

interface SentRequest {
  method: string | undefined
  url: string
  body: unknown
  authorization: unknown
}

const http = vi.hoisted(() => ({ sent: [] as SentRequest[], getUri: (config: InternalAxiosRequestConfig) => config.url ?? '' }))

vi.mock('axios', async (importOriginal) => {
  const actual = await importOriginal<typeof import('axios')>()
  const axios = actual.default
  http.getUri = (config) => axios.getUri(config)
  const adapter = async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    http.sent.push({
      method: config.method,
      url: http.getUri(config),
      body: typeof config.data === 'string' ? JSON.parse(config.data) : config.data,
      authorization: config.headers.Authorization,
    })
    return { data: { answered: true }, status: 200, statusText: 'OK', headers: {}, config }
  }
  const create: typeof axios.create = (config) => axios.create({ ...config, adapter })
  return { ...actual, default: Object.assign(Object.create(axios) as typeof axios, { create }) }
})

const { agenda, focus, reports, tasks } = await import('@/lib/api')

const LIST = '6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b'
const BASE = { occurred_at: '2026-10-24T13:00:00.000Z', device_id: 'device-1', list_id: LIST }

beforeEach(() => {
  http.sent = []
  localStorage.setItem('token', 'token-123')
})

afterEach(() => {
  localStorage.clear()
})

describe('focus.get (SYNC-08, SYNC-09, SYNC-11)', () => {
  it('without a list, asks GET /api/focus with no list_id at all', async () => {
    expect(await focus.get()).toEqual({ answered: true })

    expect(http.sent).toEqual([{ method: 'get', url: '/api/focus', body: undefined, authorization: 'Bearer token-123' }])
    expect(http.sent[0]!.url).not.toContain('list_id')
  })

  it('with a list, asks GET /api/focus?list_id=<list>', async () => {
    await focus.get(LIST)

    expect(http.sent).toEqual([{ method: 'get', url: `/api/focus?list_id=${LIST}`, body: undefined, authorization: 'Bearer token-123' }])
  })
})

describe('focus.send (SYNC-05)', () => {
  it('posts the action to its route with action_id, without the list it came from', async () => {
    const entry: QueuedAction = { action_id: 'action-1', action: { type: 'start', task_id: 'task-a', takeover: true, ...BASE } }

    await focus.send(entry)

    expect(http.sent).toEqual([
      {
        method: 'post',
        url: '/api/focus/start',
        body: { action_id: 'action-1', task_id: 'task-a', takeover: true, occurred_at: BASE.occurred_at, device_id: 'device-1' },
        authorization: 'Bearer token-123',
      },
    ])
  })

  it('names the list only for a break, and keeps the slash of break/end in the route', async () => {
    await focus.send({ action_id: 'action-2', action: { type: 'break', minutes: 10, ...BASE } })
    await focus.send({ action_id: 'action-3', action: { type: 'break/end', ...BASE } })

    expect(http.sent.map(({ url, body }) => ({ url, body }))).toEqual([
      { url: '/api/focus/break', body: { action_id: 'action-2', minutes: 10, occurred_at: BASE.occurred_at, device_id: 'device-1', list_id: LIST } },
      { url: '/api/focus/break/end', body: { action_id: 'action-3', occurred_at: BASE.occurred_at, device_id: 'device-1' } },
    ])
  })
})

describe('focus.heartbeat (SYNC-10)', () => {
  it('posts the device id to /api/focus/heartbeat', async () => {
    await focus.heartbeat('device-1')

    expect(http.sent).toEqual([
      { method: 'post', url: '/api/focus/heartbeat', body: { device_id: 'device-1' }, authorization: 'Bearer token-123' },
    ])
  })
})

describe('tasks.get and tasks.update (WIDGET-14, WIDGET-15)', () => {
  it('reads one task with GET /api/tasks/<id>', async () => {
    await tasks.get('task-1')

    expect(http.sent).toEqual([{ method: 'get', url: '/api/tasks/task-1', body: undefined, authorization: 'Bearer token-123' }])
  })

  it('saves the notes with PATCH /api/tasks/<id> and only the notes in the body', async () => {
    await tasks.update('task-1', { notes: 'Call the bank' })

    expect(http.sent).toEqual([
      { method: 'patch', url: '/api/tasks/task-1', body: { notes: 'Call the bank' }, authorization: 'Bearer token-123' },
    ])
  })
})

describe('the schedule calls (US-7, US-12, US-5)', () => {
  const sent = (method: string, url: string, body?: unknown) => ({ method, url, body, authorization: 'Bearer token-123' })

  it('creates a task with its day and time in the body of POST /api/tasks', async () => {
    await tasks.create({ list_id: LIST, title: 'Write', estimate_minutes: null, column: 'backlog', scheduled_on: '2026-11-13', scheduled_time: '14:00' })

    expect(http.sent).toEqual([
      sent('post', '/api/tasks', {
        list_id: LIST,
        title: 'Write',
        estimate_minutes: null,
        column: 'backlog',
        scheduled_on: '2026-11-13',
        scheduled_time: '14:00',
      }),
    ])
  })

  it('sends the day, the time, the rule and the scope in the body of PATCH /api/tasks/<id>', async () => {
    const rule = { freq: 'weekly' as const, interval: 2, weekdays: [1, 3], month_day: null, until: null, count: 5 }
    await tasks.update('task-1', { scheduled_on: '2026-11-13', scheduled_time: null, recurrence: rule, scope: 'series' })
    await tasks.update('task-1', { scheduled_on: null, recurrence: null })

    expect(http.sent).toEqual([
      sent('patch', '/api/tasks/task-1', { scheduled_on: '2026-11-13', scheduled_time: null, recurrence: rule, scope: 'series' }),
      sent('patch', '/api/tasks/task-1', { scheduled_on: null, recurrence: null }),
    ])
  })

  it('deletes with DELETE /api/tasks/<id>, with the scope in the query only when given', async () => {
    await tasks.remove('task-1')
    await tasks.remove('task-1', 'series')
    await tasks.remove('task-1', 'occurrence')

    expect(http.sent).toEqual([
      sent('delete', '/api/tasks/task-1'),
      sent('delete', '/api/tasks/task-1?scope=series'),
      sent('delete', '/api/tasks/task-1?scope=occurrence'),
    ])
  })

  it('skips an occurrence with POST /api/tasks/<id>/skip and no body', async () => {
    await tasks.skip('task-1')

    expect(http.sent).toEqual([sent('post', '/api/tasks/task-1/skip')])
  })

  it('reads the scheduled tasks of a period with GET /api/agenda/scheduled', async () => {
    await agenda.scheduled('2026-11-09', '2026-11-15')

    expect(http.sent).toEqual([sent('get', '/api/agenda/scheduled?from=2026-11-09&to=2026-11-15')])
  })
})

describe('reports.overview and reports.sessions (REPORT-01, REPORT-07, REPORT-20)', () => {
  it('asks GET /api/reports/overview with the period and no list_id for every list', async () => {
    await reports.overview({ from: '2026-10-19', to: '2026-10-25' })

    expect(http.sent).toEqual([
      { method: 'get', url: '/api/reports/overview?from=2026-10-19&to=2026-10-25', body: undefined, authorization: 'Bearer token-123' },
    ])
  })

  it('asks GET /api/reports/sessions with the period and the list_id of the filter', async () => {
    await reports.sessions({ from: '2026-10-19', to: '2026-10-25', list_id: LIST })

    expect(http.sent).toEqual([
      {
        method: 'get',
        url: `/api/reports/sessions?from=2026-10-19&to=2026-10-25&list_id=${LIST}`,
        body: undefined,
        authorization: 'Bearer token-123',
      },
    ])
  })
})
