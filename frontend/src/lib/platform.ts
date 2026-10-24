/**
 * Desktop (Electron) integration point. The preload script exposes
 * `window.launchkit`; everywhere else the app asks `isDesktop()` and, on the
 * web, nothing here ever touches that object.
 */
export type SetServerUrlResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'invalid-url' | 'insecure' | 'unreachable' }

/** Mirrors desktop/src/shared/ipc.ts: exactly these thirteen members. */
export interface LaunchkitApi {
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
}

declare global {
  interface Window {
    launchkit?: LaunchkitApi
  }
}

export function isDesktop(): boolean {
  return window.launchkit?.isDesktop === true
}

/**
 * The bridge, for code that only runs on desktop. The only place the full
 * object is read, and only in the desktop build: `__DESKTOP_BUILD__` is a
 * compile-time constant, so the web bundle keeps no reference to it.
 */
export function getDesktopApi(): LaunchkitApi {
  const api = __DESKTOP_BUILD__ ? window.launchkit : undefined
  if (!api) throw new Error('The desktop bridge is not available')
  return api
}
