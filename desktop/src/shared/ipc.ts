/** IPC channel names shared by the main process and the preload bridge. */
export const IPC = {
  getServerUrl: 'server:get-url',
  setServerUrl: 'server:set-url',
  openExternal: 'shell:open-external',
  installUpdate: 'updater:install',
  startSso: 'sso:start',
  getMode: 'mode:get',
  startLocal: 'local:start',
  openLogs: 'local:open-logs',
  exportState: 'transfer:export-state',
  updateAvailable: 'updater:update-available',
  focusState: 'focus:state',
  /** Main to renderer asks the pause; the renderer answers on the same channel once it is done. */
  focusPauseRequest: 'focus:pause-request',
  focusCollapse: 'focus:collapse',
  focusExpand: 'focus:expand',
  /** Renderer to main says the focus changed; main relays it to the other window on the same channel. */
  focusChanged: 'focus:changed',
  widgetState: 'widget:state',
  widgetResize: 'widget:resize',
} as const

export type SetServerUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-url' | 'insecure' | 'unreachable' }

/** What the renderer sees as `window.trackzyn`. Exactly these twenty-two members. */
export interface TrackzynApi {
  isDesktop: true
  platform: string
  appVersion: string
  getServerUrl(): Promise<string | null>
  setServerUrl(url: string, options?: { allowInsecure?: boolean }): Promise<SetServerUrlResult>
  openExternal(url: string): Promise<void>
  onUpdateAvailable(callback: (info: { version: string }) => void): () => void
  installUpdate(): Promise<void>
  /** Opens the server's SSO login in the system browser; the sign-in returns through trackzyn://auth/callback. */
  startSso(): Promise<void>
  /** `null` while the choice between a server and this computer is open. */
  getMode(): Promise<'remote' | 'local' | null>
  /** Starts (or joins) the local backend; resolves once it listens or has failed. */
  startLocal(): Promise<{ ok: boolean; reason?: 'import-journal' }>
  /** Opens the folder with the local backend's logs. */
  openLogs(): Promise<void>
  /** Tells whether an export is running (the interface locks while it does); returns an unsubscribe. */
  onExportState(callback: (state: { exporting: boolean }) => void): () => void
  /** Tells the main process whether a focus is open and a task is counting, so closing can ask first (SYNC-08). */
  reportFocusState(state: { active: boolean; running: boolean }): void
  /** Runs `callback` when closing asks for the pause; the main process waits for it to settle. Returns an unsubscribe. */
  onPauseRequest(callback: () => Promise<void>): () => void
  /** Which window this page runs in: the focus widget or the main window. */
  windowRole: WindowRole
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

export type WindowRole = 'main' | 'widget'

export const APP_VERSION_ARG = '--trackzyn-app-version='
/** Present with `widget` on the widget window only; any other value, or none, is the main window. */
export const WINDOW_ROLE_ARG = '--trackzyn-window-role='
