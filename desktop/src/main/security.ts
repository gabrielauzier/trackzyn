import { APP_HOST, APP_SCHEME } from './app-protocol'

const EXTERNAL_SCHEMES = new Set(['http:', 'https:', 'mailto:'])

/** True for urls served by the app itself (app://trackzyn/...), and only those. */
export function isAppUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === `${APP_SCHEME}:` && parsed.host === APP_HOST
  } catch {
    return false
  }
}

/** Only web and mail links may leave the app; everything else stays inside. */
export function isAllowedExternalUrl(url: string): boolean {
  try {
    return EXTERNAL_SCHEMES.has(new URL(url).protocol)
  } catch {
    return false
  }
}

export async function openExternalSafely(url: unknown, openExternal: (url: string) => Promise<void>): Promise<void> {
  if (typeof url !== 'string' || !isAllowedExternalUrl(url)) throw new Error('Blocked external url')
  await openExternal(url)
}

interface NavigationEvent {
  preventDefault(): void
}

export interface HardenableWebContents {
  setWindowOpenHandler(handler: (details: { url: string }) => { action: 'deny' }): void
  on(event: 'will-navigate' | 'will-redirect' | 'will-frame-navigate' | 'will-attach-webview', listener: (event: NavigationEvent, url: string) => void): unknown
}

/**
 * Keeps the renderer on app://trackzyn: navigation elsewhere is cancelled,
 * `window.open` never creates a window, and allowed links go to the system
 * browser only when the page asks to open a new window.
 */
export function hardenWebContents(
  webContents: HardenableWebContents,
  options: { openExternal: (url: string) => Promise<void> },
): void {
  webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) void options.openExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  const block = (event: NavigationEvent, url: string) => {
    if (!isAppUrl(url)) event.preventDefault()
  }
  webContents.on('will-navigate', block)
  webContents.on('will-redirect', block)
  webContents.on('will-frame-navigate', block)
  webContents.on('will-attach-webview', (event) => event.preventDefault())
}

/** The app asks for no device permissions (camera, location, notifications...): deny every request. */
export function denyAllPermissions(session: {
  setPermissionRequestHandler(handler: (webContents: unknown, permission: string, callback: (granted: boolean) => void) => void): void
}): void {
  session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))
}
