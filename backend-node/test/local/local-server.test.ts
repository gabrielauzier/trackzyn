import { mkdtempSync, rmSync } from 'node:fs'
import { type AddressInfo, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { type LocalServer, startLocalServer } from '../../src/local/local-server.ts'

const TOKEN = 'b'.repeat(64)
const open: LocalServer[] = []
const roots: string[] = []

function options(extra: Partial<Parameters<typeof startLocalServer>[0]> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'trackzyn-local-'))
  roots.push(root)
  return { dataDir: join(root, 'db'), filesDir: join(root, 'files'), secretKey: 'local-test-secret', sessionToken: TOKEN, logger: false as const, ...extra }
}

async function start(extra: Partial<Parameters<typeof startLocalServer>[0]> = {}) {
  const server = await startLocalServer(options(extra))
  open.push(server)
  return server
}

afterEach(async () => {
  vi.useRealTimers()
  delete process.env.REDIS_URL
  while (open.length) await open.pop()!.close()
  while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('the local server', () => {
  it('listens on 127.0.0.1 only', async () => {
    const server = await start()
    expect(server.address).toBe('127.0.0.1')
    expect(server.port).toBeGreaterThan(0)
  })

  it('never reads REDIS_URL and never connects to it', async () => {
    let connections = 0
    const decoy = createServer((socket) => {
      connections += 1
      socket.destroy()
    })
    await new Promise<void>((resolve) => decoy.listen(0, '127.0.0.1', resolve))
    process.env.REDIS_URL = `redis://127.0.0.1:${(decoy.address() as AddressInfo).port}/0`
    try {
      const server = await start()
      expect(server.ctx.config.redisUrl).toBeNull()
      await fetch(`http://127.0.0.1:${server.port}/api/setup/status`, { headers: { 'x-trackzyn-local-token': TOKEN } })
      await new Promise((resolve) => setTimeout(resolve, 300))
      expect(connections).toBe(0)
    } finally {
      await new Promise((resolve) => decoy.close(resolve))
    }
  })

  it('runs the scheduled jobs inside the process', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const lines: string[] = []
    const server = await start({ jobLogger: { info: (message) => lines.push(message) } })
    await vi.advanceTimersByTimeAsync(3600 * 1000)
    await (server.ctx.jobQueue as unknown as { drain(): Promise<void> }).drain()
    expect(lines).toContain('There are 0 users')
  })

  it('reports how many migrations it applied', async () => {
    const first = await start()
    expect(first.migrationsApplied).toBe(1)
  })

  it('never writes the session token or the secret key to its log, even at trace level', async () => {
    const lines: string[] = []
    const stream = { write: (line: string) => void lines.push(line) }
    const server = await start({ logger: { level: 'trace', stream } as never, secretKey: 'secret-that-must-not-leak-0123456789' })
    const url = `http://127.0.0.1:${server.port}`
    await fetch(`${url}/api/health`, { headers: { 'X-Trackzyn-Local-Token': TOKEN } })
    await fetch(`${url}/api/health`, { headers: { 'X-Trackzyn-Local-Token': 'wrong-token-value' } })
    await fetch(`${url}/api/setup/status`, { headers: { 'X-Trackzyn-Local-Token': TOKEN, Authorization: 'Bearer abc.def.ghi' } })
    const log = lines.join('')
    expect(log.length).toBeGreaterThan(0)
    expect(log).not.toContain(TOKEN.slice(0, 16))
    expect(log).not.toContain('wrong-token-value')
    expect(log).not.toContain('secret-that-must-not-leak-0123456789')
    expect(log.toLowerCase()).not.toContain('x-trackzyn-local-token')
    expect(log).not.toContain('abc.def.ghi')
  })
})
