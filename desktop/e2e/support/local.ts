import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, type ElectronApplication, type Page } from '@playwright/test'

export const PASSWORD = 'correct-horse-battery-1'

export async function chooseLocal(page: Page) {
  await page.getByRole('button', { name: 'Use this computer' }).click()
}

/** Chooses "Use this computer" and waits for the local backend and the setup screen. */
export async function startLocalMode(page: Page) {
  await chooseLocal(page)
  await expect(page).toHaveURL('app://launchkit/setup', { timeout: 45_000 })
}

export interface CallOptions {
  method?: string
  token?: string
  json?: unknown
  form?: Record<string, string>
  headers?: Record<string, string>
  upload?: { name: string; content: string }
}

/** A call to the app's own /api, from the renderer, the way the UI makes it. */
export async function api<T = unknown>(page: Page, apiPath: string, options: CallOptions = {}): Promise<{ status: number; body: T }> {
  return page.evaluate(
    async ({ apiPath: target, options: opts }) => {
      const headers: Record<string, string> = { ...opts.headers }
      if (opts.token) headers.Authorization = `Bearer ${opts.token}`
      let body: BodyInit | undefined
      if (opts.json !== undefined) {
        headers['Content-Type'] = 'application/json'
        body = JSON.stringify(opts.json)
      } else if (opts.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded'
        body = new URLSearchParams(opts.form).toString()
      } else if (opts.upload) {
        const form = new FormData()
        form.append('file', new Blob([opts.upload.content], { type: 'application/pdf' }), opts.upload.name)
        body = form
      }
      const response = await fetch(target, { method: opts.method ?? 'GET', headers, body })
      const text = await response.text()
      let parsed: unknown = text
      try {
        parsed = JSON.parse(text)
      } catch {
        // not JSON
      }
      return { status: response.status, body: parsed as never }
    },
    { apiPath, options },
  )
}

export interface LocalData {
  email: string
  workspaceId: string
  token: string
}

/** The first user (the setup flow), a workspace and one uploaded file. */
export async function createLocalData(page: Page, email = 'local@example.com'): Promise<LocalData> {
  const admin = await api<{ access_token: string }>(page, '/api/setup/create-admin', {
    method: 'POST',
    json: { email, password: PASSWORD, name: 'Local User', language: 'en' },
  })
  expect(admin.status).toBe(200)
  const token = admin.body.access_token
  const workspace = await api<{ id: string }>(page, '/api/workspaces', { method: 'POST', token, json: { name: 'Notes' } })
  expect(workspace.status).toBe(201)
  const upload = await api(page, '/api/files', {
    method: 'POST',
    token,
    headers: { 'X-Workspace-Id': workspace.body.id },
    upload: { name: 'plan.pdf', content: '%PDF-1.4 local file' },
  })
  expect(upload.status).toBe(201)
  return { email, workspaceId: workspace.body.id, token }
}

export async function signIn(page: Page, email: string): Promise<string> {
  const login = await api<{ access_token: string }>(page, '/api/auth/login', {
    method: 'POST',
    form: { username: email, password: PASSWORD },
  })
  expect(login.status).toBe(200)
  return login.body.access_token
}

/** What a user sees of the data: workspaces and files, as the API lists them. */
export async function listData(page: Page, token: string, workspaceId: string) {
  const workspaces = await api(page, '/api/workspaces', { token })
  const files = await api(page, '/api/files', { token, headers: { 'X-Workspace-Id': workspaceId } })
  expect(workspaces.status).toBe(200)
  expect(files.status).toBe(200)
  return { workspaces: workspaces.body, files: files.body }
}

/** The port the local backend announced in its log (Fastify logs "Server listening at ..."). */
export function backendPort(userDataDir: string): number {
  const log = readFileSync(path.join(userDataDir, 'logs', 'backend.log'), 'utf8')
  const ports = [...log.matchAll(/Server listening at http:\/\/127\.0\.0\.1:(\d+)/g)].map((match) => Number(match[1]))
  const port = ports.at(-1)
  if (!port) throw new Error(`no listening port in backend.log:\n${log}`)
  return port
}

export async function backendPids(app: ElectronApplication): Promise<number[]> {
  return app.evaluate(({ app: electronApp }) =>
    electronApp
      .getAppMetrics()
      .filter((metric) => metric.type === 'Utility' && `${metric.name ?? ''} ${metric.serviceName ?? ''}`.includes('launchkit-backend'))
      .map((metric) => metric.pid),
  )
}

export function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

/** Replaces the dialogs of the main process: records what they were asked and answers as told. */
export async function stubDialogs(
  app: ElectronApplication,
  options: { save?: string; open?: string; confirm?: boolean; holdSave?: boolean },
): Promise<void> {
  await app.evaluate(({ dialog }, opts) => {
    const state = { saveCalls: [] as unknown[], messages: [] as string[], release: () => {} }
    ;(globalThis as { __dialogs?: typeof state }).__dialogs = state
    const d = dialog as unknown as Record<string, unknown>
    d.showSaveDialog = async (...args: unknown[]) => {
      state.saveCalls.push(args[args.length - 1])
      if (opts.holdSave) await new Promise<void>((resolve) => (state.release = resolve))
      return opts.save ? { canceled: false, filePath: opts.save } : { canceled: true }
    }
    d.showOpenDialog = async () => (opts.open ? { canceled: false, filePaths: [opts.open] } : { canceled: true, filePaths: [] })
    d.showMessageBox = async (...args: unknown[]) => {
      const options_ = args[args.length - 1] as { message: string; buttons: string[] }
      state.messages.push(options_.message)
      return { response: options_.buttons.length > 1 && opts.confirm === false ? 1 : 0 }
    }
  }, options)
}

export async function dialogState(app: ElectronApplication): Promise<{ saveCalls: Array<{ defaultPath?: string }>; messages: string[] }> {
  return app.evaluate(() => {
    const state = (globalThis as { __dialogs?: { saveCalls: unknown[]; messages: string[] } }).__dialogs
    return { saveCalls: (state?.saveCalls ?? []) as never, messages: state?.messages ?? [] }
  })
}

export async function releaseSave(app: ElectronApplication): Promise<void> {
  await app.evaluate(() => (globalThis as { __dialogs?: { release: () => void } }).__dialogs?.release())
}

export async function clickMenu(app: ElectronApplication, id: string): Promise<void> {
  await app.evaluate(({ Menu }, itemId) => {
    Menu.getApplicationMenu()!.getMenuItemById(itemId)!.click()
  }, id)
}
