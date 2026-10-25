import { APP_ORIGIN } from './app-protocol'
import type { Bounds } from './config-store'
import { WIDGET_SIZE, widgetBounds } from './widget-bounds'
import { trackWindowState, type DisplayLike } from './window-state'
import { IPC } from '../shared/ipc'

export type WidgetCloseReason = 'expand' | 'restore' | 'system' | 'task_left'

interface WebContentsLike {
  send(channel: string, ...args: unknown[]): void
  on(event: 'did-navigate' | 'did-navigate-in-page', listener: (event: unknown, url: string) => void): unknown
  on(event: 'did-finish-load' | 'render-process-gone', listener: () => void): unknown
  getURL(): string
}

export interface WidgetWindowLike {
  on(event: string, listener: () => void): unknown
  close(): void
  focus(): void
  getBounds(): Bounds
  getNormalBounds(): Bounds
  setSize(width: number, height: number): void
  webContents: WebContentsLike
}

export interface MainWindowLike extends WidgetWindowLike {
  isMinimized(): boolean
  minimize(): void
  restore(): void
  show(): void
  loadURL(url: string): Promise<void>
}

interface Deps {
  mainWindow: MainWindowLike
  store: { getWidgetBounds(): Bounds | null; setWidgetBounds(bounds: Bounds): void }
  screen: { getAllDisplays(): DisplayLike[]; getDisplayMatching(rect: Bounds): DisplayLike }
  createWindow(bounds: Bounds): WidgetWindowLike
}

const FOCUS_URL = new RegExp(`^${APP_ORIGIN}/focus/([^/?#]+)`)

/**
 * Owns the focus widget and the rules between it and the main window: which one is shown, where the
 * widget sits, and relaying a focus change from one window to the other.
 */
export function createWidgetController({ mainWindow, store, screen, createWindow }: Deps) {
  let widget: WidgetWindowLike | null = null
  let closingReason: WidgetCloseReason | null = null
  let focusActive = false
  let mainGone = false
  // The main process does not know the focus list: the last focus screen the main window showed does.
  let lastFocusUrl = FOCUS_URL.test(mainWindow.webContents.getURL()) ? mainWindow.webContents.getURL() : null

  const remember = (_event: unknown, url: string) => {
    if (FOCUS_URL.test(url)) lastFocusUrl = url
  }
  mainWindow.webContents.on('did-navigate', remember)
  mainWindow.webContents.on('did-navigate-in-page', remember)

  const bringMainBack = (reason: WidgetCloseReason) => {
    if (mainGone || reason === 'restore') return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    const current = mainWindow.webContents.getURL()
    if (reason === 'task_left') {
      const listId = (FOCUS_URL.exec(current) ?? (lastFocusUrl ? FOCUS_URL.exec(lastFocusUrl) : null))?.[1]
      void mainWindow.loadURL(listId ? `${APP_ORIGIN}/lists/${listId}` : `${APP_ORIGIN}/`).catch(() => undefined)
    } else if (!FOCUS_URL.test(current) && lastFocusUrl) {
      void mainWindow.loadURL(lastFocusUrl).catch(() => undefined)
    }
  }

  const sendState = (open: boolean) => {
    if (!mainGone) mainWindow.webContents.send(IPC.widgetState, { open })
  }

  function open() {
    if (widget) {
      widget.focus()
    } else {
      const bounds = widgetBounds(store.getWidgetBounds(), screen.getAllDisplays(), screen.getDisplayMatching(mainWindow.getBounds()))
      const win = createWindow(bounds)
      widget = win
      trackWindowState(win, { setBounds: (saved) => store.setWidgetBounds(saved) })
      win.webContents.on('did-finish-load', () => win.webContents.send(IPC.widgetState, { open: true }))
      // A renderer that crashed or was killed leaves an empty window: back to the main one.
      win.webContents.on('render-process-gone', () => close('system'))
      win.on('closed', () => {
        if (widget !== win) return
        const reason = closingReason ?? 'system'
        closingReason = null
        widget = null
        sendState(false)
        bringMainBack(reason)
      })
      sendState(true)
    }
    if (!mainWindow.isMinimized()) mainWindow.minimize()
  }

  function close(reason: WidgetCloseReason) {
    if (!widget || closingReason) return
    closingReason = reason
    widget.close()
  }

  mainWindow.on('minimize', () => {
    if (focusActive && !widget) open()
  })
  // Restored from the taskbar or the Dock (WIDGET-19).
  mainWindow.on('restore', () => close('restore'))
  mainWindow.on('show', () => close('restore'))
  mainWindow.on('closed', () => {
    mainGone = true
    close('restore')
  })

  return {
    open,
    close,
    isOpen: () => widget !== null,
    focusActive: () => focusActive,
    setFocusState(state: unknown) {
      focusActive = (state as { active?: unknown } | null | undefined)?.active === true
    },
    resize(mode: unknown) {
      if (!widget || (mode !== 'compact' && mode !== 'notes')) return
      widget.setSize(WIDGET_SIZE[mode].width, WIDGET_SIZE[mode].height)
    },
    /** Relays `focus:changed` from the window that sent it to the other one (WIDGET-22). */
    focusChanged(sender: unknown) {
      const target = sender === mainWindow.webContents ? widget : sender === widget?.webContents ? mainWindow : null
      if (target && !(target === mainWindow && mainGone)) target.webContents.send(IPC.focusChanged)
    },
  }
}
