import { expect, test, type Page } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { closeAll, launchApp } from './support/launch'
import { totp } from './support/totp'

// Runs against a real trackzyn server (the Python backend in Docker, later the
// Node one): TRACKZYN_E2E_SERVER_URL=http://127.0.0.1:<port>.
// Each run registers two accounts and the Python server allows 3 registrations
// per hour per address, so against a disposable server flush its Redis between
// runs (`docker exec t03-redis redis-cli flushall`).
const SERVER_URL = process.env.TRACKZYN_E2E_SERVER_URL?.replace(/\/+$/, '')
const PASSWORD = 'Trackzyn-e2e-Passw0rd!'

test.skip(!SERVER_URL, 'set TRACKZYN_E2E_SERVER_URL to run against a real server')
test.afterEach(closeAll)

interface Account {
  email: string
  password: string
  totpSecret?: string
}

// Plain node fetch: no Origin header, like the app's own proxy.
async function call(path: string, init: RequestInit & { token?: string } = {}) {
  const { token, ...rest } = init
  const headers = new Headers(rest.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${SERVER_URL}/api${path}`, { ...rest, headers })
  if (response.status === 429) throw new Error(`${path} was rate limited by the server: flush its Redis (see the header of this file)`)
  if (!response.ok) throw new Error(`${rest.method ?? 'GET'} ${path} -> ${response.status} ${await response.text()}`)
  return response.json() as Promise<Record<string, unknown>>
}

const json = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

async function passwordLogin(email: string, password: string) {
  return call('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ username: email, password }),
  })
}

async function createAccount(withTotp: boolean): Promise<Account> {
  const email = `e2e-${randomUUID().slice(0, 8)}@example.com`
  const { has_users } = (await call('/setup/status')) as { has_users: boolean }
  if (!has_users) await call('/setup/create-admin', json({ email: `admin-${randomUUID().slice(0, 8)}@example.com`, password: PASSWORD, name: 'Admin', language: 'en' }))
  await call('/auth/register', json({ email, password: PASSWORD }))
  const { access_token: token } = (await passwordLogin(email, PASSWORD)) as { access_token: string }
  // Skip the first-run onboarding so a successful sign-in lands on the dashboard.
  await call('/users/me', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ preferences: { onboarding_completed: true } }), token })
  if (!withTotp) return { email, password: PASSWORD }
  const { secret } = (await call('/auth/2fa/setup', { method: 'POST', token })) as { secret: string }
  await call('/auth/2fa/enable', { ...json({ code: totp(secret) }), token })
  return { email, password: PASSWORD, totpSecret: secret }
}

async function connectAndFillCredentials(page: Page, account: Account) {
  await page.getByRole('button', { name: 'Connect to a server' }).click()
  await page.getByLabel('Server URL').fill(SERVER_URL!)
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page).toHaveURL('app://trackzyn/login')
  await page.getByLabel('Email').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Login' }).click()
}

async function expectSignedIn(page: Page) {
  await expect(page).toHaveURL('app://trackzyn/')
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/users/me', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
    return response.status
  })
  expect(status).toBe(200)
}

test('logs in with password', async () => {
  const account = await createAccount(false)
  const { page } = await launchApp()
  await connectAndFillCredentials(page, account)
  await expectSignedIn(page)
})

test('logs in with password and TOTP', async () => {
  const account = await createAccount(true)
  const { page } = await launchApp()
  await connectAndFillCredentials(page, account)
  const codeField = page.getByLabel('Two-factor code')
  await expect(codeField).toBeVisible()
  await codeField.fill(totp(account.totpSecret!))
  await page.getByRole('button', { name: 'Verify' }).click()
  await expectSignedIn(page)
})
