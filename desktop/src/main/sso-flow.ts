import { randomBytes } from 'node:crypto'

/** How long a sign-in started by the app may take to come back through the deep link. */
export const SSO_PENDING_MS = 10 * 60 * 1000

const REDIRECT_TARGET = 'trackzyn://auth/callback'

interface Options {
  getServerUrl: () => string | null
  openExternal: (url: string) => Promise<void>
  now?: () => number
}

/**
 * The one sign-in the app started and is waiting for. The nonce travels
 * through the provider and the server and must come back in the deep link, so
 * a link another program fires at the app is not taken for a sign-in.
 */
export function createSsoFlow({ getServerUrl, openExternal, now = Date.now }: Options) {
  let pending: { nonce: string; expiresAt: number } | null = null

  return {
    /** Opens the server's SSO login in the system browser; a new start replaces the pending flow. */
    async start(): Promise<void> {
      const serverUrl = getServerUrl()
      if (!serverUrl) return
      const nonce = randomBytes(32).toString('base64url')
      pending = { nonce, expiresAt: now() + SSO_PENDING_MS }
      const target = encodeURIComponent(REDIRECT_TARGET)
      await openExternal(`${serverUrl.replace(/\/+$/, '')}/api/auth/oidc/login?redirect_target=${target}&desktop_nonce=${nonce}`)
    },

    /** True once, for the pending flow's nonce, before it expires. Any attempt with a nonce spends the flow. */
    consume(nonce: string | null): boolean {
      const flow = pending
      if (nonce === null || nonce === '') return false
      pending = null
      return flow !== null && flow.nonce === nonce && now() < flow.expiresAt
    },
  }
}
