import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { closeAll, launchApp, newUserDataDir, readConfig } from './support/launch'
import { startTestServer, type TestServer } from './support/test-server'

let server: TestServer
const tempDirs: string[] = []

test.beforeEach(async () => {
  server = await startTestServer()
})

test.afterEach(async () => {
  await closeAll()
  await server.close()
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

async function signedIn(options: { userDataDir?: string } = {}) {
  const launched = await launchApp({ serverUrl: server.url, ...options })
  await expect(launched.page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await launched.page.evaluate((token) => localStorage.setItem('token', token), server.token)
  await launched.page.goto('app://trackzyn/files')
  await expect(launched.page.getByRole('heading', { name: 'Files' })).toBeVisible()
  return launched
}

test('Cmd or Ctrl+K opens the command palette', async () => {
  const { page } = await signedIn()
  const input = page.locator('[cmdk-input]')
  await expect(input).toHaveCount(0)

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K')

  await expect(input).toBeVisible()
})

test('window bounds survive a restart', async () => {
  const userDataDir = newUserDataDir({ serverUrl: server.url })
  const first = await launchApp({ userDataDir, keepWindowSize: true })
  // The OS clamps a window to the display, so pick a rectangle that fits this one.
  const area = await first.app.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  const wanted = {
    x: area.x + 20,
    y: area.y + 20,
    width: Math.min(1000, area.width - 40),
    height: Math.min(700, area.height - 40),
  }
  expect(wanted.width).toBeGreaterThanOrEqual(800)
  expect(wanted.height).toBeGreaterThanOrEqual(600)
  await first.app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), wanted)
  await first.app.close()
  expect(readConfig(first.configPath).bounds).toEqual(wanted)

  const second = await launchApp({ userDataDir, keepWindowSize: true })
  const restored = await second.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getBounds())
  expect(restored).toEqual(wanted)
})

test('download opens the save dialog and writes the same bytes', async () => {
  const { app, page } = await signedIn()
  const target = path.join(mkdtempSync(path.join(tmpdir(), 'trackzyn-save-')), 'saved.bin')
  tempDirs.push(path.dirname(target))
  await app.evaluate(({ dialog }, filePath) => {
    const calls: { defaultPath?: string }[] = []
    ;(globalThis as { __saveCalls?: typeof calls }).__saveCalls = calls
    ;(dialog as unknown as { showSaveDialog: unknown }).showSaveDialog = async (...args: unknown[]) => {
      calls.push(args[args.length - 1] as { defaultPath?: string })
      return { canceled: false, filePath }
    }
  }, target)
  const bytes = [0, 255, 1, 2, 3, 128, 10, 13, 200, 99]

  await page.evaluate((payload) => {
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([new Uint8Array(payload)], { type: 'application/octet-stream' }))
    link.download = 'hello.bin'
    document.body.appendChild(link)
    link.click()
  }, bytes)

  await expect.poll(() => existsSync(target)).toBe(true)
  expect([...readFileSync(target)]).toEqual(bytes)
  const calls = await app.evaluate(() => (globalThis as { __saveCalls?: { defaultPath?: string }[] }).__saveCalls)
  expect(calls).toHaveLength(1)
  expect(calls![0].defaultPath).toBe('hello.bin')
})
