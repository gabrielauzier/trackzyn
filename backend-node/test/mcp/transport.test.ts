import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { INITIALIZE, connect, listen, post } from '../support/mcp.ts'
import { ownerViewerStranger } from '../support/roles.ts'
import { type TestApp, bearer, createTestApp } from '../support/test-app.ts'
import { mintToken } from '../support/tokens.ts'

const FRONTEND = 'https://app.example.com'
const lines: string[] = []

let t: TestApp
let url: string
let owner: Awaited<ReturnType<typeof ownerViewerStranger>>['owner']
let workspaceId: string
let token: string

beforeAll(async () => {
  t = await createTestApp({ FRONTEND_URL: FRONTEND, APP_NAME: 'trackzyn-test' }, { server: { logger: { level: 'info', stream: { write: (line: string) => void lines.push(line) } } } })
  ;({ owner, workspaceId } = await ownerViewerStranger(t))
  token = (await mintToken(t, owner.token, workspaceId)).value
  url = await listen(t)
})
afterAll(async () => {
  await t.close()
})
afterEach(() => {
  vi.restoreAllMocks()
})

const withToken = (value = token) => ({ authorization: `Bearer ${value}` })

describe('initialize', () => {
  it('MCP-01 the SDK client completes it on a real port and sees the name, the version and the tools capability', async () => {
    const client = await connect(url, token)
    expect(client.getServerVersion()).toMatchObject({ name: 'trackzyn-test', version: '0.1.0' })
    expect(client.getServerCapabilities()?.tools).toEqual({})
    await client.close()
  })

  it('MCP-11 answers JSON without a session', async () => {
    const reply = await post(url, INITIALIZE, withToken())
    expect(reply.status).toBe(200)
    expect(reply.headers.get('content-type')).toContain('application/json')
    expect(reply.headers.get('mcp-session-id')).toBeNull()
    expect(((await reply.json()) as { result: { serverInfo: { name: string } } }).result.serverInfo.name).toBe('trackzyn-test')
  })

  it('MCP-11 a request needs nothing from an earlier one, not even initialize', async () => {
    const ping = { jsonrpc: '2.0', id: 7, method: 'ping' }
    for (const message of [ping, ping, INITIALIZE, INITIALIZE, ping]) {
      const reply = await post(url, message, withToken())
      expect(reply.status).toBe(200)
      expect(((await reply.json()) as { id: number }).id).toBe(message.id)
    }
  })
})

describe('without a valid token', () => {
  it('MCP-07 no token answers 401 with WWW-Authenticate: Bearer', async () => {
    const reply = await post(url, INITIALIZE)
    expect(reply.status).toBe(401)
    expect(reply.headers.get('www-authenticate')).toBe('Bearer')
    expect(await reply.json()).toEqual({ detail: 'Unauthorized' })
  })

  it('MCP-07 an unknown tkz_ token answers the same', async () => {
    const reply = await post(url, INITIALIZE, withToken(`tkz_${'x'.repeat(43)}`))
    expect(reply.status).toBe(401)
    expect(reply.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('MCP-08 the session JWT answers 401 with WWW-Authenticate: Bearer', async () => {
    const reply = await post(url, INITIALIZE, withToken(owner.token))
    expect(reply.status).toBe(401)
    expect(reply.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('MCP-07 a revoked token stops at the next request', async () => {
    const revoked = await mintToken(t, owner.token, workspaceId)
    expect((await post(url, INITIALIZE, withToken(revoked.value))).status).toBe(200)
    await t.app.inject({ method: 'DELETE', url: `/api/tokens/${revoked.id}`, headers: bearer(owner.token) })
    expect((await post(url, INITIALIZE, withToken(revoked.value))).status).toBe(401)
  })

  it('MCP-07 no token answers 401 before the body is read, even when it is not valid JSON', async () => {
    const reply = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' })
    expect(reply.status).toBe(401)
    expect(reply.headers.get('www-authenticate')).toBe('Bearer')
  })

  it('MCP-08 the session JWT answers 401 before the body is read', async () => {
    const reply = await fetch(url, { method: 'POST', headers: { ...withToken(owner.token), 'content-type': 'application/json' }, body: '{' })
    expect(reply.status).toBe(401)
    expect(reply.headers.get('www-authenticate')).toBe('Bearer')
  })
})

describe('Origin', () => {
  it('MCP-09 another origin answers 403 before the body is read', async () => {
    const reply = await fetch(url, { method: 'POST', headers: { ...withToken(), origin: 'https://evil.example.com', 'content-type': 'application/json' }, body: '{' })
    expect(reply.status).toBe(403)
  })

  it('MCP-09 another origin answers 403', async () => {
    const reply = await post(url, INITIALIZE, { ...withToken(), origin: 'https://evil.example.com' })
    expect(reply.status).toBe(403)
  })

  it('MCP-09 another origin answers 403 on GET and DELETE too', async () => {
    for (const method of ['GET', 'DELETE']) {
      const reply = await fetch(url, { method, headers: { ...withToken(), origin: 'https://evil.example.com' } })
      expect(reply.status, method).toBe(403)
    }
  })

  it('MCP-09 FRONTEND_URL passes, with the CORS headers a browser needs', async () => {
    const reply = await post(url, INITIALIZE, { ...withToken(), origin: FRONTEND })
    expect(reply.status).toBe(200)
    expect(reply.headers.get('access-control-allow-origin')).toBe(FRONTEND)
  })

  it('MCP-09 no Origin passes', async () => {
    expect((await post(url, INITIALIZE, withToken())).status).toBe(200)
  })
})

describe('other methods', () => {
  it.each(['GET', 'DELETE'])('MCP-10 %s answers 405 to a valid token', async (method) => {
    const reply = await fetch(url, { method, headers: withToken() })
    expect(reply.status).toBe(405)
    expect(reply.headers.get('allow')).toBe('POST')
  })

  it.each(['GET', 'DELETE'])('MCP-10 %s answers 405 without a token', async (method) => {
    expect((await fetch(url, { method })).status).toBe(405)
  })
})

describe('the rate limit', () => {
  it('RATE-01 REST and MCP count together', async () => {
    const limited = await mintToken(t, owner.token, workspaceId)
    for (let n = 0; n < 30; n += 1) {
      expect((await post(url, { jsonrpc: '2.0', id: n, method: 'ping' }, withToken(limited.value))).status).toBe(200)
      expect((await t.app.inject({ method: 'GET', url: '/api/lists', headers: bearer(limited.value) })).statusCode).toBe(200)
    }
    const reply = await post(url, INITIALIZE, withToken(limited.value))
    expect(reply.status).toBe(429)
    expect(reply.headers.get('retry-after')).toBe('60')
  })
})

describe('an unexpected failure', () => {
  it('answers JSON-RPC -32603 without the cause, which goes to the log', async () => {
    lines.length = 0
    vi.spyOn(Server.prototype, 'connect').mockRejectedValueOnce(new Error('the secret cause'))
    const reply = await post(url, INITIALIZE, withToken())
    expect(reply.status).toBe(500)
    const text = await reply.text()
    expect(JSON.parse(text)).toEqual({ jsonrpc: '2.0', id: 1, error: { code: -32603, message: 'Internal server error' } })
    expect(text).not.toContain('secret')
    expect(lines.join('')).toContain('the secret cause')
  })
})

describe('closing', () => {
  it('MCP-11 closes the Server at the end of each request', async () => {
    const close = vi.spyOn(Server.prototype, 'close')
    expect((await post(url, INITIALIZE, withToken())).status).toBe(200)
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1))
  })
})

describe('the OpenAPI document', () => {
  it('leaves /api/mcp out', async () => {
    const reply = await t.app.inject({ method: 'GET', url: '/api/openapi.json' })
    expect(Object.keys(reply.json().paths as object)).not.toContain('/api/mcp')
  })
})

describe('PERSONAL_TOKENS_ENABLED=false', () => {
  it('TOKEN-13 /api/mcp answers 404', async () => {
    const off = await createTestApp({ PERSONAL_TOKENS_ENABLED: 'false' })
    try {
      for (const method of ['POST', 'GET', 'DELETE'] as const) {
        const reply = await off.app.inject({ method, url: '/api/mcp', headers: { authorization: `Bearer tkz_${'x'.repeat(43)}` } })
        expect(reply.statusCode, method).toBe(404)
      }
    } finally {
      await off.close()
    }
  })
})
