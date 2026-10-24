import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { closeAll, launchApp } from './support/launch'
import { clickMenu, createLocalData, dialogState, listData, signIn, startLocalMode, stubDialogs } from './support/local'

test.afterEach(async () => {
  await closeAll()
})

test('local mode end to end: choose, create, reopen, export, import into a new install', async () => {
  const exportDir = mkdtempSync(path.join(os.tmpdir(), 'launchkit-flow-'))
  try {
    // Choose the mode and create a user, a workspace and a file.
    const first = await launchApp()
    await expect(first.page.getByRole('button', { name: 'Use this computer' })).toBeVisible()
    await startLocalMode(first.page)
    const data = await createLocalData(first.page)
    const original = await listData(first.page, await signIn(first.page, data.email), data.workspaceId)

    // Reopen the same installation: the choice is remembered and the data is there.
    await first.app.close()
    const reopened = await launchApp({ userDataDir: first.userDataDir })
    await expect(reopened.page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 60_000 })
    const token = await signIn(reopened.page, data.email)
    expect(await listData(reopened.page, token, data.workspaceId)).toEqual(original)

    // Export, then import into a new installation.
    const target = path.join(exportDir, 'flow.zip')
    await stubDialogs(reopened.app, { save: target })
    await clickMenu(reopened.app, 'export-data')
    await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true)
    await expect.poll(async () => (await dialogState(reopened.app)).messages).toContain('Export saved')

    const fresh = await launchApp()
    await startLocalMode(fresh.page)
    await stubDialogs(fresh.app, { open: target, confirm: true })
    await clickMenu(fresh.app, 'import-data')
    await expect(fresh.page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 60_000 })
    const imported = await signIn(fresh.page, data.email)
    expect(await listData(fresh.page, imported, data.workspaceId)).toEqual(original)
  } finally {
    rmSync(exportDir, { recursive: true, force: true })
  }
})
