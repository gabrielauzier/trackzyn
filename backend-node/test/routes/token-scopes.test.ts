import type { FastifyInstance } from 'fastify'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { TOKEN_SCOPES, type TokenScope } from '../../src/db/schema.ts'
import { invite, ownerViewerStranger } from '../support/roles.ts'
import { MCP_ROUTES, TOKEN_ROUTES, routeKey } from '../support/token-routes.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

type Method = 'GET' | 'HEAD' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS'

const registered: Array<{ method: Method; url: string; tokenScope: unknown }> = []

function collectRoutes(app: FastifyInstance): void {
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat()) registered.push({ method: method as Method, url: route.url, tokenScope: route.config?.tokenScope })
  })
}

let t: TestApp
let owner: Awaited<ReturnType<typeof ownerViewerStranger>>['owner']
let workspaceId: string
let strangerWorkspaceId: string
let stranger: Awaited<ReturnType<typeof ownerViewerStranger>>['stranger']
let listId: string
let otherListId: string

const session = async <T = Record<string, string>>(method: Method, url: string, payload?: object, token = owner.token, workspace = workspaceId) => {
  const reply = await t.app.inject({ method, url, headers: { ...bearer(token), 'x-workspace-id': workspace }, payload })
  expect(reply.statusCode, `${method} ${url}: ${reply.body}`).toBeLessThan(300)
  return reply.json() as T
}
const newList = async (name: string) => (await session('POST', '/api/lists', { name, color: 1 })).id!
const newTask = async () => (await session('POST', '/api/tasks', { list_id: listId, title: 'A task', column: 'backlog' })).id!
const newSubtask = async () => {
  const taskId = await newTask()
  return (await session('POST', `/api/tasks/${taskId}/subtasks`, { title: 'A subtask' })).id!
}

/** A valid call of each route of the table, on resources of its own, and the status of its success. */
const CALLS: Record<string, () => Promise<{ url: string; payload?: object; ok: number }>> = {
  'GET /api/lists': async () => ({ url: '/api/lists', ok: 200 }),
  'GET /api/lists/:list_id': async () => ({ url: `/api/lists/${listId}`, ok: 200 }),
  'GET /api/lists/:list_id/board': async () => ({ url: `/api/lists/${listId}/board`, ok: 200 }),
  'GET /api/tasks/:task_id': async () => ({ url: `/api/tasks/${await newTask()}`, ok: 200 }),
  'POST /api/tasks': async () => ({ url: '/api/tasks', payload: { list_id: listId, title: 'By token', column: 'today' }, ok: 201 }),
  'PATCH /api/tasks/:task_id': async () => ({ url: `/api/tasks/${await newTask()}`, payload: { title: 'Renamed' }, ok: 200 }),
  'POST /api/tasks/:task_id/move': async () => ({ url: `/api/tasks/${await newTask()}/move`, payload: { column: 'today', before_task_id: null }, ok: 200 }),
  'POST /api/tasks/:task_id/move-to-list': async () => ({ url: `/api/tasks/${await newTask()}/move-to-list`, payload: { list_id: otherListId }, ok: 200 }),
  'POST /api/tasks/:task_id/duplicate': async () => ({ url: `/api/tasks/${await newTask()}/duplicate`, ok: 201 }),
  'POST /api/tasks/:task_id/subtasks': async () => ({ url: `/api/tasks/${await newTask()}/subtasks`, payload: { title: 'Sub' }, ok: 201 }),
  'PATCH /api/subtasks/:subtask_id': async () => ({ url: `/api/subtasks/${await newSubtask()}`, payload: { done: true }, ok: 200 }),
  'POST /api/subtasks/:subtask_id/move': async () => ({ url: `/api/subtasks/${await newSubtask()}/move`, payload: { before_subtask_id: null }, ok: 200 }),
  'DELETE /api/tasks/:task_id': async () => ({ url: `/api/tasks/${await newTask()}`, ok: 204 }),
  'DELETE /api/subtasks/:subtask_id': async () => ({ url: `/api/subtasks/${await newSubtask()}`, ok: 204 }),
}

beforeAll(async () => {
  t = await createTestApp({}, { beforeRoutes: collectRoutes })
  ;({ owner, workspaceId, stranger, strangerWorkspaceId } = await ownerViewerStranger(t))
  listId = await newList('Main')
  otherListId = await newList('Other')
  // These tests send far more than 60 requests per token; the limit has its own test.
  vi.spyOn(t.ctx.keyValueStore, 'rateLimitHit').mockResolvedValue(0)
})
afterAll(async () => {
  await t.close()
})

const inTable = new Set([...TOKEN_ROUTES, ...MCP_ROUTES].map(routeKey))
const send = (method: Method, url: string, token: string, payload?: object) =>
  t.app.inject({ method, url, headers: bearer(token), payload })

describe('the routes open to tokens', () => {
  it('SCOPE-04 the routes that declare a scope are exactly the table of the spec', () => {
    const declared = registered
      .filter((route) => route.tokenScope !== undefined && route.method !== 'HEAD')
      .map((route) => ({ method: route.method as string, url: route.url, scope: route.tokenScope as TokenScope | 'any' }))
    const byKey = (a: { method: string; url: string }, b: { method: string; url: string }) => routeKey(a).localeCompare(routeKey(b))

    expect(declared.toSorted(byKey)).toEqual([...TOKEN_ROUTES, ...MCP_ROUTES].toSorted(byKey))
    expect(TOKEN_ROUTES).toHaveLength(14)
  })

  it('SCOPE-03 SCOPE-04 every registered route outside the table answers 403 to a token with every scope', async () => {
    // The walk leaves out `OPTIONS *`, the CORS preflight of @fastify/cors, an exception the spec records:
    // its onRequest hook answers every OPTIONS before the token hook, and that answer carries no data.
    expect(registered.filter((route) => route.method === 'OPTIONS').map((route) => route.url)).toEqual(['*'])
    const outside = registered.filter((route) => !inTable.has(routeKey(route)) && route.method !== 'OPTIONS')
    // The walk must really have seen the app: the admin routes and a generated HEAD among them.
    expect(outside.length).toBeGreaterThan(100)
    expect(outside.map(routeKey)).toEqual(expect.arrayContaining(['GET /api/admin/users', 'POST /api/tokens', 'HEAD /api/lists']))

    const token = await mintToken(t, owner.token, workspaceId)
    for (const route of outside) {
      const url = route.url.replace(/:[^/]+/g, '00000000-0000-4000-8000-000000000000')
      const reply = await send(route.method, url, token.value)
      expect(reply.statusCode, routeKey(route)).toBe(403)
      if (route.method !== 'HEAD') expect(reply.json().detail, routeKey(route)).toBe('Route not available for tokens')
    }
  })
})

describe.each(TOKEN_ROUTES)('$method $url', ({ method, url, scope }) => {
  const key = routeKey({ method, url })

  it('SCOPE-05 answers 403 Missing scope with every scope but its own', async () => {
    const token = await mintToken(t, owner.token, workspaceId, TOKEN_SCOPES.filter((other) => other !== scope))
    const call = await CALLS[key]!()
    const reply = await send(method as Method, call.url, token.value, call.payload)
    expect(reply.statusCode).toBe(403)
    expect(reply.json()).toEqual({ detail: `Missing scope: ${scope}` })
  })

  it('SCOPE-05 works with its scope alone', async () => {
    const token = await mintToken(t, owner.token, workspaceId, [scope])
    const call = await CALLS[key]!()
    const reply = await send(method as Method, call.url, token.value, call.payload)
    expect(reply.statusCode, reply.body).toBe(call.ok)
  })
})

describe('the role of the owner on the real routes', () => {
  it('SCOPE-07 a demoted owner keeps reading and gets Read-only role on every write route', async () => {
    const editor = await invite(t, owner.token, workspaceId, 'editor')
    const token = await mintToken(t, editor.token, workspaceId)
    await session('PATCH', `/api/workspaces/${workspaceId}/members/${editor.id}`, { role: 'viewer' })

    for (const route of TOKEN_ROUTES) {
      const call = await CALLS[routeKey(route)]!()
      const reply = await send(route.method as Method, call.url, token.value, call.payload)
      if (route.scope === 'lists:read' || route.scope === 'tasks:read') {
        expect(reply.statusCode, routeKey(route)).toBe(call.ok)
      } else {
        expect(reply.statusCode, routeKey(route)).toBe(403)
        expect(reply.json(), routeKey(route)).toEqual({ detail: 'Read-only role' })
      }
    }
  })
})

describe('other workspaces', () => {
  it('a token does not reach a list of another workspace', async () => {
    const theirs = (await session('POST', '/api/lists', { name: 'Theirs', color: 1 }, stranger.token, strangerWorkspaceId)).id!
    const token = await mintToken(t, owner.token, workspaceId)
    expect((await send('GET', `/api/lists/${theirs}`, token.value)).statusCode).toBe(404)
  })
})

describe('GET /api/lists preview', () => {
  const previewOf = async (token: string) => {
    const reply = await t.app.inject({ method: 'GET', url: '/api/lists', headers: { ...bearer(token), 'x-workspace-id': workspaceId } })
    expect(reply.statusCode).toBe(200)
    const { lists } = reply.json() as { lists: Array<{ id: string; preview: Array<{ title: string }> }> }
    return lists.find((list) => list.id === previewListId)!.preview.map((item) => item.title)
  }
  let previewListId: string

  beforeAll(async () => {
    previewListId = await newList('Preview')
    await session('POST', '/api/tasks', { list_id: previewListId, title: 'A secret title', column: 'today' })
  })

  it('SCOPE-09 is empty without tasks:read', async () => {
    const token = await mintToken(t, owner.token, workspaceId, ['lists:read'])
    expect(await previewOf(token.value)).toEqual([])
    expect((await send('GET', '/api/lists', token.value)).body).not.toContain('A secret title')
  })

  it('SCOPE-09 is filled with tasks:read', async () => {
    const token = await mintToken(t, owner.token, workspaceId, ['lists:read', 'tasks:read'])
    expect(await previewOf(token.value)).toEqual(['A secret title'])
  })

  it('SCOPE-10 stays filled for the session JWT', async () => {
    expect(await previewOf(owner.token)).toEqual(['A secret title'])
  })
})
