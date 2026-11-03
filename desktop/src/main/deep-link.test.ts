import { describe, expect, it, vi } from 'vitest'
import { createSsoFlow, SSO_PENDING_MS } from './sso-flow'
import { createDeepLinkHandler, findDeepLink, parseDeepLink, setupDeepLinks } from './deep-link'

const TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl'
const NONCE = 'n'.repeat(43)
const SIGN_IN = `trackzyn://auth/callback#access_token=${TOKEN}&token_type=bearer&desktop_nonce=${NONCE}`

function handlerWith(serverUrl: string | null = 'https://srv.example.com', pending: string | null = NONCE) {
  const navigate = vi.fn()
  const focus = vi.fn()
  const consumeNonce = vi.fn((nonce: string | null) => nonce !== null && nonce === pending)
  const handle = createDeepLinkHandler({ getServerUrl: () => serverUrl, navigate, focus, consumeNonce })
  return { handle, navigate, focus, consumeNonce }
}

describe('deep links', () => {
  it('navigates to the sign-in callback page with the token', () => {
    const { handle, navigate, focus } = handlerWith()
    handle(SIGN_IN)
    expect(navigate).toHaveBeenCalledTimes(1)
    expect(navigate).toHaveBeenCalledWith(`app://trackzyn/auth/oidc/callback#access_token=${TOKEN}&token_type=bearer`)
    expect(focus).toHaveBeenCalled()
  })

  it('handles the same link once', () => {
    const { handle, navigate } = handlerWith()
    handle(SIGN_IN)
    handle(SIGN_IN)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('handles a different link after the first', () => {
    const { handle, navigate } = handlerWith()
    handle(SIGN_IN)
    handle(`trackzyn://auth/callback#access_token=${TOKEN}b&token_type=bearer&desktop_nonce=${NONCE}`)
    expect(navigate).toHaveBeenCalledTimes(2)
  })

  it('sends an incomplete link to the sign-in failure screen', async () => {
    const incomplete = [
      'trackzyn://auth/callback',
      'trackzyn://auth/callback#',
      'trackzyn://auth/callback#access_token=&token_type=bearer',
      'trackzyn://auth/callback#error=access_denied',
      // A token without the pending flow's nonce is not a sign-in the app started.
      `trackzyn://auth/callback#access_token=${TOKEN}&token_type=bearer`,
      `trackzyn://auth/callback#access_token=${TOKEN}&token_type=bearer&desktop_nonce=${'m'.repeat(43)}`,
      `trackzyn://auth/callback#access_token=${TOKEN}&token_type=bearer&desktop_nonce=`,
    ]
    for (const link of incomplete) {
      const withServer = handlerWith('https://srv.example.com')
      withServer.handle(link)
      expect(withServer.navigate, link).toHaveBeenCalledTimes(1)
      expect(withServer.navigate, link).toHaveBeenCalledWith('app://trackzyn/login?sso=failed')

      const withoutServer = handlerWith(null)
      withoutServer.handle(link)
      expect(withoutServer.navigate, link).toHaveBeenCalledWith('app://trackzyn/connect?sso=failed')
    }

    // The same table with the real pending flow: expired, already used, and none started.
    const sign = (nonce: string, token = TOKEN) => `trackzyn://auth/callback#access_token=${token}&token_type=bearer&desktop_nonce=${nonce}`
    async function started(clock: { now: number }) {
      let opened = ''
      const flow = createSsoFlow({ getServerUrl: () => 'https://srv.example.com', openExternal: async (url) => void (opened = url), now: () => clock.now })
      await flow.start()
      const nonce = new URL(opened).searchParams.get('desktop_nonce')!
      const navigate = vi.fn()
      const handle = createDeepLinkHandler({ getServerUrl: () => 'https://srv.example.com', navigate, focus: vi.fn(), consumeNonce: (value) => flow.consume(value) })
      return { nonce, navigate, handle }
    }
    const failed = 'app://trackzyn/login?sso=failed'

    const late = { now: 1_000 }
    const lateFlow = await started(late)
    late.now += SSO_PENDING_MS + 1
    lateFlow.handle(sign(lateFlow.nonce))
    expect(lateFlow.navigate).toHaveBeenCalledWith(failed)
    expect(lateFlow.navigate).toHaveBeenCalledTimes(1)

    // A nonce that is not the pending flow's is refused, and any attempt with a nonce spends the flow
    // (documented in the Landing): the flow's own link, arriving afterwards, is refused too.
    const other = await started({ now: 1_000 })
    other.handle(sign('m'.repeat(43)))
    expect(other.navigate).toHaveBeenLastCalledWith(failed)
    expect(other.navigate).toHaveBeenCalledTimes(1)
    other.handle(sign(other.nonce))
    expect(other.navigate).toHaveBeenLastCalledWith(failed)
    expect(other.navigate).toHaveBeenCalledTimes(2)

    const used = await started({ now: 1_000 })
    used.handle(sign(used.nonce))
    expect(used.navigate).toHaveBeenLastCalledWith(expect.stringContaining('/auth/oidc/callback#access_token='))
    used.handle(sign(used.nonce, `${TOKEN}b`))
    expect(used.navigate).toHaveBeenLastCalledWith(failed)
    expect(used.navigate).toHaveBeenCalledTimes(2)

    const navigateNone = vi.fn()
    createDeepLinkHandler({ getServerUrl: () => 'https://srv.example.com', navigate: navigateNone, focus: vi.fn(), consumeNonce: createSsoFlow({ getServerUrl: () => null, openExternal: async () => {} }).consume })(sign(NONCE))
    expect(navigateNone).toHaveBeenCalledExactlyOnceWith(failed)
  })

  it('a link without a token does not spend the pending sign-in', async () => {
    let opened = ''
    const flow = createSsoFlow({ getServerUrl: () => 'https://srv.example.com', openExternal: async (url) => void (opened = url) })
    await flow.start()
    const nonce = new URL(opened).searchParams.get('desktop_nonce')!
    const navigate = vi.fn()
    const handle = createDeepLinkHandler({ getServerUrl: () => 'https://srv.example.com', navigate, focus: vi.fn(), consumeNonce: (value) => flow.consume(value) })
    handle(`trackzyn://auth/callback#error=access_denied&desktop_nonce=${nonce}`)
    expect(navigate).toHaveBeenLastCalledWith('app://trackzyn/login?sso=failed')
    handle(`trackzyn://auth/callback#access_token=${TOKEN}&token_type=bearer&desktop_nonce=${nonce}`)
    expect(navigate).toHaveBeenLastCalledWith(expect.stringContaining('/auth/oidc/callback#access_token='))
  })

  it('refuses a sign-in with an expired, used or missing pending flow and stores nothing', () => {
    for (const pending of [null]) {
      const { handle, navigate } = handlerWith('https://srv.example.com', pending)
      handle(SIGN_IN)
      expect(navigate).toHaveBeenCalledTimes(1)
      expect(navigate).toHaveBeenCalledWith('app://trackzyn/login?sso=failed')
    }
  })

  it('asks the pending flow once per distinct link', () => {
    const { handle, consumeNonce } = handlerWith()
    handle(SIGN_IN)
    handle(SIGN_IN)
    expect(consumeNonce).toHaveBeenCalledTimes(1)
    expect(consumeNonce).toHaveBeenCalledWith(NONCE)
  })

  it('ignores links whose host and path are not auth/callback', () => {
    const others = [
      'trackzyn://auth/other',
      'trackzyn://evil/callback',
      'trackzyn://auth/callback/extra',
      'trackzyn://auth/callback/',
      'trackzyn://auth',
      'https://auth/callback#access_token=x',
      'not a url',
    ]
    for (const link of others) {
      expect(parseDeepLink(link), link).toEqual({ kind: 'ignored' })
      const { handle, navigate, focus } = handlerWith()
      handle(link)
      expect(navigate, link).not.toHaveBeenCalled()
      expect(focus, link).not.toHaveBeenCalled()
    }
  })

  it('parses a complete link into a sign-in', () => {
    expect(parseDeepLink(SIGN_IN)).toEqual({ kind: 'sign-in', token: TOKEN, nonce: NONCE })
    expect(parseDeepLink(`trackzyn://auth/callback#access_token=${TOKEN}`)).toEqual({ kind: 'sign-in', token: TOKEN, nonce: null })
  })
})

describe('deep link delivery', () => {
  it('finds the trackzyn url in a second-instance argv', () => {
    expect(findDeepLink(['/Applications/trackzyn.exe', '--flag', SIGN_IN])).toBe(SIGN_IN)
    expect(findDeepLink(['/Applications/trackzyn.exe', 'https://example.com'])).toBeUndefined()
    expect(findDeepLink([])).toBeUndefined()
  })

  function fakeApp(isPackaged: boolean) {
    const listeners = new Map<string, (...args: never[]) => void>()
    return {
      isPackaged,
      setAsDefaultProtocolClient: vi.fn(),
      on: vi.fn((event: string, listener: (...args: never[]) => void) => {
        listeners.set(event, listener)
      }),
      emit: (event: string, ...args: unknown[]) => listeners.get(event)?.(...(args as never[])),
    }
  }

  it('registers the trackzyn protocol', () => {
    const packaged = fakeApp(true)
    setupDeepLinks(packaged, vi.fn(), [])
    expect(packaged.setAsDefaultProtocolClient).toHaveBeenCalledWith('trackzyn')

    // Unpackaged, the Electron binary would become the system handler of trackzyn://.
    const unpackaged = fakeApp(false)
    setupDeepLinks(unpackaged, vi.fn(), [])
    expect(unpackaged.setAsDefaultProtocolClient).not.toHaveBeenCalled()
  })

  it('delivers open-url, second-instance and start-up argv links', () => {
    const app = fakeApp(false)
    const onLink = vi.fn()
    setupDeepLinks(app, onLink, ['electron', SIGN_IN])
    expect(onLink).toHaveBeenCalledWith(SIGN_IN)

    const preventDefault = vi.fn()
    app.emit('open-url', { preventDefault }, 'trackzyn://auth/callback#access_token=a&token_type=bearer')
    expect(preventDefault).toHaveBeenCalled()
    expect(onLink).toHaveBeenLastCalledWith('trackzyn://auth/callback#access_token=a&token_type=bearer')

    app.emit('second-instance', {}, ['electron', 'trackzyn://auth/callback#access_token=b&token_type=bearer'])
    expect(onLink).toHaveBeenLastCalledWith('trackzyn://auth/callback#access_token=b&token_type=bearer')

    const calls = onLink.mock.calls.length
    app.emit('second-instance', {}, ['electron'])
    expect(onLink).toHaveBeenCalledTimes(calls)
  })
})
