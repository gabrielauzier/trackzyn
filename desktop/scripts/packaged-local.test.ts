import { type ChildProcess, spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { packagedLayout } from './packaged-app'

const release = path.resolve(__dirname, '..', 'release')

const app = packagedLayout(release)

/** Without a packaged app a local run skips (run `npm run package:dir`); CI must have built one. */
function requireApp(context: { skip: () => never }): { executable: string; resources: string } {
  if (!app) {
    if (process.env.CI) expect.fail('no packaged app in release/: run `npm run package:dir` before the tests')
    context.skip()
  }
  return app!
}

const children: ChildProcess[] = []
const dirs: string[] = []
afterEach(async () => {
  for (const child of children.splice(0)) {
    child.kill('SIGKILL')
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('packaged local backend', () => {
  it('packaged app contains the bundled backend', (context) => {
    const { resources } = requireApp(context)
    for (const file of [
      'backend/server.cjs',
      'backend/drizzle/meta/_journal.json',
      'backend/node_modules/@electric-sql/pglite/package.json',
      'backend/node_modules/@node-rs/argon2/package.json',
    ]) {
      expect(existsSync(path.join(resources, file)), file).toBe(true)
    }
    // The PGlite wasm and data files the database boots from.
    const dist = readdirSync(path.join(resources, 'backend/node_modules/@electric-sql/pglite/dist'))
    expect(dist.some((name) => name.endsWith('.wasm'))).toBe(true)
    expect(dist.some((name) => name.endsWith('.data'))).toBe(true)
  })

  it('packaged app starts the local backend without node on PATH', async (context) => {
    const { executable } = requireApp(context)
    const userData = mkdtempSync(path.join(tmpdir(), 'trackzyn-packaged-'))
    dirs.push(userData)
    writeFileSync(path.join(userData, 'config.json'), JSON.stringify({ mode: 'local' }))
    const debugPort = 9300 + Math.floor(Math.random() * 500)
    // --use-mock-keychain: the cookie-encryption fuse makes a freshly signed app ask the user's Keychain for
    // its key, a prompt nobody answers in a test (and one a test must not trigger).
    // A PATH with the system tools only: if the app needed `node` it would not find one.
    const systemPath = process.platform === 'win32' ? (process.env.SystemRoot ? path.join(process.env.SystemRoot, 'System32') : '') : '/usr/bin:/bin'
    const child = spawn(
      executable,
      [`--user-data-dir=${userData}`, `--remote-debugging-port=${debugPort}`, '--use-mock-keychain', ...(process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : [])],
      { env: { ...process.env, PATH: systemPath }, stdio: 'ignore' },
    )
    children.push(child)

    // The renderer's own origin answers /api/setup/status only once the backend listens.
    const deadline = Date.now() + 90_000
    let url = ''
    let status = ''
    while (Date.now() < deadline && !(status && url === 'app://trackzyn/setup')) {
      await new Promise((resolve) => setTimeout(resolve, 500))
      try {
        const targets = (await (await fetch(`http://127.0.0.1:${debugPort}/json`)).json()) as Array<{ type: string; webSocketDebuggerUrl: string; url: string }>
        const page = targets.find((target) => target.type === 'page')
        if (!page) continue
        url = page.url
        status = await evaluate(page.webSocketDebuggerUrl, "fetch('/api/setup/status').then((r) => r.text())")
      } catch {
        // not up yet
      }
    }
    expect(url).toBe('app://trackzyn/setup')
    expect(JSON.parse(status)).toEqual({ has_users: false })
  }, 120_000)
})

/** One Runtime.evaluate over the DevTools protocol (Node's own WebSocket client). */
function evaluate(webSocketUrl: string, expression: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(webSocketUrl)
    const timer = setTimeout(() => {
      socket.close()
      reject(new Error('devtools evaluate timed out'))
    }, 5000)
    socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }))
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number; result?: { result?: { value?: string }; exceptionDetails?: unknown } }
      if (message.id !== 1) return
      clearTimeout(timer)
      socket.close()
      const value = message.result?.result?.value
      if (typeof value === 'string' && !message.result?.exceptionDetails) resolve(value)
      else reject(new Error('evaluate failed'))
    }
    socket.onerror = () => {
      clearTimeout(timer)
      reject(new Error('devtools connection failed'))
    }
  })
}
