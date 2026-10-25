import path from 'node:path'
import { BrowserWindow, shell } from 'electron'
import { APP_ORIGIN } from './app-protocol'
import type { Bounds } from './config-store'
import { hardenWebContents } from './security'
import { WIDGET_SIZE } from './widget-bounds'
import { APP_VERSION_ARG, WINDOW_ROLE_ARG } from '../shared/ipc'

/**
 * The focus widget (WIDGET-06): a frameless window above every other one, opened compact at the
 * position of `bounds`, with the main window's preload and hardening and the widget role.
 */
export function createWidgetWindow(bounds: Bounds, options: { appVersion: string; platform?: string }): BrowserWindow {
  const platform = options.platform ?? process.platform
  const win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    ...WIDGET_SIZE.compact,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    fullscreenable: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      additionalArguments: [`${APP_VERSION_ARG}${options.appVersion}`, `${WINDOW_ROLE_ARG}widget`],
    },
  })
  win.setAlwaysOnTop(true, 'floating')
  // Without this, macOS hides the widget behind an app in full screen.
  if (platform === 'darwin') win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  hardenWebContents(win.webContents, { openExternal: (url) => shell.openExternal(url) })
  void win.loadURL(`${APP_ORIGIN}/widget`)
  return win
}
