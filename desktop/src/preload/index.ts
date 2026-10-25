import { contextBridge, ipcRenderer } from 'electron'
import { APP_VERSION_ARG, IPC, type TrackzynApi } from '../shared/ipc'

const versionArg = process.argv.find((arg) => arg.startsWith(APP_VERSION_ARG))

const api: TrackzynApi = {
  isDesktop: true,
  platform: process.platform,
  appVersion: versionArg ? versionArg.slice(APP_VERSION_ARG.length) : '',
  getServerUrl: () => ipcRenderer.invoke(IPC.getServerUrl),
  setServerUrl: (url, options) => ipcRenderer.invoke(IPC.setServerUrl, url, options),
  openExternal: (url) => ipcRenderer.invoke(IPC.openExternal, url),
  onUpdateAvailable: (callback) => {
    const listener = (_event: unknown, info: { version: string }) => callback(info)
    ipcRenderer.on(IPC.updateAvailable, listener)
    return () => {
      ipcRenderer.removeListener(IPC.updateAvailable, listener)
    }
  },
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
  startSso: () => ipcRenderer.invoke(IPC.startSso),
  getMode: () => ipcRenderer.invoke(IPC.getMode),
  startLocal: () => ipcRenderer.invoke(IPC.startLocal),
  openLogs: () => ipcRenderer.invoke(IPC.openLogs),
  onExportState: (callback) => {
    const listener = (_event: unknown, state: { exporting: boolean }) => callback(state)
    ipcRenderer.on(IPC.exportState, listener)
    return () => {
      ipcRenderer.removeListener(IPC.exportState, listener)
    }
  },
  reportFocusState: (state) => {
    void ipcRenderer.invoke(IPC.focusState, state).catch(() => undefined)
  },
  onPauseRequest: (callback) => {
    // The answer goes back even if the pause failed: the main process closes either way.
    const listener = () => {
      void callback()
        .catch(() => undefined)
        .then(() => ipcRenderer.invoke(IPC.focusPauseRequest))
        .catch(() => undefined)
    }
    ipcRenderer.on(IPC.focusPauseRequest, listener)
    return () => {
      ipcRenderer.removeListener(IPC.focusPauseRequest, listener)
    }
  },
}

contextBridge.exposeInMainWorld('trackzyn', api)
