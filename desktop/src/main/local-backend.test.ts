import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createLocalBackend, type ChildLike } from './local-backend'

let userData = ''
beforeEach(() => {
  userData = mkdtempSync(path.join(tmpdir(), 'trackzyn-local-backend-'))
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(userData, { recursive: true, force: true })
})

class FakeChild extends EventEmitter implements ChildLike {
  pid = 4242
  stdout = null
  stderr = null
  sent: Array<Record<string, unknown>> = []
  killed = false
  constructor(private readonly behaviour: { port?: number; fail?: string; exitOnShutdown?: boolean; hasImport?: Record<string, unknown> } = {}) {
    super()
  }
  postMessage(message: Record<string, unknown>) {
    this.sent.push(message)
    if (message.type === 'start') {
      queueMicrotask(() => {
        if (this.behaviour.fail) {
          this.emit('message', { type: 'error', message: this.behaviour.fail })
          this.emit('exit', 1)
        } else this.emit('message', { type: 'ready', port: this.behaviour.port ?? 4567, migrationsApplied: 0 })
      })
    }
    if (message.type === 'has-import') queueMicrotask(() => this.emit('message', { type: 'has-import-result', id: message.id, ...this.behaviour.hasImport }))
    if (message.type === 'shutdown' && this.behaviour.exitOnShutdown !== false) queueMicrotask(() => this.emit('exit', 0))
  }
  kill() {
    this.killed = true
    this.emit('exit', null)
    return true
  }
}

function backendWith(children: FakeChild[]) {
  const fork = vi.fn<(entry: string, options: { serviceName: string }) => ChildLike>(() => {
    const child = children.shift()
    if (!child) throw new Error('no more fake children')
    return child
  })
  const backend = createLocalBackend({ fork, entry: '/app/out/backend/server.cjs', userData, migrationsFolder: '/app/drizzle' })
  return { backend, fork }
}

describe('local backend', () => {
  it('forks the backend and resolves with its loopback port', async () => {
    const child = new FakeChild({ port: 4567 })
    const { backend, fork } = backendWith([child])
    const started = await backend.start()
    expect(started.port).toBe(4567)
    expect(started.url).toBe('http://127.0.0.1:4567')
    expect(fork).toHaveBeenCalledTimes(1)
    expect(fork.mock.calls[0][0]).toBe('/app/out/backend/server.cjs')
    const start = child.sent.find((message) => message.type === 'start')
    expect(start).toMatchObject({
      dataDir: path.join(userData, 'db'),
      filesDir: path.join(userData, 'files'),
      migrationsFolder: '/app/drizzle',
    })
    expect(start?.sessionToken).toBe(started.token)
    expect(String(start?.secretKey)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('generates a different session token on every start', async () => {
    const { backend } = backendWith([new FakeChild(), new FakeChild()])
    const first = await backend.start()
    await backend.stop()
    const second = await backend.start()
    expect(first.token).toMatch(/^[0-9a-f]{64}$/)
    expect(second.token).toMatch(/^[0-9a-f]{64}$/)
    expect(first.token).not.toBe(second.token)
  })

  it('keeps the signing secret between starts in secret.key', async () => {
    const children = [new FakeChild(), new FakeChild()]
    const { backend } = backendWith([...children])
    await backend.start()
    await backend.stop()
    await backend.start()
    const secrets = children.map((child) => child.sent.find((message) => message.type === 'start')?.secretKey)
    expect(secrets[0]).toBe(secrets[1])
    expect(readFileSync(path.join(userData, 'secret.key'), 'utf8').trim()).toBe(secrets[0])
  })

  it('rejects with the backend message and leaves nothing running when it fails to start', async () => {
    const { backend } = backendWith([new FakeChild({ fail: 'database is corrupt' })])
    await expect(backend.start()).rejects.toThrow('database is corrupt')
    expect(backend.info()).toBeNull()
    expect(existsSync(path.join(userData, 'db'))).toBe(false)
  })

  it('stops the backend within five seconds', async () => {
    vi.useFakeTimers()
    const polite = new FakeChild()
    const stuck = new FakeChild({ exitOnShutdown: false })
    const { backend } = backendWith([polite, stuck])

    await backend.start()
    await backend.stop()
    expect(polite.sent.some((message) => message.type === 'shutdown')).toBe(true)
    expect(polite.killed).toBe(false)

    await backend.start()
    const stopping = backend.stop()
    await vi.advanceTimersByTimeAsync(4_999)
    expect(stuck.killed).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    await stopping
    expect(stuck.killed).toBe(true)
    expect(backend.info()).toBeNull()
  })

  it('answers whether an import committed, and throws when the backend could not answer', async () => {
    for (const [reply, expected] of [[{ ok: true, committed: true }, true], [{ ok: true, committed: false }, false]] as const) {
      const { backend } = backendWith([new FakeChild({ hasImport: reply })])
      await backend.start()
      expect(await backend.hasImport('abc')).toBe(expected)
    }
    const { backend } = backendWith([new FakeChild({ hasImport: { ok: false, reason: 'invalid', message: 'database closed' } })])
    await backend.start()
    await expect(backend.hasImport('abc')).rejects.toThrow('database closed')
  })
})
