import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

export const APP_SCHEME = 'app'
export const APP_HOST = 'trackzyn'
export const APP_ORIGIN = `${APP_SCHEME}://${APP_HOST}`

interface Deps {
  distDir: string
  getServerUrl: () => string | null
  /** Headers only the main process may set on proxied requests (the local backend's session token). */
  getExtraHeaders?: () => Record<string, string>
  /** True while an export runs: writes are refused so the data cannot change under it. */
  isWriteBlocked?: () => boolean
  fetchFn: typeof fetch
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
}

// Headers the browser derives from the app:// context. None of them is
// meaningful to the real server, and `origin` would require CORS there.
const DROPPED_REQUEST_HEADERS = ['origin', 'referer', 'host', 'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-user']

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

function withCsp(response: Response): Response {
  response.headers.set('content-security-policy', CONTENT_SECURITY_POLICY)
  return response
}

const notFound = () => withCsp(new Response('Not found', { status: 404 }))

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile()
  } catch {
    return false
  }
}

async function serveFile(file: string): Promise<Response> {
  const body = await readFile(file)
  const type = CONTENT_TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream'
  return withCsp(new Response(body, { status: 200, headers: { 'content-type': type } }))
}

async function serveStatic(distDir: string, pathname: string): Promise<Response> {
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return notFound()
  }
  const root = path.resolve(distDir)
  const candidate = path.resolve(root, `.${decoded}`)
  if (candidate !== root && !candidate.startsWith(root + path.sep)) return notFound()
  if (await isFile(candidate)) return serveFile(candidate)
  // A missing asset is a 404; only extensionless routes fall back to the SPA.
  if (path.extname(decoded) !== '') return notFound()
  return serveFile(path.join(root, 'index.html'))
}

function proxyApi(deps: Deps, request: Request, url: URL): Promise<Response> | Response {
  if (deps.isWriteBlocked?.() && !['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    return withCsp(new Response(JSON.stringify({ detail: 'Export in progress' }), { status: 423, headers: { 'content-type': 'application/json' } }))
  }
  const serverUrl = deps.getServerUrl()
  if (!serverUrl) return withCsp(new Response('No server configured', { status: 503 }))
  const headers = new Headers(request.headers)
  for (const name of DROPPED_REQUEST_HEADERS) headers.delete(name)
  for (const [name, value] of Object.entries(deps.getExtraHeaders?.() ?? {})) headers.set(name, value)
  const init: RequestInit & { duplex?: 'half' } = { method: request.method, headers }
  if (request.method !== 'GET' && request.method !== 'HEAD' && request.body) {
    init.body = request.body
    init.duplex = 'half'
  }
  return deps.fetchFn(`${serverUrl}${url.pathname}${url.search}`, init)
}

/** Serves the frontend build and forwards `/api/*` to the configured server. */
export function createAppHandler(deps: Deps): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url)
    if (url.host !== APP_HOST) return notFound()
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return proxyApi(deps, request, url)
    try {
      return await serveStatic(deps.distDir, url.pathname)
    } catch {
      return withCsp(new Response('Internal error', { status: 500 }))
    }
  }
}
