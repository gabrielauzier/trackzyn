import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createAppHandler } from './app-protocol'

const INDEX = '<!doctype html><title>trackzyn</title><div id="root"></div>'
let distDir = ''

beforeAll(() => {
  distDir = mkdtempSync(path.join(tmpdir(), 'trackzyn-dist-'))
  mkdirSync(path.join(distDir, 'static'))
  writeFileSync(path.join(distDir, 'index.html'), INDEX)
  writeFileSync(path.join(distDir, 'static', 'app.js'), 'console.log(1)')
  writeFileSync(path.join(distDir, 'favicon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>')
  writeFileSync(path.join(distDir, '..', 'trackzyn-secret.txt'), 'secret')
})

afterAll(() => {
  rmSync(distDir, { recursive: true, force: true })
  rmSync(path.join(distDir, '..', 'trackzyn-secret.txt'), { force: true })
})

function handler(overrides: { serverUrl?: string | null; fetchFn?: typeof fetch } = {}) {
  const fetchFn = overrides.fetchFn ?? (vi.fn(async () => new Response('{}')) as unknown as typeof fetch)
  return {
    fetchFn,
    handle: createAppHandler({
      distDir,
      getServerUrl: () => (overrides.serverUrl === undefined ? 'https://srv.example.com' : overrides.serverUrl),
      fetchFn,
    }),
  }
}

describe('app protocol static files', () => {
  it('serves index.html with 200 for unknown routes', async () => {
    const { handle } = handler()
    for (const route of ['/', '/files', '/workspace/settings', '/login']) {
      const response = await handle(new Request(`app://trackzyn${route}`))
      expect(response.status, route).toBe(200)
      expect(response.headers.get('content-type'), route).toContain('text/html')
      expect(await response.text(), route).toBe(INDEX)
    }
  })

  it('serves an existing asset with its content type', async () => {
    const { handle } = handler()
    const js = await handle(new Request('app://trackzyn/static/app.js'))
    expect(js.status).toBe(200)
    expect(js.headers.get('content-type')).toContain('text/javascript')
    expect(await js.text()).toBe('console.log(1)')
    const svg = await handle(new Request('app://trackzyn/favicon.svg'))
    expect(svg.headers.get('content-type')).toContain('image/svg+xml')
  })

  it('returns 404 for a missing asset instead of index.html', async () => {
    const { handle } = handler()
    const response = await handle(new Request('app://trackzyn/static/missing.js'))
    expect(response.status).toBe(404)
  })

  it('refuses path traversal out of the dist directory', async () => {
    const { handle } = handler()
    for (const route of ['/%2e%2e/trackzyn-secret.txt', '/..%2ftrackzyn-secret.txt', '/static/%2e%2e/%2e%2e/trackzyn-secret.txt']) {
      const response = await handle(new Request(`app://trackzyn${route}`))
      expect(response.status, route).toBe(404)
      expect(await response.text(), route).not.toContain('secret')
    }
  })

  it('answers 500 instead of failing the request when the build is missing', async () => {
    const handle = createAppHandler({ distDir: path.join(distDir, 'missing'), getServerUrl: () => null, fetchFn: fetch })
    expect((await handle(new Request('app://trackzyn/'))).status).toBe(500)
  })

  it('answers 404 for a host other than trackzyn', async () => {
    const { handle } = handler()
    expect((await handle(new Request('app://evil/index.html'))).status).toBe(404)
  })
})

describe('app protocol api proxy', () => {
  it('drops origin and referer when proxying', async () => {
    const fetchFn = vi.fn(async () => new Response('{"ok":true}', { status: 200 }))
    const { handle } = handler({ fetchFn: fetchFn as unknown as typeof fetch })
    const response = await handle(
      new Request('app://trackzyn/api/users/me?x=1', {
        headers: {
          origin: 'app://trackzyn',
          referer: 'app://trackzyn/files',
          host: 'trackzyn',
          authorization: 'Bearer t',
          'x-workspace-id': 'w1',
        },
      }),
    )
    expect(response.status).toBe(200)
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [target, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit]
    expect(target).toBe('https://srv.example.com/api/users/me?x=1')
    const sent = new Headers(init.headers)
    expect(sent.has('origin')).toBe(false)
    expect(sent.has('referer')).toBe(false)
    expect(sent.has('host')).toBe(false)
    expect(sent.get('authorization')).toBe('Bearer t')
    expect(sent.get('x-workspace-id')).toBe('w1')
    expect(init.method).toBe('GET')
  })

  it('forwards the method and body of writes', async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 204 }))
    const { handle } = handler({ fetchFn: fetchFn as unknown as typeof fetch })
    const response = await handle(
      new Request('app://trackzyn/api/workspaces', { method: 'POST', body: '{"name":"a"}', headers: { 'content-type': 'application/json' } }),
    )
    expect(response.status).toBe(204)
    const [, init] = fetchFn.mock.calls[0] as unknown as [string, RequestInit & { duplex?: string }]
    expect(init.method).toBe('POST')
    expect(init.duplex).toBe('half')
    expect(await new Response(init.body as BodyInit).text()).toBe('{"name":"a"}')
  })

  it('answers 503 without leaving the machine when no server is configured', async () => {
    const { handle, fetchFn } = handler({ serverUrl: null })
    const response = await handle(new Request('app://trackzyn/api/health'))
    expect(response.status).toBe(503)
    expect(fetchFn).not.toHaveBeenCalled()
  })
})

describe('app protocol content security policy', () => {
  it('sends a strict content security policy', async () => {
    const { handle } = handler()
    const responses = [
      await handle(new Request('app://trackzyn/')),
      await handle(new Request('app://trackzyn/static/app.js')),
      await handle(new Request('app://trackzyn/missing.js')),
    ]
    for (const response of responses) {
      const csp = response.headers.get('content-security-policy') ?? ''
      expect(csp).toContain("default-src 'self'")
      expect(csp).not.toContain('unsafe-eval')
      expect(csp).not.toContain('https:')
      expect(csp).toContain("connect-src 'self'")
    }
  })
})

describe('app protocol extra headers', () => {
  it('adds the extra headers to proxied requests and overrides the renderer', async () => {
    const fetchFn = vi.fn(async () => new Response('{}')) as unknown as typeof fetch
    const handle = createAppHandler({
      distDir,
      getServerUrl: () => 'http://127.0.0.1:4567',
      getExtraHeaders: () => ({ 'x-trackzyn-local-token': 'real-token' }),
      fetchFn,
    })
    await handle(new Request('app://trackzyn/api/health', { headers: { 'x-trackzyn-local-token': 'spoofed' } }))
    const init = vi.mocked(fetchFn).mock.calls[0][1] as RequestInit
    expect(new Headers(init.headers).get('x-trackzyn-local-token')).toBe('real-token')
  })
})
