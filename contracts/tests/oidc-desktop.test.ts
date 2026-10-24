import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { tokenFromFragment } from './support/flows'
import { Api, type Reply } from './support/http'
import { FakeIdp } from './support/idp'
import { redis } from './support/redis'
import { type RunningStack, startSubject } from './support/stacks'

const DESKTOP = 'launchkit://auth/callback'
const FRONTEND = 'http://localhost:5173'

const newNonce = (): string => randomBytes(32).toString('base64url')

/** Login with a redirect_target and, unless `nonce` is null, a desktop_nonce (a fresh 43 character one by default). */
const login = (api: Api, target?: string, nonce: string | null | undefined = undefined): Promise<Reply> => {
  const params: string[] = []
  if (target !== undefined) params.push(`redirect_target=${encodeURIComponent(target)}`)
  const value = nonce === undefined ? (target === undefined ? null : newNonce()) : nonce
  if (value !== null) params.push(`desktop_nonce=${encodeURIComponent(value)}`)
  return api.get(`/api/auth/oidc/login${params.length ? `?${params.join('&')}` : ''}`)
}

const stateKeys = async (): Promise<string[]> => (await redis().keys('oidc_state:*')).sort()

/** The authorization-code round trip for a login reply that redirected to the provider. */
async function finishCallback(api: Api, idp: FakeIdp, begin: Reply, subjectId: string): Promise<Reply> {
  expect(begin.status).toBe(307)
  const location = new URL(begin.headers.get('location') as string)
  const state = location.searchParams.get('state') as string
  const stored = JSON.parse((await redis().get(`oidc_state:${state}`)) as string)
  const code = `code-${subjectId}`
  idp.grant(code, stored.nonce, location.searchParams.get('code_challenge') as string, {
    claims: { sub: subjectId, email: `${subjectId}@example.com`, email_verified: true },
  })
  return api.get(`/api/auth/oidc/callback?code=${code}&state=${state}`)
}

describe('desktop sign-in: redirect_target with an allowlist', () => {
  let idp: FakeIdp
  let stack: RunningStack
  let api: Api

  beforeAll(async () => {
    idp = await FakeIdp.start()
    stack = await startSubject(idp.env({ OIDC_DESKTOP_REDIRECT: DESKTOP }))
    api = new Api(stack.url)
  })
  afterAll(async () => {
    await stack?.stop()
    await idp?.stop()
  })

  it('D2 login with redirect_target redirects to the provider with the eight parameters', async () => {
    const reply = await login(api, DESKTOP)
    expect(reply.status).toBe(307)
    const location = new URL(reply.headers.get('location') as string)
    expect(`${location.origin}${location.pathname}`).toBe(`${idp.issuer}/authorize`)
    expect([...location.searchParams.keys()].sort()).toEqual([
      'client_id',
      'code_challenge',
      'code_challenge_method',
      'nonce',
      'redirect_uri',
      'response_type',
      'scope',
      'state',
    ])
  })

  it('D2 state is stored with nonce, code_verifier, redirect_target and desktop_nonce', async () => {
    const desktopNonce = newNonce()
    expect(desktopNonce).toHaveLength(43)
    const reply = await login(api, DESKTOP, desktopNonce)
    const location = new URL(reply.headers.get('location') as string)
    const key = `oidc_state:${location.searchParams.get('state')}`
    const stored = JSON.parse((await redis().get(key)) as string)
    expect(Object.keys(stored).sort()).toEqual(['code_verifier', 'desktop_nonce', 'nonce', 'redirect_target'])
    expect(stored.redirect_target).toBe(DESKTOP)
    expect(stored.desktop_nonce).toBe(desktopNonce)
    expect(stored.nonce).toBe(location.searchParams.get('nonce'))
    const ttl = await redis().ttl(key)
    expect(ttl).toBeGreaterThan(590)
    expect(ttl).toBeLessThanOrEqual(600)
  })

  it('D3 callback redirects to the desktop deep link with an app token in the fragment', async () => {
    const desktopNonce = newNonce()
    const begin = await login(api, DESKTOP, desktopNonce)
    const reply = await finishCallback(api, idp, begin, 'oidc-d3')
    expect(reply.status).toBe(307)
    const location = reply.headers.get('location') as string
    expect(location.startsWith(`${DESKTOP}#access_token=`)).toBe(true)
    expect(location.endsWith(`&token_type=bearer&desktop_nonce=${desktopNonce}`)).toBe(true)
    const me = await api.get('/api/users/me', { token: tokenFromFragment(reply) as string })
    expect(me.status).toBe(200)
    expect(me.json.email).toBe('oidc-d3@example.com')
  })

  const rejected: Array<[string, string]> = [
    ['another host', 'https://evil.example/cb'],
    ['a trailing slash', `${DESKTOP}/`],
    ['a longer path', `${DESKTOP}x`],
    ['another case', 'LAUNCHKIT://auth/callback'],
    ['a leading space', ` ${DESKTOP}`],
    ['an empty value', ''],
  ]
  for (const [label, value] of rejected) {
    it(`D4 rejects a redirect_target with ${label}`, async () => {
      const before = await stateKeys()
      const reply = await login(api, value)
      expect(reply.status).toBe(400)
      expect(reply.json).toEqual({ detail: 'Invalid redirect_target' })
      expect(reply.headers.get('location')).toBeNull()
      expect(await stateKeys()).toEqual(before)
    })
  }

  it('D4 rejects a missing or short desktop_nonce', async () => {
    const before = await stateKeys()
    for (const nonce of [null, '', 'x'.repeat(31)]) {
      const reply = await login(api, DESKTOP, nonce)
      expect(reply.status, String(nonce)).toBe(400)
      expect(reply.json).toEqual({ detail: 'Invalid desktop_nonce' })
      expect(reply.headers.get('location')).toBeNull()
      expect(await stateKeys()).toEqual(before)
    }
    const boundary = await login(api, DESKTOP, 'x'.repeat(32))
    expect(boundary.status).toBe(307)
  })

  it('D4 rejects a desktop_nonce longer than 128 characters', async () => {
    const before = await stateKeys()
    const longest = await login(api, DESKTOP, 'x'.repeat(128))
    expect(longest.status).toBe(307)
    const afterOk = await stateKeys()
    for (const nonce of ['x'.repeat(129), 'x'.repeat(5000)]) {
      const reply = await login(api, DESKTOP, nonce)
      expect(reply.status, String(nonce.length)).toBe(400)
      expect(reply.json).toEqual({ detail: 'Invalid desktop_nonce' })
      expect(reply.headers.get('location')).toBeNull()
      expect(await stateKeys()).toEqual(afterOk)
    }
    expect(afterOk.length).toBe(before.length + 1)
  })

  it('D4 rejects a desktop_nonce that is not base64url', async () => {
    const before = await stateKeys()
    // Non-ASCII counts differently in Python (code points) and Node (UTF-16 units): only [A-Za-z0-9_-] is a nonce.
    for (const nonce of ['é'.repeat(32), '😀'.repeat(32), `${'x'.repeat(31)}+`, `${'x'.repeat(31)}/`, `${'x'.repeat(31)}=`, `${'x'.repeat(31)} `, `${'x'.repeat(31)}.`]) {
      const reply = await login(api, DESKTOP, nonce)
      expect(reply.status, nonce).toBe(400)
      expect(reply.json).toEqual({ detail: 'Invalid desktop_nonce' })
      expect(reply.headers.get('location')).toBeNull()
    }
    expect(await stateKeys()).toEqual(before)
    const ok = await login(api, DESKTOP, `${'A'.repeat(20)}-_${'z'.repeat(10)}09`)
    expect(ok.status).toBe(307)
  })

  it('D4 rejects a desktop_nonce with a trailing line feed, and one given twice', async () => {
    const before = await stateKeys()
    for (const nonce of [`${'x'.repeat(32)}\n`, `${'x'.repeat(128)}\n`]) {
      const reply = await login(api, DESKTOP, nonce)
      expect(reply.status, JSON.stringify(nonce)).toBe(400)
      expect(reply.json).toEqual({ detail: 'Invalid desktop_nonce' })
    }
    const target = `redirect_target=${encodeURIComponent(DESKTOP)}`
    for (const query of [
      `${target}&desktop_nonce=${'a'.repeat(43)}&desktop_nonce=${'b'.repeat(43)}`,
      `${target}&desktop_nonce=${'a'.repeat(43)}&desktop_nonce=short`,
      `${target}&desktop_nonce=short&desktop_nonce=${'a'.repeat(43)}`,
    ]) {
      const reply = await api.get(`/api/auth/oidc/login?${query}`)
      expect(reply.status, query).toBe(400)
      expect(reply.json).toEqual({ detail: 'Invalid desktop_nonce' })
      expect(reply.headers.get('location')).toBeNull()
    }
    expect(await stateKeys()).toEqual(before)
  })

  it('D4 rejects an invalid redirect_target before it looks at the desktop_nonce', async () => {
    const reply = await login(api, 'https://evil.example/cb', null)
    expect(reply.status).toBe(400)
    expect(reply.json).toEqual({ detail: 'Invalid redirect_target' })
  })

  it('D5 without redirect_target the state and the redirect are unchanged', async () => {
    // A desktop_nonce without a redirect_target changes nothing and is not stored.
    const begin = await login(api, undefined, newNonce())
    expect(begin.status).toBe(307)
    const state = new URL(begin.headers.get('location') as string).searchParams.get('state')
    const stored = JSON.parse((await redis().get(`oidc_state:${state}`)) as string)
    expect(Object.keys(stored).sort()).toEqual(['code_verifier', 'nonce'])

    const reply = await finishCallback(api, idp, begin, 'oidc-d5')
    expect(reply.status).toBe(307)
    const location = reply.headers.get('location') as string
    expect(location.startsWith(`${FRONTEND}/auth/oidc/callback#access_token=`)).toBe(true)
    expect(location.endsWith('&token_type=bearer')).toBe(true)
  })
})

describe('desktop sign-in: allowlists that are empty, unset or have several items', () => {
  let idp: FakeIdp
  beforeAll(async () => {
    idp = await FakeIdp.start()
  })
  afterAll(async () => {
    await idp?.stop()
  })

  for (const [label, env] of [
    ['unset', {}],
    ['empty', { OIDC_DESKTOP_REDIRECT: '' }],
  ] as const) {
    it(`D4 empty or unset allowlist (${label}) rejects ${DESKTOP}`, async () => {
      const stack = await startSubject(idp.env(env))
      try {
        const before = await stateKeys()
        const reply = await login(new Api(stack.url), DESKTOP)
        expect(reply.status).toBe(400)
        expect(reply.json).toEqual({ detail: 'Invalid redirect_target' })
        expect(reply.headers.get('location')).toBeNull()
        expect(await stateKeys()).toEqual(before)
      } finally {
        await stack.stop()
      }
    })
  }

  it('D4 accepts every item of the list and rejects a third', async () => {
    const stack = await startSubject(idp.env({ OIDC_DESKTOP_REDIRECT: `${DESKTOP}, launchkit://x/y` }))
    try {
      const api = new Api(stack.url)
      for (const item of [DESKTOP, 'launchkit://x/y']) {
        const reply = await login(api, item)
        expect(reply.status, item).toBe(307)
        expect(reply.headers.get('location')).toContain(`${idp.issuer}/authorize`)
      }
      const third = await login(api, 'launchkit://z/z')
      expect(third.status).toBe(400)
      expect(third.json).toEqual({ detail: 'Invalid redirect_target' })
    } finally {
      await stack.stop()
    }
  })
})

describe('desktop sign-in: the suite covers every criterion', () => {
  it('D6 the suite has a case for each of D2, D3, D4 and D5', () => {
    const source = readFileSync(import.meta.filename, 'utf8')
    for (const id of ['D2', 'D3', 'D4', 'D5']) {
      expect(source, `no case titled "${id} ..."`).toMatch(new RegExp(`\\bit\\(\\s*[\`'"]${id} `))
    }
  })

  it('D6 contracts/openapi.json declares redirect_target as an optional query parameter of the OIDC login', () => {
    const spec = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../openapi.json'), 'utf8')) as {
      paths: Record<string, { get?: { parameters?: Array<{ name: string; in: string; required?: boolean }> } }>
    }
    const parameters = spec.paths['/api/auth/oidc/login']?.get?.parameters ?? []
    const target = parameters.find((parameter) => parameter.name === 'redirect_target')
    expect(target, 'redirect_target in the OpenAPI document').toBeDefined()
    expect(target?.in).toBe('query')
    expect(target?.required ?? false).toBe(false)
  })
})
