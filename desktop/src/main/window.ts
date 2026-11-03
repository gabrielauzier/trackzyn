import path from 'node:path'
import { BrowserWindow, screen, shell } from 'electron'
import { APP_ORIGIN } from './app-protocol'
import type { createConfigStore } from './config-store'
import { hardenWebContents } from './security'
import { resolveWindowBounds, trackWindowState, windowOptions } from './window-state'
import { APP_VERSION_ARG } from '../shared/ipc'

export function createMainWindow(appVersion: string, store: ReturnType<typeof createConfigStore>): BrowserWindow {
  const bounds = resolveWindowBounds(store.getBounds(), screen.getAllDisplays())
  const win = new BrowserWindow({
    ...windowOptions({ platform: process.platform, bounds }),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      additionalArguments: [`${APP_VERSION_ARG}${appVersion}`],
    },
  })
  trackWindowState(win, store)
  hardenWebContents(win.webContents, { openExternal: (url) => shell.openExternal(url) })
  void win.loadURL(`${APP_ORIGIN}/`)
  return win
}
