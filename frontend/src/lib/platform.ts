/**
 * Desktop (Electron) integration point. The preload script exposes
 * `window.trackzyn`; everywhere else the app asks `isDesktop()` and, on the
 * web, nothing here ever touches that object.
 */
export type SetServerUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-url' | 'insecure' | 'unreachable' }

/** Mirrors desktop/src/shared/ipc.ts: exactly these twenty-two members. */
export interface TrackzynApi {
  isDesktop: true
  platform: string
  appVersion: string
  getServerUrl(): Promise<string | null>
  setServerUrl(url: string, options?: { allowInsecure?: boolean }): Promise<SetServerUrlResult>
  openExternal(url: string): Promise<void>
  onUpdateAvailable(callback: (info: { version: string }) => void): () => void
  installUpdate(): Promise<void>
  startSso(): Promise<void>
  /** `null` while the choice between a server and this computer is open. */
  getMode(): Promise<'remote' | 'local' | null>
  /** Starts (or joins) the local backend; resolves once it listens or has failed. */
  startLocal(): Promise<{ ok: boolean; reason?: 'import-journal' }>
  /** Opens the folder with the local backend's logs. */
  openLogs(): Promise<void>
  /** Tells whether an export is running (the interface locks while it does); returns an unsubscribe. */
  onExportState(callback: (state: { exporting: boolean }) => void): () => void
  /** Tells the desktop whether a focus is open and a task is counting, so closing can ask first (SYNC-08). */
  reportFocusState(state: { active: boolean; running: boolean }): void
  /** Runs `callback` when closing the desktop app asks for the pause. Returns an unsubscribe. */
  onPauseRequest(callback: () => Promise<void>): () => void
  /** Which desktop window this page runs in: the focus widget or the main window. */
  windowRole: 'main' | 'widget'
  /** Opens the focus widget and minimizes the main window. */
  collapseFocus(): Promise<void>
  /** Closes the widget and brings the main window back: to the focus screen, or to the board with `task_left`. */
  expandFocus(reason?: 'task_left'): Promise<void>
  /** Grows the widget for the notes field, or shrinks it back. */
  resizeWidget(mode: 'compact' | 'notes'): Promise<void>
  /** Tells the other window that the focus changed here. */
  notifyFocusChanged(): void
  /** Runs `callback` when the other window changed the focus. Returns an unsubscribe. */
  onFocusChanged(callback: () => void): () => void
  /** Tells whether the focus widget is open. Returns an unsubscribe. */
  onWidgetState(callback: (state: { open: boolean }) => void): () => void
}

declare global {
  interface Window {
    trackzyn?: TrackzynApi
  }
}

export function isDesktop(): boolean {
  return window.trackzyn?.isDesktop === true
}

/**
 * The bridge, for code that only runs on desktop. The only place the full
 * object is read, and only in the desktop build: `__DESKTOP_BUILD__` is a
 * compile-time constant, so the web bundle keeps no reference to it.
 */
export function getDesktopApi(): TrackzynApi {
  const api = __DESKTOP_BUILD__ ? window.trackzyn : undefined
  if (!api) throw new Error('The desktop bridge is not available')
  return api
}
