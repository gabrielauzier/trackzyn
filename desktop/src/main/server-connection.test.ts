import { describe, expect, it, vi } from 'vitest'
import { createServerConnection, type ServerStore } from './server-connection'

type Handler = (url: string) => Response | Promise<Response>

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function healthyServer(): Handler {
  return (url) => {
    if (url.endsWith('/api/health')) return json({ status: 'healthy' })
    if (url.endsWith('/api/info')) return json({ app_name: 'trackzyn', features: {}, update_check_repo: null })
    return json({ detail: 'Not Found' }, 404)
  }
}

function setup(handler: Handler) {
  const calls: string[] = []
  const fetchFn = vi.fn(async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    return handler(url)
  })
  let saved: string | null = null
  const store: ServerStore = {
    getServerUrl: () => saved,
    setServerUrl: (url) => {
      saved = url
    },
  }
  const connection = createServerConnection({ store, fetchFn })
  return { connection, calls, fetchFn, saved: () => saved }
}

describe('server connection', () => {
  it('calls health then info on the server', async () => {
    const { connection, calls } = setup(healthyServer())
    await connection.connect('https://srv.example.com')
    expect(calls).toEqual(['https://srv.example.com/api/health', 'https://srv.example.com/api/info'])
  })

  it('saves the normalized url after a healthy server', async () => {
    const { connection, saved } = setup(healthyServer())
    const result = await connection.connect('https://srv.example.com/')
    expect(result).toEqual({ ok: true, url: 'https://srv.example.com' })
    expect(saved()).toBe('https://srv.example.com')
  })

  it('rejects an unusable server and saves nothing', async () => {
    const cases: Record<string, Handler> = {
      'network failure': () => {
        throw new TypeError('fetch failed')
      },
      'health not 200': (url) => (url.endsWith('/api/health') ? json({ status: 'healthy' }, 503) : healthyServer()(url)),
      'health without healthy status': (url) =>
        url.endsWith('/api/health') ? json({ status: 'starting' }) : healthyServer()(url),
      'info not 200 or without app_name': (url) =>
        url.endsWith('/api/info') ? json({ features: {} }) : healthyServer()(url),
    }
    for (const [name, handler] of Object.entries(cases)) {
      const { connection, saved } = setup(handler)
      const result = await connection.connect('https://srv.example.com')
      expect(result, name).toEqual({ ok: false, reason: 'unreachable' })
      expect(saved(), name).toBeNull()
    }
    const { connection, saved } = setup((url) =>
      url.endsWith('/api/info') ? json({ app_name: 'x' }, 500) : healthyServer()(url),
    )
    expect(await connection.connect('https://srv.example.com')).toEqual({ ok: false, reason: 'unreachable' })
    expect(saved()).toBeNull()
  })

  it('refuses a url without protocol and saves nothing', async () => {
    const { connection, fetchFn, saved } = setup(healthyServer())
    expect(await connection.connect('srv.example.com')).toEqual({ ok: false, reason: 'invalid-url' })
    expect(fetchFn).not.toHaveBeenCalled()
    expect(saved()).toBeNull()
  })

  it('asks for confirmation on http to a remote host', async () => {
    const remote = setup(healthyServer())
    expect(await remote.connection.connect('http://remote.example')).toEqual({ ok: false, reason: 'insecure' })
    expect(remote.fetchFn).not.toHaveBeenCalled()
    expect(remote.saved()).toBeNull()

    expect(await remote.connection.connect('http://remote.example', { allowInsecure: true })).toEqual({
      ok: true,
      url: 'http://remote.example',
    })
    expect(remote.saved()).toBe('http://remote.example')

    for (const local of ['http://localhost:8000', 'http://127.0.0.1:8000', 'http://[::1]:8000']) {
      const ctx = setup(healthyServer())
      expect(await ctx.connection.connect(local), local).toMatchObject({ ok: true })
    }
  })
})
