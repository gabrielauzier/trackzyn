import { type ChildProcess, fork, spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const desktop = path.resolve(__dirname, '..')
const bundle = path.join(desktop, 'out/backend/server.cjs')
const sdkFile = path.resolve(desktop, '../backend-node/node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js')
/** A message only the SDK's transport has; the code that calls the SDK does not mention it. */
const SDK_CODE = 'Stateless transport cannot be reused'
const SDK_ENTRY = '@modelcontextprotocol/sdk/server/index.js'
const TOKEN = 'c'.repeat(64)

// Stands in for Electron's utilityProcess, the only place local.ts runs.
const HARNESS = `
const listeners = []
process.parentPort = { on: (_event, listener) => listeners.push(listener), postMessage: (message) => process.send(message) }
process.on('message', (data) => listeners.forEach((listener) => listener({ data })))
require(process.argv[2])
`

let work = ''
let child: ChildProcess | null = null

beforeAll(() => {
  work = mkdtempSync(path.join(tmpdir(), 'trackzyn-bundle-'))
  const built = spawnSync(process.execPath, ['scripts/build-backend.mjs'], { cwd: desktop, encoding: 'utf8' })
  expect(built.status, built.stderr).toBe(0)
}, 60_000)
afterAll(() => {
  child?.kill('SIGKILL')
  rmSync(work, { recursive: true, force: true })
})

describe('the local backend bundle', () => {
  it('TOKEN-13 does not contain the code of the MCP SDK', () => {
    expect(readFileSync(sdkFile, 'utf8')).toContain(SDK_CODE)
    const code = readFileSync(bundle, 'utf8')
    expect(code).not.toContain(SDK_CODE)
    // It stays an import, reached only by a route the local mode does not register.
    expect(code).toContain(SDK_ENTRY)
  })

  it('TOKEN-13 starts without the SDK installed and answers 404 on /api/mcp', async () => {
    expect(() => createRequire(bundle).resolve(SDK_ENTRY)).toThrow()

    const harness = path.join(work, 'harness.cjs')
    writeFileSync(harness, HARNESS)
    const started = fork(harness, [bundle], { silent: true })
    child = started
    let output = ''
    started.stderr?.on('data', (chunk) => (output += String(chunk)))
    const port = await new Promise<number>((resolve, reject) => {
      started.on('message', (message: { type: string; port: number; message: string }) => {
        if (message.type === 'ready') resolve(message.port)
        if (message.type === 'error') reject(new Error(message.message))
      })
      started.on('exit', (code) => reject(new Error(`exited with ${String(code)}: ${output}`)))
      started.send({
        type: 'start',
        dataDir: path.join(work, 'db'),
        filesDir: path.join(work, 'files'),
        secretKey: 'bundle-test-secret',
        sessionToken: TOKEN,
        migrationsFolder: path.resolve(desktop, '../backend-node/drizzle'),
      })
    })

    const headers = { 'x-trackzyn-local-token': TOKEN }
    const at = (route: string, method = 'GET') => fetch(`http://127.0.0.1:${port}${route}`, { method, headers })
    expect((await at('/api/setup/status')).status).toBe(200)
    for (const method of ['POST', 'GET', 'DELETE']) {
      expect((await at('/api/mcp', method)).status, method).toBe(404)
    }
  }, 60_000)
})
