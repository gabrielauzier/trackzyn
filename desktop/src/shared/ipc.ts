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
  /** Main to the widget page: the cursor entered (`hovering: true`) or left the widget window (#34). */
  widgetHover: 'widget:hover',
  /** The global capture shortcut as saved: on or off, and the combination (CAP-07). */
  getCaptureShortcut: 'capture:get-shortcut',
  /** Saves and applies the capture shortcut; answers `in_use` when the system refuses it (CAP-08). */
  setCaptureShortcut: 'capture:set-shortcut',
  /** Closes the capture window once the item is kept (CAP-06). */
  closeCapture: 'capture:close',
} as const

export type SetServerUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-url' | 'insecure' | 'unreachable' }

/** What the renderer sees as `window.trackzyn`. Exactly these twenty-six members. */
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
  /** Which window this page runs in: the focus widget, the capture window or the main window. */
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
  /** In the widget: runs `callback` when the cursor enters or leaves the widget window, read by the main process. Returns an unsubscribe. */
  onWidgetHover(callback: (state: { hovering: boolean }) => void): () => void
  /** The global capture shortcut of this computer (CAP-07). */
  getCaptureShortcut(): Promise<CaptureShortcutSetting>
  /** Turns the capture shortcut on or off, or changes it; `in_use` when the system refused it, which leaves it off (CAP-08). */
  setCaptureShortcut(setting: CaptureShortcutSetting): Promise<SetCaptureShortcutResult>
  /** In the capture window: closes it. */
  closeCapture(): Promise<void>
}

export interface CaptureShortcutSetting {
  enabled: boolean
  accelerator: string
}

export type SetCaptureShortcutResult = { ok: true } | { ok: false; reason: 'in_use' }

export type WindowRole = 'main' | 'widget' | 'capture'

export const APP_VERSION_ARG = '--trackzyn-app-version='
/** `widget` on the widget window, `capture` on the capture window; any other value, or none, is the main window. */
export const WINDOW_ROLE_ARG = '--trackzyn-window-role='
