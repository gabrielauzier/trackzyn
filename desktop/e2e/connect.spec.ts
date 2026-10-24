import { expect, test, type Page } from '@playwright/test'
import { closeAll, launchApp, readConfig } from './support/launch'
import { startTestServer, type TestServer } from './support/test-server'

const servers: TestServer[] = []

async function server(options?: Parameters<typeof startTestServer>[0]) {
  const started = await startTestServer(options)
  servers.push(started)
  return started
}

test.afterEach(async () => {
  await closeAll()
  while (servers.length) await servers.pop()!.close()
})

const connectHeading = (page: Page) => page.getByRole('heading', { name: 'Connect to a server' })

/** A fresh install opens on the mode choice (task 4); the connect screen is one click away. */
async function chooseServer(page: Page) {
  await page.getByRole('button', { name: 'Connect to a server' }).click()
}

async function connect(page: Page, url: string) {
  // Already on the connect screen when it was opened from the menu.
  const choice = page.getByRole('button', { name: 'Connect to a server' })
  await choice.or(page.getByLabel('Server URL')).first().waitFor()
  if (await choice.isVisible()) await choice.click()
  await page.getByLabel('Server URL').fill(url)
  await page.getByRole('button', { name: 'Connect' }).click()
}

test('first run shows the connect screen and makes no api calls', async () => {
  const { page } = await launchApp()
  await chooseServer(page)
  await expect(connectHeading(page)).toBeVisible()
  await page.waitForTimeout(500)
  const apiCalls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => new URL(name).pathname.startsWith('/api')),
  )
  expect(apiCalls).toEqual([])
})

test('connecting saves the url in config.json', async () => {
  const remote = await server()
  const { page, configPath } = await launchApp()
  await connect(page, `${remote.url}/`)
  await expect(page).toHaveURL('app://launchkit/login')
  expect(readConfig(configPath).serverUrl).toBe(remote.url)
  expect(remote.requests.map((request) => request.path)).toEqual(
    expect.arrayContaining(['/api/health', '/api/info', '/api/setup/status']),
  )
})

test('fresh server lands on /setup', async () => {
  const remote = await server({ hasUsers: false })
  const { page } = await launchApp()
  await connect(page, remote.url)
  await expect(page).toHaveURL('app://launchkit/setup')
})

test('server with users lands on /login', async () => {
  const remote = await server({ hasUsers: true })
  const { page } = await launchApp()
  await connect(page, remote.url)
  await expect(page).toHaveURL('app://launchkit/login')
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
})

test('unreachable server shows the error and saves nothing', async () => {
  const { page, configPath } = await launchApp()
  await connect(page, 'http://127.0.0.1:1')
  await expect(page.getByText('Could not reach the server')).toBeVisible()
  expect(readConfig(configPath).serverUrl).toBeUndefined()
  await expect(connectHeading(page)).toBeVisible()
})

test('reopening with a saved server skips the connect screen', async () => {
  const remote = await server()
  const first = await launchApp()
  await connect(first.page, remote.url)
  await expect(first.page).toHaveURL('app://launchkit/login')
  await first.app.close()

  const { page } = await launchApp({ userDataDir: first.userDataDir })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await expect(connectHeading(page)).toHaveCount(0)
})

test('switch server opens the connect screen', async () => {
  const remote = await server()
  const { app, page, configPath } = await launchApp({ serverUrl: remote.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()!.getMenuItemById('switch-server')!.click()
  })
  await expect(connectHeading(page)).toBeVisible()
  await expect(page).toHaveURL('app://launchkit/connect')
  // Opening the screen does not forget the current server.
  expect(readConfig(configPath).serverUrl).toBe(remote.url)
})

test('switching servers drops the session and never leaks the old token', async () => {
  const oldServer = await server()
  const newServer = await server()
  const { app, page, configPath } = await launchApp({ serverUrl: oldServer.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await page.evaluate((token) => {
    localStorage.setItem('token', token)
    localStorage.setItem('workspace_id', 'ws-1')
  }, oldServer.token)

  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()!.getMenuItemById('switch-server')!.click()
  })
  await expect(connectHeading(page)).toBeVisible()
  await connect(page, newServer.url)
  await expect(page).toHaveURL('app://launchkit/login')

  expect(await page.evaluate(() => [localStorage.getItem('token'), localStorage.getItem('workspace_id')])).toEqual([null, null])
  expect(readConfig(configPath).serverUrl).toBe(newServer.url)
  expect(newServer.requests.length).toBeGreaterThan(0)
  for (const request of newServer.requests) {
    expect(request.headers.authorization, request.path).toBeUndefined()
    expect(request.headers['x-workspace-id'], request.path).toBeUndefined()
  }
})
