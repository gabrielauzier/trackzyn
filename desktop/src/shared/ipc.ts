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
} as const

export type SetServerUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-url' | 'insecure' | 'unreachable' }

/** What the renderer sees as `window.trackzyn`. Exactly these fifteen members. */
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
}

export const APP_VERSION_ARG = '--trackzyn-app-version='
