import { spawn } from 'node:child_process'
import { expect, test } from '@playwright/test'
import { closeAll, electronBinary, launchApp, launchArgs } from './support/launch'
import { startTestServer, type TestServer } from './support/test-server'

let server: TestServer

test.beforeEach(async () => {
  server = await startTestServer()
})

test.afterEach(async () => {
  await closeAll()
  await server.close()
})

test('opens exactly one window at app://trackzyn/', async () => {
  const { app, page } = await launchApp({ serverUrl: server.url })
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  expect(page.url().startsWith('app://trackzyn/')).toBe(true)
})

test('reloading /files keeps the files page', async () => {
  const { page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await page.evaluate((token) => localStorage.setItem('token', token), server.token)
  await page.goto('app://trackzyn/files')
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible()

  await page.reload()
  expect(page.url()).toBe('app://trackzyn/files')
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible()
  const status = await page.evaluate(async () => (await fetch('/files')).status)
  expect(status).toBe(200)
})

test('second instance exits 0 and leaves one window', async () => {
  const { app, userDataDir } = await launchApp({ serverUrl: server.url })
  const second = spawn(electronBinary(), launchArgs(userDataDir), { stdio: 'ignore' })
  const code = await new Promise<number | null>((resolve, reject) => {
    const timer = setTimeout(() => {
      second.kill()
      reject(new Error('the second instance did not exit'))
    }, 20_000)
    second.on('exit', (exitCode) => {
      clearTimeout(timer)
      resolve(exitCode)
    })
  })
  expect(code).toBe(0)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

test('opens with an unreachable server and shows one window', async () => {
  // An address nothing listens on: the app has no network to reach its server.
  // This is not a proof for C27: the app runs unpackaged here, so the updater never starts.
  const { app, page } = await launchApp({ serverUrl: 'http://127.0.0.1:9' })
  expect(page.url().startsWith('app://trackzyn/')).toBe(true)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})
