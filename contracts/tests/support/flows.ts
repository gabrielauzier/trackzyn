import { TOTP, Secret } from 'otpauth'
import { expect } from 'vitest'
import type { VirtualAuthenticator } from './authenticator'
import { type Api, type Reply, freshIp, login } from './http'
import { trackSecret } from './secrets'

export const ORIGIN = 'https://launchkit.test'

export function totpCode(secret: string, offsetSeconds = 0): string {
  const totp = new TOTP({ secret: Secret.fromBase32(secret) })
  return totp.generate({ timestamp: Date.now() + offsetSeconds * 1000 })
}

/** Turns on TOTP 2FA through the API and returns the shared secret. */
export async function enableTotp(api: Api, token: string): Promise<string> {
  const setup = await api.post('/api/auth/2fa/setup', { token })
  expect(setup.status).toBe(200)
  const secret = setup.json.secret as string
  const enabled = await api.post('/api/auth/2fa/enable', { token, json: { code: totpCode(secret) } })
  expect(enabled.status).toBe(200)
  return secret
}

/** A real registration ceremony against `api`; returns the created passkey. */
export async function registerPasskey(
  api: Api,
  token: string,
  authenticator: VirtualAuthenticator,
  options: { name?: string; origin?: string; transports?: string[] } = {},
): Promise<Reply> {
  const origin = options.origin ?? ORIGIN
  const begin = await api.post('/api/auth/passkeys/register/options', {
    token,
    headers: { origin },
    json: { name: options.name ?? 'Passkey' },
  })
  expect(begin.status).toBe(200)
  const credential = authenticator.createCredential(begin.json.options, origin, { transports: options.transports })
  return api.post('/api/auth/passkeys/register/verify', {
    token,
    headers: { origin },
    json: { challenge_id: begin.json.challenge_id, name: options.name ?? 'Passkey', credential },
  })
}

/** Passwordless sign-in with a passkey; `email` binds the challenge to a user. */
export async function passkeySignIn(
  api: Api,
  authenticator: VirtualAuthenticator,
  options: { email?: string; origin?: string; counter?: number } = {},
): Promise<Reply> {
  const origin = options.origin ?? ORIGIN
  const ip = freshIp()
  const begin = await api.post('/api/auth/passkeys/authenticate/options', {
    ip,
    headers: { origin },
    json: options.email ? { email: options.email } : {},
  })
  expect(begin.status).toBe(200)
  const assertion = authenticator.getAssertion(begin.json.options, origin, { counter: options.counter })
  const reply = await api.post('/api/auth/passkeys/authenticate/verify', {
    ip,
    headers: { origin },
    json: { challenge_id: begin.json.challenge_id, credential: assertion },
  })
  trackSecret(reply.json?.access_token)
  return reply
}

/** Password login of a user who has 2FA on: the `temp_token` reply. */
export async function loginForTempToken(api: Api, email: string, password: string): Promise<Reply> {
  const reply = await login(api, email, password)
  expect(reply.status).toBe(200)
  expect(reply.json.requires_2fa).toBe(true)
  return reply
}

export interface SecondFactorResult {
  options: Reply
  verify: Reply | null
}

/** The passkey second-factor ceremony for a pending `temp_token`. */
export async function passkeySecondFactor(
  api: Api,
  tempToken: string,
  authenticator: VirtualAuthenticator,
  options: { origin?: string; counter?: number } = {},
): Promise<SecondFactorResult> {
  const origin = options.origin ?? ORIGIN
  const ip = freshIp()
  const begin = await api.post('/api/auth/passkeys/2fa/options', {
    ip,
    headers: { origin },
    json: { temp_token: tempToken },
  })
  if (begin.status !== 200) return { options: begin, verify: null }
  const assertion = authenticator.getAssertion(begin.json.options, origin, { counter: options.counter })
  const verify = await api.post('/api/auth/passkeys/2fa/verify', {
    ip,
    headers: { origin },
    json: { temp_token: tempToken, challenge_id: begin.json.challenge_id, credential: assertion },
  })
  trackSecret(verify.json?.access_token)
  return { options: begin, verify }
}

/**
 * A raw HTTP/1.0 request, which carries no Host header: `fetch` always adds one, and the
 * origin-missing case of the WebAuthn relying-party resolution needs the request without it.
 */
export async function rawRequestWithoutHost(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  json: unknown,
): Promise<{ status: number; json: any }> {
  const { connect } = await import('node:net')
  const url = new URL(baseUrl)
  const body = JSON.stringify(json)
  const lines = [
    `POST ${path} HTTP/1.0`,
    ...Object.entries({ ...headers, 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }).map(
      ([k, v]) => `${k}: ${v}`,
    ),
    '',
    body,
  ]
  const raw = await new Promise<string>((resolve, reject) => {
    const socket = connect(Number(url.port), url.hostname, () => socket.write(lines.join('\r\n')))
    let data = ''
    socket.on('data', (chunk) => (data += chunk.toString()))
    socket.on('end', () => resolve(data))
    socket.on('error', reject)
  })
  const status = Number(/^HTTP\/1\.[01] (\d+)/.exec(raw)?.[1])
  const payload = raw.split('\r\n\r\n').slice(1).join('\r\n\r\n')
  let parsed: any
  try {
    parsed = JSON.parse(payload)
  } catch {
    parsed = undefined
  }
  return { status, json: parsed }
}

/**
 * The whole authorization-code round trip against a stack configured for `idp`: the login
 * redirect, the provider approving a code with `grant`, and the callback. Returns the callback reply.
 */
export async function oidcSignIn(api: Api, idp: import('./idp').FakeIdp, grant: import('./idp').Grant): Promise<Reply> {
  const begin = await api.get('/api/auth/oidc/login')
  expect(begin.status).toBe(307)
  const location = new URL(begin.headers.get('location') as string)
  const state = location.searchParams.get('state') as string
  const stored = JSON.parse((await (await import('./redis')).redis().get(`oidc_state:${state}`)) as string)
  const code = `code-${Math.random().toString(36).slice(2)}`
  idp.grant(code, stored.nonce, location.searchParams.get('code_challenge') as string, grant)
  const reply = await api.get(`/api/auth/oidc/callback?code=${code}&state=${state}`)
  const token = tokenFromFragment(reply)
  if (token) trackSecret(token)
  return reply
}

/** The application token a successful callback puts in the redirect fragment. */
export function tokenFromFragment(reply: Reply): string | null {
  const location = reply.headers.get('location')
  if (!location) return null
  return new URLSearchParams(new URL(location).hash.slice(1)).get('access_token')
}

export async function createWorkspace(
  api: Api,
  token: string,
  body: { name?: string; self_membership?: boolean; locale?: string; icon?: string; color?: string } = {},
): Promise<Reply> {
  return api.post('/api/workspaces', { token, json: { name: 'Shared', ...body } })
}

export async function inviteMember(
  api: Api,
  token: string,
  workspaceId: string,
  body: { email: string; role?: string; password?: string },
): Promise<Reply> {
  return api.post(`/api/workspaces/${workspaceId}/members`, { token, json: body })
}

export async function uploadFile(
  api: Api,
  token: string,
  workspaceId: string | null,
  file: { name?: string; content?: string; type?: string } = {},
): Promise<Reply> {
  const form = new FormData()
  form.append(
    'file',
    new Blob([file.content ?? '%PDF-1.4 synthetic'], { type: file.type ?? 'application/pdf' }),
    file.name ?? 'notes.pdf',
  )
  return api.post('/api/files', {
    token,
    body: form,
    headers: workspaceId ? { 'x-workspace-id': workspaceId } : {},
  })
}
