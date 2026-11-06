import type { Bounds } from './config-store'
import { IPC } from '../shared/ipc'

/** How often the cursor is read against the widget while it is open. */
export const WIDGET_HOVER_POLL_MS = 50

interface HoverWindowLike {
  getBounds(): Bounds
  isDestroyed(): boolean
  webContents: {
    send(channel: string, ...args: unknown[]): void
    isDestroyed(): boolean
    on(event: 'did-finish-load', listener: () => void): unknown
  }
  on(event: 'closed', listener: () => void): unknown
}

interface Deps {
  screen: { getCursorScreenPoint(): { x: number; y: number } }
  setInterval?: (callback: () => void, ms: number) => unknown
  clearInterval?: (timer: unknown) => void
  intervalMs?: number
}

function contains(bounds: Bounds, point: { x: number; y: number }): boolean {
  return point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height
}

/**
 * Tells the widget page when the cursor enters and leaves the widget window (#34). The whole window is a
 * drag region, and over a drag region the page gets no mouse events, so the main process reads the
 * cursor against the window bounds while the widget is open and sends `{ hovering }` on `widget:hover`
 * each time that changes. A page that loads again is told the current state on its next read.
 * Returns a stop function; the reading also stops when the window closes.
 */
export function trackWidgetHover(win: HoverWindowLike, deps: Deps): () => void {
  const every = deps.setInterval ?? ((callback, ms) => setInterval(callback, ms))
  const cancel = deps.clearInterval ?? ((timer) => clearInterval(timer as ReturnType<typeof setInterval>))
  let last: boolean | null = null
  let timer: unknown = null

  const read = () => {
    // On closing, the page can go before the window, and sending to it throws in the main process.
    if (win.isDestroyed() || win.webContents.isDestroyed()) return stop()
    const hovering = contains(win.getBounds(), deps.screen.getCursorScreenPoint())
    if (hovering === last) return
    last = hovering
    win.webContents.send(IPC.widgetHover, { hovering })
  }
  function stop() {
    if (timer === null) return
    cancel(timer)
    timer = null
  }

  win.webContents.on('did-finish-load', () => {
    last = null
  })
  win.on('closed', stop)
  timer = every(read, deps.intervalMs ?? WIDGET_HOVER_POLL_MS)
  return stop
}
