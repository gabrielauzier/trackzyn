import path from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { APP_ORIGIN } from './app-protocol'
import type { CaptureShortcutSetting } from './config-store'
import { hardenWebContents } from './security'
import { APP_VERSION_ARG, WINDOW_ROLE_ARG } from '../shared/ipc'

/** Room for the field, the reason it was refused and the hints of the capture page. */
export const CAPTURE_SIZE = { width: 560, height: 150 }

/**
 * The capture window (CAP-06): small, frameless, centered and above every other window, with the main
 * window's preload and hardening and the capture role. It loads `/capture`, the capture field alone.
 */
export function createCaptureWindow(options: { appVersion: string; platform?: string }): BrowserWindow {
  const platform = options.platform ?? process.platform
  const win = new BrowserWindow({
    ...CAPTURE_SIZE,
    center: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      additionalArguments: [`${APP_VERSION_ARG}${options.appVersion}`, `${WINDOW_ROLE_ARG}capture`],
    },
  })
  win.setAlwaysOnTop(true, 'floating')
  // Without this, macOS opens it on another space, behind an app in full screen.
  if (platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hardenWebContents(win.webContents, { openExternal: (url) => shell.openExternal(url) })
  void win.loadURL(`${APP_ORIGIN}/capture`)
  return win
}

export interface CaptureWindowLike {
  on(event: 'blur' | 'closed', listener: () => void): unknown
  focus(): void
  close(): void
}

interface Deps {
  createWindow(): CaptureWindowLike
  /** Brings the app forward, so the keys reach the field while another app was in front. */
  focusApp(): void
}

/**
 * One capture window at a time: the shortcut opens it, a second press only focuses it, and it closes
 * once the item is kept or when it loses the focus (CAP-06).
 */
export function createCaptureController({ createWindow, focusApp }: Deps) {
  let current: CaptureWindowLike | null = null

  function close() {
    const win = current
    if (!win) return
    current = null
    win.close()
  }

  return {
    open() {
      focusApp()
      if (current) {
        current.focus()
        return
      }
      const win = createWindow()
      current = win
      win.on('blur', () => {
        if (current === win) close()
      })
      win.on('closed', () => {
        if (current === win) current = null
      })
      win.focus()
    },
    close,
    isOpen: () => current !== null,
  }
}

/** The setting the renderer sends on `capture:set-shortcut`; anything else is refused. */
export function parseCaptureShortcut(value: unknown): CaptureShortcutSetting {
  const candidate = (value ?? {}) as Record<string, unknown>
  const { enabled, accelerator } = candidate
  if (typeof enabled !== 'boolean' || typeof accelerator !== 'string' || accelerator === '' || accelerator.length > 100) {
    throw new TypeError('A capture shortcut is { enabled: boolean, accelerator: string }')
  }
  return { enabled, accelerator }
}
