import { expect, test } from '@playwright/test'
import { closeAll, launchApp } from './support/launch'
import { startTestServer, type TestServer } from './support/test-server'

let server: TestServer

test.beforeEach(async () => {
  server = await startTestServer()
})

test.afterEach(async () => {
  await closeAll()
  await server.close()
})

const TRACKZYN_MEMBERS = [
  'appVersion',
  'getMode',
  'getServerUrl',
  'installUpdate',
  'isDesktop',
  'onExportState',
  'onPauseRequest',
  'onUpdateAvailable',
  'openExternal',
  'openLogs',
  'platform',
  'reportFocusState',
  'setServerUrl',
  'startLocal',
  'startSso',
]

test('window web preferences are locked down', async () => {
  const { app } = await launchApp({ serverUrl: server.url })
  const preferences = await app.evaluate(({ BrowserWindow }) => (BrowserWindow.getAllWindows()[0].webContents as unknown as { getLastWebPreferences(): Record<string, unknown> }).getLastWebPreferences())
  expect(preferences).toMatchObject({ contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true })
})

test('external link opens in the system browser', async () => {
  const { app, page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { __opened?: string[] }).__opened = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await page.evaluate(() => {
    const link = document.createElement('a')
    link.id = 'external-link'
    link.href = 'https://example.com/'
    link.target = '_blank'
    link.textContent = 'external'
    document.body.append(link)
  })
  await page.locator('#external-link').click()

  await expect.poll(() => app.evaluate(() => (globalThis as { __opened?: string[] }).__opened)).toEqual(['https://example.com/'])
  expect(page.url().startsWith('app://trackzyn/')).toBe(true)
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
})

test('renderer cannot navigate away', async () => {
  const { app, page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await app.evaluate(({ shell }) => {
    shell.openExternal = async () => {}
  })
  const before = page.url()
  await page.evaluate(() => {
    window.location.href = 'https://example.com/'
  })
  await page.waitForTimeout(500)
  expect(page.url()).toBe(before)
  await page.evaluate(() => {
    window.location.href = 'file:///etc/hosts'
  })
  await page.waitForTimeout(500)
  expect(page.url()).toBe(before)

  const popup = await page.evaluate(() => window.open('https://example.com/', '_blank'))
  expect(popup).toBeNull()
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  expect(page.url()).toBe(before)
})

// The title is what task 3's proof (C20a) calls; the bridge has grown since (SSO, local mode, export, focus),
// so the list above is the current one (15 members) and this test fixes that list.
test('window.trackzyn exposes exactly the eight members', async () => {
  const { page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  const members = await page.evaluate(() => Object.keys((window as unknown as { trackzyn: object }).trackzyn).sort())
  expect(members).toEqual(TRACKZYN_MEMBERS)
  expect(
    await page.evaluate(() => {
      const api = (window as unknown as { trackzyn: { isDesktop: boolean; getServerUrl: unknown } }).trackzyn
      return [api.isDesktop, typeof api.getServerUrl]
    }),
  ).toEqual([true, 'function'])
})

test('window.require and window.process do not exist', async () => {
  const { page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  const types = await page.evaluate(() => {
    const scope = window as unknown as Record<string, unknown>
    return [typeof scope.require, typeof scope.process, typeof scope.module, typeof scope.Buffer]
  })
  expect(types).toEqual(['undefined', 'undefined', 'undefined', 'undefined'])
})

test('app responses carry the content security policy', async () => {
  const { page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  const policies = await page.evaluate(async () => {
    const paths = ['/', '/login', '/favicon.svg']
    return Promise.all(paths.map(async (path) => (await fetch(path)).headers.get('content-security-policy')))
  })
  for (const policy of policies) {
    expect(policy).toContain("default-src 'self'")
    expect(policy).not.toContain('unsafe-eval')
  }
})
