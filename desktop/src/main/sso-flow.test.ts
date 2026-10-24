import { describe, expect, it, vi } from 'vitest'
import { createSsoFlow, SSO_PENDING_MS } from './sso-flow'

const BASE64URL_43 = /^[A-Za-z0-9_-]{43}$/

function flow(serverUrl: string | null = 'https://srv.example.com') {
  let time = 1_000_000
  const openExternal = vi.fn<(url: string) => Promise<void>>(async () => {})
  const sso = createSsoFlow({ getServerUrl: () => serverUrl, openExternal, now: () => time })
  return {
    sso,
    openExternal,
    advance: (ms: number) => {
      time += ms
    },
    nonceOf: (call: number) => new URL(openExternal.mock.calls[call][0]).searchParams.get('desktop_nonce') as string,
  }
}

describe('SSO pending flow', () => {
  it('builds the login url with a 43 character base64url nonce', async () => {
    const { sso, openExternal, nonceOf } = flow('https://srv.example.com/')
    await sso.start()
    expect(openExternal).toHaveBeenCalledTimes(1)
    const nonce = nonceOf(0)
    expect(nonce).toMatch(BASE64URL_43)
    expect(openExternal).toHaveBeenCalledWith(
      `https://srv.example.com/api/auth/oidc/login?redirect_target=launchkit%3A%2F%2Fauth%2Fcallback&desktop_nonce=${nonce}`,
    )
  })

  it('opens nothing without a configured server', async () => {
    const { sso, openExternal } = flow(null)
    await sso.start()
    expect(openExternal).not.toHaveBeenCalled()
    expect(sso.consume('anything')).toBe(false)
  })

  it('keeps one pending flow for ten minutes and consumes it once', async () => {
    const { sso, advance, nonceOf } = flow()
    await sso.start()
    await sso.start()
    const [first, second] = [nonceOf(0), nonceOf(1)]
    expect(first).not.toBe(second)

    // A new start replaces the old flow.
    expect(sso.consume(first)).toBe(false)
    await sso.start()
    const third = nonceOf(2)
    expect(sso.consume(third)).toBe(true)
    expect(sso.consume(third)).toBe(false)

    // Nothing pending: absent and unknown nonces are refused.
    expect(sso.consume(null)).toBe(false)
    expect(sso.consume('x'.repeat(43))).toBe(false)

    // Expiry at ten minutes.
    await sso.start()
    const fourth = nonceOf(3)
    advance(SSO_PENDING_MS - 1)
    expect(sso.consume(fourth)).toBe(true)
    await sso.start()
    const fifth = nonceOf(4)
    advance(SSO_PENDING_MS + 1)
    expect(sso.consume(fifth)).toBe(false)
  })

  it('spends the pending flow on a wrong nonce', async () => {
    const { sso, nonceOf } = flow()
    await sso.start()
    expect(sso.consume('y'.repeat(43))).toBe(false)
    expect(sso.consume(nonceOf(0))).toBe(false)
  })
})
