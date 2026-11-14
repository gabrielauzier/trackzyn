import { contextBridge, ipcRenderer } from 'electron'
import { APP_VERSION_ARG, IPC, WINDOW_ROLE_ARG, type TrackzynApi } from '../shared/ipc'

const versionArg = process.argv.find((arg) => arg.startsWith(APP_VERSION_ARG))
const isWidget = process.argv.includes(`${WINDOW_ROLE_ARG}widget`)
const isCapture = process.argv.includes(`${WINDOW_ROLE_ARG}capture`)

// The last cursor state the main process sent the widget (#34), kept from the start: the controls that
// listen mount once the focus state was read, after the first report, and are told it at once.
let hovering: boolean | null = null
const hoverListeners = new Set<(state: { hovering: boolean }) => void>()
ipcRenderer.on(IPC.widgetHover, (_event: unknown, state: { hovering?: unknown }) => {
  hovering = state?.hovering === true
  for (const listener of hoverListeners) listener({ hovering })
})

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
  windowRole: isWidget ? 'widget' : isCapture ? 'capture' : 'main',
  collapseFocus: () => ipcRenderer.invoke(IPC.focusCollapse),
  expandFocus: (reason) => ipcRenderer.invoke(IPC.focusExpand, reason),
  resizeWidget: (mode) => ipcRenderer.invoke(IPC.widgetResize, mode),
  notifyFocusChanged: () => {
    void ipcRenderer.invoke(IPC.focusChanged).catch(() => undefined)
  },
  onFocusChanged: (callback) => {
    const listener = () => callback()
    ipcRenderer.on(IPC.focusChanged, listener)
    return () => {
      ipcRenderer.removeListener(IPC.focusChanged, listener)
    }
  },
  onWidgetState: (callback) => {
    const listener = (_event: unknown, state: { open: boolean }) => callback(state)
    ipcRenderer.on(IPC.widgetState, listener)
    return () => {
      ipcRenderer.removeListener(IPC.widgetState, listener)
    }
  },
  onWidgetHover: (callback) => {
    const listener = (state: { hovering: boolean }) => callback(state)
    hoverListeners.add(listener)
    if (hovering !== null) listener({ hovering })
    return () => {
      hoverListeners.delete(listener)
    }
  },
  getCaptureShortcut: () => ipcRenderer.invoke(IPC.getCaptureShortcut),
  setCaptureShortcut: (setting) => ipcRenderer.invoke(IPC.setCaptureShortcut, setting),
  closeCapture: () => ipcRenderer.invoke(IPC.closeCapture),
}

contextBridge.exposeInMainWorld('trackzyn', api)
