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

const { focus, tasks } = await import('@/lib/api')

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
