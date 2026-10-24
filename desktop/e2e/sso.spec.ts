import { spawn } from 'node:child_process'
import { expect, test, type ElectronApplication, type Page } from '@playwright/test'
import { closeAll, electronBinary, launchApp, launchArgs } from './support/launch'
import { startTestServer, type TestServer } from './support/test-server'

let server: TestServer

test.beforeEach(async () => {
  server = await startTestServer({ oidcEnabled: true })
})

test.afterEach(async () => {
  await closeAll()
  await server.close()
})

const link = (token: string, nonce?: string) =>
  `trackzyn://auth/callback#access_token=${token}&token_type=bearer${nonce === undefined ? '' : `&desktop_nonce=${nonce}`}`

/** What macOS does when the system hands the app a trackzyn:// URL. */
async function openUrl(app: ElectronApplication, url: string) {
  await app.evaluate(({ app: electronApp }, target) => {
    electronApp.emit('open-url', { preventDefault() {} }, target)
  }, url)
}

/** Counts the loadURL calls whose URL contains `fragment`. */
async function countLoads(app: ElectronApplication, fragment: string) {
  await app.evaluate(({ BrowserWindow }, part) => {
    const contents = BrowserWindow.getAllWindows()[0].webContents
    const original = contents.loadURL.bind(contents)
    const state = globalThis as { __loads?: string[] }
    state.__loads = []
    contents.loadURL = ((url: string, options?: Electron.LoadURLOptions) => {
      if (url.includes(part)) state.__loads?.push(url)
      return original(url, options)
    }) as typeof contents.loadURL
  }, fragment)
  return () => app.evaluate(() => (globalThis as { __loads?: string[] }).__loads ?? [])
}

/** Clicks the SSO button with openExternal stubbed; returns the desktop_nonce the app put in the login URL. */
async function startSso(app: ElectronApplication, page: Page): Promise<string> {
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { __opened?: string[] }).__opened = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await page.getByRole('button', { name: 'Continue with Pocket ID' }).click()
  await expect.poll(() => app.evaluate(() => (globalThis as { __opened?: string[] }).__opened?.length)).toBe(1)
  const opened = await app.evaluate(() => (globalThis as { __opened?: string[] }).__opened as string[])
  return new URL(opened[0]).searchParams.get('desktop_nonce') as string
}

async function expectSignedIn(page: Page) {
  await expect(page).toHaveURL('app://trackzyn/')
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBe(server.token)
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    return response.status
  })
  expect(status).toBe(200)
}

test('SSO button opens the system browser and keeps one window', async () => {
  const { app, page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { __opened?: string[] }).__opened = opened
    shell.openExternal = async (url: string) => {
      opened.push(url)
    }
  })
  await page.getByRole('button', { name: 'Continue with Pocket ID' }).click()
  await expect.poll(() => app.evaluate(() => (globalThis as { __opened?: string[] }).__opened?.length)).toBe(1)
  const opened = await app.evaluate(() => (globalThis as { __opened?: string[] }).__opened as string[])
  expect(opened[0]).toMatch(
    new RegExp(`^${server.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/api/auth/oidc/login\\?redirect_target=trackzyn%3A%2F%2Fauth%2Fcallback&desktop_nonce=[A-Za-z0-9_-]{43}$`),
  )
  expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1)
  expect(page.url()).toBe('app://trackzyn/login')
})

test('an open-url deep link signs in and lands on / with users/me 200', async () => {
  const { app, page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  const nonce = await startSso(app, page)
  await openUrl(app, link(server.token, nonce))
  await expectSignedIn(page)
  expect(server.requests.some((request) => request.path === '/api/users/me' && request.headers.authorization === `Bearer ${server.token}`)).toBe(true)
})

test('a second instance carrying the link signs in', async () => {
  const { app, page, userDataDir } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  const nonce = await startSso(app, page)
  const second = spawn(electronBinary(), [...launchArgs(userDataDir), link(server.token, nonce)], { stdio: 'ignore' })
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
  await expectSignedIn(page)
})

test('the same deep link twice signs in once', async () => {
  const { app, page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  // Counts the writes to localStorage.token across the page loads of this tab.
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'token' && this === localStorage) {
        sessionStorage.setItem('token-writes', String(Number(sessionStorage.getItem('token-writes') ?? '0') + 1))
      }
      return original.call(this, key, value)
    }
  })
  const loads = await countLoads(app, '/auth/oidc/callback')
  const nonce = await startSso(app, page)
  await openUrl(app, link(server.token, nonce))
  await openUrl(app, link(server.token, nonce))
  await expectSignedIn(page)
  await page.waitForTimeout(500)
  expect(await loads()).toHaveLength(1)
  expect(await page.evaluate(() => sessionStorage.getItem('token-writes'))).toBe('1')
})

test('an incomplete deep link shows the message and stores no token', async () => {
  const { app, page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  // A flow the app did not start: a valid-looking token and nonce, nothing pending.
  await openUrl(app, link(server.token, 'p'.repeat(43)))
  await expect(page).toHaveURL('app://trackzyn/login?sso=failed')
  await expect(page.getByRole('alert')).toHaveText('Sign-in did not complete')
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()

  // A flow the app started, answered with another nonce or without one.
  await page.goto('app://trackzyn/login')
  const nonce = await startSso(app, page)
  await openUrl(app, link(server.token, `${nonce.slice(1)}x`))
  await expect(page).toHaveURL('app://trackzyn/login?sso=failed')
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()

  await openUrl(app, 'trackzyn://auth/callback#error=access_denied')
  await expect(page.getByRole('alert')).toHaveText('Sign-in did not complete')
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()

  // No server configured yet: the connect screen carries the message.
  await closeAll()
  const fresh = await launchApp()
  await expect(fresh.page.getByRole('button', { name: 'Use this computer' })).toBeVisible()
  await openUrl(fresh.app, 'trackzyn://auth/callback')
  await expect(fresh.page).toHaveURL('app://trackzyn/connect?sso=failed')
  await expect(fresh.page.getByRole('alert')).toHaveText('Sign-in did not complete')
  expect(await fresh.page.evaluate(() => localStorage.getItem('token'))).toBeNull()
})

test('a deep link with another path is ignored', async () => {
  const { app, page } = await launchApp({ serverUrl: server.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  const loads = await countLoads(app, '')
  for (const other of [
    `trackzyn://auth/other#access_token=${server.token}&token_type=bearer`,
    `trackzyn://evil/callback#access_token=${server.token}&token_type=bearer`,
    `trackzyn://auth/callback/extra#access_token=${server.token}&token_type=bearer`,
  ]) {
    await openUrl(app, other)
  }
  await page.waitForTimeout(500)
  expect(await loads()).toEqual([])
  expect(page.url()).toBe('app://trackzyn/login')
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
})
