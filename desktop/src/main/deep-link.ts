import { APP_ORIGIN } from './app-protocol'

export const DEEP_LINK_SCHEME = 'trackzyn'

export type DeepLink = { kind: 'ignored' } | { kind: 'failed' } | { kind: 'sign-in'; token: string; nonce: string | null }

/**
 * Only `trackzyn://auth/callback` is a link the app acts on. With an
 * `access_token` in the fragment it is a sign-in, without one an incomplete
 * sign-in; any other host or path is none of the app's business.
 */
export function parseDeepLink(link: string): DeepLink {
  let url: URL
  try {
    url = new URL(link)
  } catch {
    return { kind: 'ignored' }
  }
  if (url.protocol !== `${DEEP_LINK_SCHEME}:` || url.hostname !== 'auth' || url.pathname !== '/callback') {
    return { kind: 'ignored' }
  }
  const fragment = new URLSearchParams(url.hash.slice(1))
  const token = fragment.get('access_token')
  return token ? { kind: 'sign-in', token, nonce: fragment.get('desktop_nonce') } : { kind: 'failed' }
}

/** The trackzyn:// link in a process argv (second instance, or a cold start on Windows and Linux). */
export function findDeepLink(argv: readonly string[]): string | undefined {
  return argv.find((arg) => arg.startsWith(`${DEEP_LINK_SCHEME}:`))
}

interface HandlerOptions {
  getServerUrl: () => string | null
  /** Loads an `app://trackzyn/...` URL in the main window. */
  navigate: (url: string) => void
  /** Brings the window to the front. */
  focus: () => void
  /** Whether `nonce` belongs to the sign-in the app started (single use). */
  consumeNonce: (nonce: string | null) => boolean
}

/**
 * Handles one link at a time. A link identical to the last one handled is
 * dropped: the system may deliver the same link on more than one path.
 */
export function createDeepLinkHandler({ getServerUrl, navigate, focus, consumeNonce }: HandlerOptions): (link: string) => void {
  let last: string | null = null
  return (link) => {
    const parsed = parseDeepLink(link)
    if (parsed.kind === 'ignored' || link === last) return
    last = link
    focus()
    if (parsed.kind === 'sign-in' && consumeNonce(parsed.nonce)) {
      navigate(`${APP_ORIGIN}/auth/oidc/callback#access_token=${encodeURIComponent(parsed.token)}&token_type=bearer`)
    } else {
      navigate(`${APP_ORIGIN}/${getServerUrl() ? 'login' : 'connect'}?sso=failed`)
    }
  }
}

interface AppLike {
  isPackaged: boolean
  setAsDefaultProtocolClient(scheme: string): unknown
  on(event: string, listener: (...args: never[]) => void): unknown
}

/**
 * Wires every way a link reaches the app: macOS `open-url`, the argv of a
 * second instance, and the argv this process started with (Windows and Linux).
 */
export function setupDeepLinks(app: AppLike, onLink: (link: string) => void, startupArgv: readonly string[]): void {
  // An unpackaged run would make the Electron binary itself the system handler.
  if (app.isPackaged) app.setAsDefaultProtocolClient(DEEP_LINK_SCHEME)
  app.on('open-url', ((event: { preventDefault(): void }, link: string) => {
    event.preventDefault()
    onLink(link)
  }) as never)
  app.on('second-instance', ((_event: unknown, argv: readonly string[]) => {
    const link = findDeepLink(argv)
    if (link) onLink(link)
  }) as never)
  const startup = findDeepLink(startupArgv)
  if (startup) onLink(startup)
}
