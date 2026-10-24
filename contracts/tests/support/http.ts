import { inject } from 'vitest'
import { trackSecret } from './secrets'

export interface Reply<T = any> {
  status: number
  headers: Headers
  text: string
  json: T
}

let ipCounter = 0
/** A fresh client address per caller, so rate limits never leak between cases. */
export function freshIp(): string {
  ipCounter += 1
  const n = (Date.now() % 60_000) * 1000 + ipCounter
  return `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`
}

export interface RequestOptions {
  json?: unknown
  form?: Record<string, string>
  body?: BodyInit
  token?: string
  headers?: Record<string, string>
  ip?: string
  redirect?: RequestRedirect
}

export class Api {
  readonly ip: string
  constructor(
    readonly baseUrl: string,
    ip?: string,
  ) {
    this.ip = ip ?? freshIp()
  }

  withIp(ip: string): Api {
    return new Api(this.baseUrl, ip)
  }

  async request<T = any>(method: string, path: string, options: RequestOptions = {}): Promise<Reply<T>> {
    const headers: Record<string, string> = { 'x-forwarded-for': options.ip ?? this.ip, ...options.headers }
    let body: BodyInit | undefined = options.body
    if (options.json !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(options.json)
    } else if (options.form) {
      headers['content-type'] = 'application/x-www-form-urlencoded'
      body = new URLSearchParams(options.form).toString()
    }
    if (options.token) headers.authorization = `Bearer ${options.token}`
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body,
      redirect: options.redirect ?? 'manual',
    })
    const text = await response.text()
    let json: any
    try {
      json = text ? JSON.parse(text) : undefined
    } catch {
      json = undefined
    }
    return { status: response.status, headers: response.headers, text, json }
  }

  get = <T = any>(path: string, options?: RequestOptions) => this.request<T>('GET', path, options)
  post = <T = any>(path: string, options?: RequestOptions) => this.request<T>('POST', path, options)
  patch = <T = any>(path: string, options?: RequestOptions) => this.request<T>('PATCH', path, options)
  delete = <T = any>(path: string, options?: RequestOptions) => this.request<T>('DELETE', path, options)
}

export const subject = () => new Api(inject('apiUrl'))
export const peer = () => {
  const url = inject('peerApiUrl')
  if (!url) throw new Error('the peer stack is not running; cross-stack cases need both stacks')
  return new Api(url)
}

/** Both stacks run in every contract run: cases about one named stack reach it from either subject. */
export function stackApi(name: 'python' | 'node'): Api {
  return inject('stack') === name ? subject() : peer()
}

let userCounter = 0
export function uniqueEmail(label = 'user'): string {
  userCounter += 1
  return `${label}-${Date.now().toString(36)}-${userCounter}@example.com`
}

export const PASSWORD = 'contract-pass-123'

export async function login(api: Api, email: string, password: string): Promise<Reply> {
  const reply = await api.post('/api/auth/login', { form: { username: email, password } })
  trackSecret(password)
  trackSecret(reply.json?.access_token)
  trackSecret(reply.json?.temp_token)
  return reply
}

/** Registers through the public endpoint and returns the user with a bearer token. */
export async function registerUser(
  api: Api,
  options: { email?: string; password?: string } = {},
): Promise<{ email: string; password: string; id: string; token: string }> {
  const email = options.email ?? uniqueEmail()
  const password = options.password ?? PASSWORD
  trackSecret(password)
  const created = await api.post('/api/auth/register', { json: { email, password } })
  if (created.status !== 201) throw new Error(`register failed: ${created.status} ${created.text}`)
  const session = await login(api, email, password)
  if (session.status !== 200) throw new Error(`login failed: ${session.status} ${session.text}`)
  return { email, password, id: created.json.id, token: session.json.access_token }
}

export const ADMIN_PASSWORD = 'contract-admin-123'

/** Creates the instance administrator through the setup endpoint (users must be empty). */
export async function bootstrapAdmin(api: Api): Promise<{ email: string; password: string; token: string }> {
  const email = uniqueEmail('admin')
  trackSecret(ADMIN_PASSWORD)
  const reply = await api.post('/api/setup/create-admin', { json: { email, password: ADMIN_PASSWORD } })
  if (reply.status !== 200) throw new Error(`create-admin failed: ${reply.status} ${reply.text}`)
  trackSecret(reply.json.access_token)
  return { email, password: ADMIN_PASSWORD, token: reply.json.access_token }
}
