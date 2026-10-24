import { expect, test } from '@playwright/test'
import { closeAll, launchApp, newUserDataDir } from './support/launch'
import { startTestServer, type TestServer } from './support/test-server'

let server: TestServer

test.beforeEach(async () => {
  server = await startTestServer({ workspaceCount: 2 })
})

test.afterEach(async () => {
  await closeAll()
  await server.close()
})

test('connects, signs in, switches workspace and uploads a file', async () => {
  // A fresh install: no server is configured yet.
  const { page } = await launchApp({ userDataDir: newUserDataDir() })
  await page.getByRole('button', { name: 'Connect to a server' }).click()
  await expect(page.getByRole('heading', { name: 'Connect to a server' })).toBeVisible()
  await page.getByLabel('Server URL').fill(server.url)
  await page.getByRole('button', { name: 'Connect' }).click()

  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible()
  await page.getByLabel('Email').fill('admin@example.com')
  await page.getByLabel('Password').fill('secret')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL('app://launchkit/')

  await page.getByRole('link', { name: 'Files' }).first().click()
  await expect(page.getByRole('heading', { name: 'Files' })).toBeVisible()

  await page.getByRole('button', { name: 'Main workspace' }).click()
  await page.getByRole('menuitem', { name: /Workspace 2/ }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('workspace_id'))).toBe('ws-2')

  const bytes = Buffer.from([37, 80, 68, 70, 45, 0, 255, 1, 2, 3])
  await page.locator('input[type="file"]').setInputFiles({ name: 'note.pdf', mimeType: 'application/pdf', buffer: bytes })

  await expect.poll(() => server.uploads.length).toBe(1)
  expect(server.uploads[0].filename).toBe('note.pdf')
  expect(server.uploads[0].workspaceId).toBe('ws-2')
  expect(server.uploads[0].body.includes(bytes)).toBe(true)
  await expect(page.getByText('note.pdf')).toBeVisible()
})
