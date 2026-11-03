import { expect, test } from '@playwright/test'
import { closeAll, launchApp } from './support/launch'
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

test('a 401 sends the app to /login and clears the token', async () => {
  const remote = await server()
  const { page } = await launchApp({ serverUrl: remote.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await page.evaluate(() => localStorage.setItem('token', 'expired-token'))
  await page.goto('app://trackzyn/files')

  await expect(page).toHaveURL('app://trackzyn/login')
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('token'))).toBeNull()
  expect(remote.requests.some((request) => request.path === '/api/users/me' && request.headers.authorization === 'Bearer expired-token')).toBe(true)
})

test('switching workspace sends X-Workspace-Id', async () => {
  const remote = await server({ workspaceCount: 2 })
  const { page } = await launchApp({ serverUrl: remote.url })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await page.evaluate((token) => localStorage.setItem('token', token), remote.token)
  await page.goto('app://trackzyn/files')
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible()

  await page.getByRole('button', { name: 'Main workspace' }).click()
  const marker = remote.requests.length
  await page.getByRole('menuitem', { name: /Workspace 2/ }).click()

  await expect
    .poll(() => remote.requests.slice(marker).filter((request) => request.path.startsWith('/api/')).map((request) => request.headers['x-workspace-id']))
    .toContain('ws-2')
  expect(await page.evaluate(() => localStorage.getItem('workspace_id'))).toBe('ws-2')
})

test('a server without CORS answers 200', async () => {
  const remote = await server({ rejectOrigin: true })
  const { page } = await launchApp({ serverUrl: remote.url })
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret')
  await page.getByRole('button', { name: 'Login' }).click()

  await expect(page).toHaveURL('app://trackzyn/')
  const me = await page.evaluate(async () => {
    const response = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    return response.status
  })
  expect(me).toBe(200)
  const apiRequests = remote.requests.filter((request) => request.path.startsWith('/api/auth/login') || request.path === '/api/users/me')
  expect(apiRequests.length).toBeGreaterThan(1)
  for (const request of apiRequests) {
    expect(request.headers.origin, request.path).toBeUndefined()
    expect(request.headers.referer, request.path).toBeUndefined()
  }
})

test('renderer never calls api.github.com', async () => {
  const remote = await server({ updateCheckRepo: 'acme/trackzyn' })
  const { page } = await launchApp({ serverUrl: remote.url })
  const external: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).hostname.endsWith('github.com')) external.push(request.url())
  })
  // The CSP (connect-src 'self') stops such a request before it leaves, but the
  // renderer logs the attempt, which still means the code tried to reach GitHub.
  page.on('console', (message) => {
    if (message.text().includes('api.github.com')) external.push(message.text())
  })
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await page.evaluate((token) => localStorage.setItem('token', token), remote.token)
  await page.goto('app://trackzyn/files')
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible()
  // The server names a repository to check, so the web app would query GitHub here.
  expect(remote.requests.some((request) => request.path === '/api/info')).toBe(true)
  await page.waitForTimeout(1500)

  expect(external).toEqual([])
})
