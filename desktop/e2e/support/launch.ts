import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'

export const DESKTOP_ROOT = path.resolve(__dirname, '../..')
export const MAIN_ENTRY = path.join(DESKTOP_ROOT, 'out/main/index.js')

/** Path of the Electron binary, for tests that start a process themselves. */
export function electronBinary(): string {
  return process.env.TRACKZYN_E2E_EXECUTABLE ?? (require('electron') as string) // eslint-disable-line @typescript-eslint/no-require-imports
}

/** With `TRACKZYN_E2E_EXECUTABLE` set, the tests drive a packaged app instead of `out/`. */
export function launchArgs(userDataDir: string): string[] {
  // English, whatever the machine's language is: the specs read the main process's messages too.
  const userData = `--user-data-dir=${userDataDir}`
  const lang = '--lang=en-US'
  // CI Linux runners cannot set up Chromium's SUID sandbox for an unpacked Electron.
  const flags = process.env.CI && process.platform === 'linux' ? ['--no-sandbox', lang, userData] : [lang, userData]
  return process.env.TRACKZYN_E2E_EXECUTABLE ? flags : [MAIN_ENTRY, ...flags]
}

/** Wide enough for the sidebar layout (the frontend switches at 1024px). */
const DESKTOP_VIEWPORT_WIDTH = 1280

export interface LaunchedApp {
  app: ElectronApplication
  page: Page
  userDataDir: string
  configPath: string
}

const launched: ElectronApplication[] = []
const tempDirs: string[] = []

export function newUserDataDir(config?: Record<string, unknown>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'trackzyn-e2e-'))
  tempDirs.push(dir)
  if (config) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config))
  }
  return dir
}

export async function launchApp(
  options: {
    userDataDir?: string
    serverUrl?: string
    config?: Record<string, unknown>
    args?: string[]
    env?: Record<string, string>
    keepWindowSize?: boolean
  } = {},
): Promise<LaunchedApp> {
  const userDataDir = options.userDataDir ?? newUserDataDir(options.config ?? (options.serverUrl ? { serverUrl: options.serverUrl } : undefined))
  const app = await electron.launch({
    executablePath: process.env.TRACKZYN_E2E_EXECUTABLE,
    args: [...launchArgs(userDataDir), ...(options.args ?? [])],
    cwd: DESKTOP_ROOT,
    env: { ...(process.env as Record<string, string>), ...options.env },
  })
  launched.push(app)
  const page = await app.firstWindow()
  // A runner whose screen is smaller than the window opens it narrower than the
  // frontend's `lg` breakpoint, and the sidebar then sits off-canvas.
  if (!options.keepWindowSize) {
    await app.evaluate(({ BrowserWindow }, minWidth) => {
      const win = BrowserWindow.getAllWindows()[0]
      const [width, height] = win.getContentSize()
      if (width < minWidth) win.setContentSize(minWidth, Math.max(height, 800))
    }, DESKTOP_VIEWPORT_WIDTH)
  }
  return { app, page, userDataDir, configPath: path.join(userDataDir, 'config.json') }
}

export function readConfig(configPath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function closeAll(): Promise<void> {
  while (launched.length) {
    const app = launched.pop()!
    await app.close().catch(() => {})
  }
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true })
}
