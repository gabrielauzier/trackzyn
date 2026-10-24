import net, { type AddressInfo } from 'node:net'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { checksumDir } from '../src/main/test-support'
import { readZip, writeZip } from '../src/main/zip'
import { startTestServer, type TestServer } from './support/test-server'
import { closeAll, launchApp, newUserDataDir, readConfig } from './support/launch'
import { api, backendPids, backendPort, clickMenu, createLocalData, dialogState, isAlive, listData, releaseSave, signIn, startLocalMode, stubDialogs } from './support/local'

const servers: TestServer[] = []

test.afterEach(async () => {
  await closeAll()
  while (servers.length) await servers.pop()!.close()
})

const OFFLINE = ['--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE 127.0.0.1']

test('first launch shows the mode choice and makes no api calls', async () => {
  const { page } = await launchApp()
  await expect(page.getByRole('button', { name: 'Connect to a server' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Use this computer' })).toBeVisible()
  await page.waitForTimeout(500)
  const apiCalls = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => new URL(name).pathname.startsWith('/api')),
  )
  expect(apiCalls).toEqual([])
})

test('connect to a server leads to the connect screen', async () => {
  const remote = await startTestServer()
  servers.push(remote)
  const { page, configPath } = await launchApp()
  await page.getByRole('button', { name: 'Connect to a server' }).click()
  await expect(page.getByRole('heading', { name: 'Connect to a server' })).toBeVisible()
  await page.getByLabel('Server URL').fill(remote.url)
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page).toHaveURL('app://launchkit/login')
  expect(readConfig(configPath)).toMatchObject({ mode: 'remote', serverUrl: remote.url })
})

test('use this computer starts a utility process on a loopback port', async () => {
  const { app, page, userDataDir } = await launchApp()
  await startLocalMode(page)
  expect((await backendPids(app)).length).toBe(1)
  const port = backendPort(userDataDir)
  expect(port).toBeGreaterThan(1023)
  const direct = await fetch(`http://127.0.0.1:${port}/api/health`)
  expect(direct.status).toBe(401)
  expect(readConfig(path.join(userDataDir, 'config.json')).mode).toBe('local')
})

test('use this computer lands on /setup with has_users false', async () => {
  const { page } = await launchApp()
  await page.getByRole('button', { name: 'Use this computer' }).click()
  await expect(page.getByRole('progressbar')).toBeVisible()
  await expect(page).toHaveURL('app://launchkit/setup', { timeout: 45_000 })
  const status = await api(page, '/api/setup/status')
  expect(status).toEqual({ status: 200, body: { has_users: false } })
})

test('the page reaches the backend and a direct call without the token is 401', async () => {
  const { page, userDataDir } = await launchApp()
  await startLocalMode(page)
  expect((await api(page, '/api/health')).status).toBe(200)
  const port = backendPort(userDataDir)
  const bare = await fetch(`http://127.0.0.1:${port}/api/setup/status`)
  expect(bare.status).toBe(401)
  expect(await bare.json()).toEqual({ detail: 'Unauthorized' })
  const guessed = await fetch(`http://127.0.0.1:${port}/api/setup/status`, { headers: { 'X-Launchkit-Local-Token': 'guess' } })
  expect(guessed.status).toBe(401)
})

test('the local port refuses connections on the LAN address', async () => {
  const { page, userDataDir } = await launchApp()
  await startLocalMode(page)
  const lan = Object.values(os.networkInterfaces())
    .flat()
    .find((entry) => entry && entry.family === 'IPv4' && !entry.internal)
  expect(lan, 'this machine has no non-internal IPv4 address to test with').toBeTruthy()
  const port = backendPort(userDataDir)
  const outcome = await new Promise<string>((resolve) => {
    const socket = net.connect({ host: lan!.address, port, timeout: 5000 })
    socket.once('connect', () => {
      socket.destroy()
      resolve('connected')
    })
    socket.once('timeout', () => {
      socket.destroy()
      resolve('timeout')
    })
    socket.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? 'error'))
  })
  expect(outcome).toBe('ECONNREFUSED')
})

test('data survives a restart with the network blocked', async () => {
  const first = await launchApp({ args: OFFLINE })
  await startLocalMode(first.page)
  const data = await createLocalData(first.page)
  const token = await signIn(first.page, data.email)
  const before = await listData(first.page, token, data.workspaceId)
  expect(JSON.stringify(before.files)).toContain('plan.pdf')
  await first.app.close()

  expect(existsSync(path.join(first.userDataDir, 'db', 'PG_VERSION'))).toBe(true)
  expect(readdirSync(path.join(first.userDataDir, 'files')).length).toBeGreaterThan(0)

  const second = await launchApp({ userDataDir: first.userDataDir, args: OFFLINE })
  // The gate holds the app back until the local backend listens.
  await expect(second.page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 45_000 })
  const again = await signIn(second.page, data.email)
  const after = await listData(second.page, again, data.workspaceId)
  expect(after).toEqual(before)
})

test('local mode opens no redis connection', async () => {
  let connections = 0
  const decoy = net.createServer((socket) => {
    connections += 1
    socket.destroy()
  })
  await new Promise<void>((resolve) => decoy.listen(0, '127.0.0.1', resolve))
  try {
    const { page } = await launchApp({ env: { REDIS_URL: `redis://127.0.0.1:${(decoy.address() as AddressInfo).port}/0` } })
    await startLocalMode(page)
    await createLocalData(page)
    await page.waitForTimeout(500)
    expect(connections).toBe(0)
  } finally {
    await new Promise((resolve) => decoy.close(resolve))
  }
})

function corruptDatabase(userDataDir: string) {
  const db = path.join(userDataDir, 'db')
  mkdirSync(path.join(db, 'base'), { recursive: true })
  writeFileSync(path.join(db, 'PG_VERSION'), 'not a postgres cluster')
  writeFileSync(path.join(db, 'base', 'junk.bin'), Buffer.from('this is not a database page'.repeat(100)))
  return db
}

test('a corrupt database shows the failure screen and stays intact', async () => {
  const userDataDir = newUserDataDir({ mode: 'local' })
  const db = corruptDatabase(userDataDir)
  const before = checksumDir(db)
  const { page } = await launchApp({ userDataDir })
  await expect(page.getByText('Could not start the local backend')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open logs' })).toBeVisible()
  expect(checksumDir(db)).toBe(before)
})

test('open logs opens the logs folder and try again restarts the backend', async () => {
  const userDataDir = newUserDataDir({ mode: 'local' })
  const db = corruptDatabase(userDataDir)
  const { app, page } = await launchApp({ userDataDir })
  await expect(page.getByText('Could not start the local backend')).toBeVisible({ timeout: 60_000 })

  await app.evaluate(({ shell }) => {
    const opened: string[] = []
    ;(globalThis as { __paths?: string[] }).__paths = opened
    shell.openPath = async (target: string) => {
      opened.push(target)
      return ''
    }
  })
  await page.getByRole('button', { name: 'Open logs' }).click()
  await expect.poll(() => app.evaluate(() => (globalThis as { __paths?: string[] }).__paths)).toEqual([path.join(realpathSync(userDataDir), 'logs')])

  const log = readFileSync(path.join(userDataDir, 'logs', 'backend.log'), 'utf8')
  expect(log).toContain('did not start')
  expect(log.toLowerCase()).not.toContain('x-launchkit-local-token')

  // The database is repaired (here: removed); Try again starts the backend.
  rmSync(db, { recursive: true, force: true })
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page).toHaveURL('app://launchkit/setup', { timeout: 60_000 })
  const secret = readFileSync(path.join(userDataDir, 'secret.key'), 'utf8').trim()
  expect(readFileSync(path.join(userDataDir, 'logs', 'backend.log'), 'utf8')).not.toContain(secret)
})

test('quitting the app ends the backend process', async () => {
  const { app, page } = await launchApp()
  await startLocalMode(page)
  const [pid] = await backendPids(app)
  expect(pid).toBeGreaterThan(0)
  expect(isAlive(pid)).toBe(true)
  const started = Date.now()
  await app.close()
  while (isAlive(pid) && Date.now() - started < 8000) await new Promise((resolve) => setTimeout(resolve, 50))
  expect(isAlive(pid)).toBe(false)
  expect(Date.now() - started).toBeLessThan(5500)
})

test('switching server in local mode keeps the data', async () => {
  const { app, page, userDataDir } = await launchApp()
  await startLocalMode(page)
  const data = await createLocalData(page)
  const token = await signIn(page, data.email)
  const before = await listData(page, token, data.workspaceId)
  const filesBefore = checksumDir(path.join(userDataDir, 'files'))

  await app.evaluate(({ Menu }) => {
    Menu.getApplicationMenu()!.getMenuItemById('switch-server')!.click()
  })
  await expect(page).toHaveURL('app://launchkit/mode')
  await expect(page.getByRole('button', { name: 'Use this computer' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Connect to a server' })).toBeVisible()
  expect(existsSync(path.join(userDataDir, 'db', 'PG_VERSION'))).toBe(true)
  expect(checksumDir(path.join(userDataDir, 'files'))).toBe(filesBefore)
  expect(readConfig(path.join(userDataDir, 'config.json')).mode).toBeNull()

  // The data is still there: the setup screen sends a database with users to the login.
  await page.getByRole('button', { name: 'Use this computer' }).click()
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 60_000 })
  const again = await signIn(page, data.email)
  expect(await listData(page, again, data.workspaceId)).toEqual(before)
})

// ---- export and import (D22-D25) ----

function exportTarget(): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'launchkit-export-e2e-'))
  exportDirs.push(dir)
  return path.join(dir, 'export.zip')
}
const exportDirs: string[] = []
test.afterEach(() => {
  while (exportDirs.length) rmSync(exportDirs.pop()!, { recursive: true, force: true })
})

test('export writes a zip with manifest db.sql and files', async () => {
  const { app, page } = await launchApp()
  await startLocalMode(page)
  await createLocalData(page)
  const target = exportTarget()
  await stubDialogs(app, { save: target })

  await clickMenu(app, 'export-data')
  await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true)

  const entries = Object.fromEntries(readZip(readFileSync(target)).map((entry) => [entry.name, entry.data]))
  const manifest = JSON.parse(entries['manifest.json'].toString()) as Record<string, unknown>
  expect(manifest).toMatchObject({ formatVersion: 1, appVersion: expect.any(String), schemaRevision: expect.any(Number) })
  expect(entries['db.sql'].toString()).toContain('local@example.com')
  const uploaded = Object.keys(entries).filter((name) => name.startsWith('files/'))
  expect(uploaded).toHaveLength(1)
  expect(entries[uploaded[0]].toString()).toBe('%PDF-1.4 local file')
  const { saveCalls } = await dialogState(app)
  expect(saveCalls[0].defaultPath).toMatch(/^launchkit-export-\d{4}-\d{2}-\d{2}T[\d-]+Z?\.zip$/)
})

test('no write leaves the renderer while exporting', async () => {
  const { app, page } = await launchApp()
  await startLocalMode(page)
  const data = await createLocalData(page)
  const token = await signIn(page, data.email)
  await stubDialogs(app, { save: exportTarget(), holdSave: true })

  const writes: string[] = []
  page.on('request', (request) => {
    if (['POST', 'PATCH', 'DELETE', 'PUT'].includes(request.method())) writes.push(`${request.method()} ${request.url()}`)
  })
  await clickMenu(app, 'export-data')
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('progressbar')).toBeVisible()

  // Whatever the renderer sends while the export runs is refused by the main process.
  const attempt = await api(page, '/api/workspaces', { method: 'POST', token, json: { name: 'Blocked' } })
  expect(attempt.status).toBe(423)
  expect(writes.every((entry) => entry.includes('/api/workspaces'))).toBe(true)
  expect(writes).toHaveLength(1)

  await releaseSave(app)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const after = await api(page, '/api/workspaces', { method: 'POST', token, json: { name: 'Allowed' } })
  expect(after.status).toBe(201)
})

test('import into a new installation restores users workspaces files and login', async () => {
  const first = await launchApp()
  await startLocalMode(first.page)
  const data = await createLocalData(first.page)
  const token = await signIn(first.page, data.email)
  const original = await listData(first.page, token, data.workspaceId)
  const target = exportTarget()
  await stubDialogs(first.app, { save: target })
  await clickMenu(first.app, 'export-data')
  await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true)
  await expect.poll(async () => (await dialogState(first.app)).messages.length).toBeGreaterThan(0)
  await first.app.close()

  const second = await launchApp()
  await startLocalMode(second.page)
  await stubDialogs(second.app, { open: target, confirm: true })
  await clickMenu(second.app, 'import-data')
  await expect(second.page.getByRole('heading', { name: 'Login' })).toBeVisible({ timeout: 60_000 })
  expect((await dialogState(second.app)).messages).toContain('Import finished')

  const again = await signIn(second.page, data.email)
  expect(await listData(second.page, again, data.workspaceId)).toEqual(original)
  const setup = await api<{ has_users: boolean }>(second.page, '/api/setup/status')
  expect(setup.body.has_users).toBe(true)
})

test('an invalid export file shows the error and keeps the database', async () => {
  const { app, page, userDataDir } = await launchApp()
  await startLocalMode(page)
  await createLocalData(page)
  const dir = path.dirname(exportTarget())
  const bad = [
    ['plain.zip', Buffer.from('this is not a zip')],
    ['truncated.zip', Buffer.from('PK\u0003\u0004 half a zip')],
    // A COMMIT in the middle must not keep what came before it.
    [
      'commit.zip',
      writeZip([
        { name: 'manifest.json', data: Buffer.from(JSON.stringify({ formatVersion: 1, appVersion: '1', schemaRevision: 1 })) },
        {
          name: 'db.sql',
          data: Buffer.from(
            `INSERT INTO "users" ("id", "email", "hashed_password", "is_active", "is_superuser", "is_verified", "is_2fa_enabled") VALUES ('33333333-3333-3333-3333-333333333333', 'x@y.z', 'x', 'true', 'false', 'true', 'false');\nCOMMIT;\nDROP TABLE workspaces;\nINSERT INTO nowhere VALUES (1);\n`,
          ),
        },
        { name: 'files/new.txt', data: Buffer.from('should not stay') },
      ]),
    ],
  ] as const
  for (const [name, bytes] of bad) {
    const source = path.join(dir, name)
    writeFileSync(source, bytes)
    const before = { db: checksumDir(path.join(userDataDir, 'db')), files: checksumDir(path.join(userDataDir, 'files')) }
    await stubDialogs(app, { open: source, confirm: true })
    await clickMenu(app, 'import-data')
    await expect.poll(async () => (await dialogState(app)).messages).toContain('Invalid export file')
    expect({ db: checksumDir(path.join(userDataDir, 'db')), files: checksumDir(path.join(userDataDir, 'files')) }).toEqual(before)
  }
})

test('import is refused on an installation with data', async () => {
  const { app, page, userDataDir } = await launchApp()
  await startLocalMode(page)
  const data = await createLocalData(page)
  const target = exportTarget()
  await stubDialogs(app, { save: target })
  await clickMenu(app, 'export-data')
  await expect.poll(() => existsSync(target), { timeout: 30_000 }).toBe(true)
  await expect.poll(async () => (await dialogState(app)).messages.length).toBeGreaterThan(0)

  const before = { db: checksumDir(path.join(userDataDir, 'db')), files: checksumDir(path.join(userDataDir, 'files')) }
  await stubDialogs(app, { open: target, confirm: true })
  await clickMenu(app, 'import-data')
  await expect.poll(async () => (await dialogState(app)).messages).toContain('Import is only available on a new installation')
  expect({ db: checksumDir(path.join(userDataDir, 'db')), files: checksumDir(path.join(userDataDir, 'files')) }).toEqual(before)
  const token = await signIn(page, data.email)
  expect((await listData(page, token, data.workspaceId)).workspaces).toBeTruthy()
})

test('an unreadable import journal stops the local mode with a clear message and the logs action, and changes nothing', async () => {
  const userDataDir = newUserDataDir({ mode: 'local' })
  mkdirSync(path.join(userDataDir, 'files'), { recursive: true })
  writeFileSync(path.join(userDataDir, 'files', 'mine.txt'), 'mine')
  writeFileSync(path.join(userDataDir, 'import.journal.json'), '{ not json')
  const before = checksumDir(path.join(userDataDir, 'files'))
  const { page } = await launchApp({ userDataDir })
  await expect(page.getByText('Could not start the local backend')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('alert')).toContainText('import.journal.json')
  await expect(page.getByRole('button', { name: 'Open logs' })).toBeVisible()
  expect(checksumDir(path.join(userDataDir, 'files'))).toBe(before)
  expect(readFileSync(path.join(userDataDir, 'logs', 'backend.log'), 'utf8')).toContain('import.journal.json')
})
