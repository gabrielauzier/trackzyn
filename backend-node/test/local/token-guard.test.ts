import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type LocalServer, startLocalServer } from '../../src/local/local-server.ts'

const TOKEN = 'a'.repeat(64)
let server: LocalServer
let base: string
let root = ''

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'trackzyn-local-'))
  server = await startLocalServer({
    dataDir: join(root, 'db'),
    filesDir: join(root, 'files'),
    secretKey: 'local-test-secret',
    sessionToken: TOKEN,
    logger: false,
  })
  base = `http://127.0.0.1:${server.port}`
})
afterAll(async () => {
  await server.close()
  rmSync(root, { recursive: true, force: true })
})

const ROUTES: Array<[string, string]> = [
  ['GET', '/api/health'],
  ['GET', '/api/setup/status'],
  ['GET', '/api/users/me'],
  ['GET', '/api/files'],
  ['GET', '/api/does-not-exist'],
  ['OPTIONS', '/api/health'],
]

describe('the local session token', () => {
  it('answers 401 without the right token on every route', async () => {
    for (const [method, path] of ROUTES) {
      for (const headers of <Array<Record<string, string>>>[{}, { 'x-trackzyn-local-token': 'wrong' }, { 'x-trackzyn-local-token': '' }, { 'x-trackzyn-local-token': TOKEN.slice(1) }]) {
        const response = await fetch(`${base}${path}`, { method, headers })
        expect(response.status, `${method} ${path} ${JSON.stringify(headers)}`).toBe(401)
        expect(await response.json()).toEqual({ detail: 'Unauthorized' })
      }
    }
  })

  it('lets a request with the right token through', async () => {
    const headers = { 'x-trackzyn-local-token': TOKEN }
    const health = await fetch(`${base}/api/health`, { headers })
    expect(health.status).toBe(200)
    const status = await fetch(`${base}/api/setup/status`, { headers })
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({ has_users: false })
    expect((await fetch(`${base}/api/does-not-exist`, { headers })).status).toBe(404)
  })
})
