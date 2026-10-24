import { parseServerUrl } from '../shared/server-url'
import type { SetServerUrlResult } from '../shared/ipc'

export interface ServerStore {
  getServerUrl(): string | null
  setServerUrl(url: string): void
}

interface Deps {
  store: ServerStore
  fetchFn?: typeof fetch
  timeoutMs?: number
}

async function getJson(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<unknown> {
  const response = await fetchFn(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
  if (response.status !== 200) throw new Error(`${url} answered ${response.status}`)
  return response.json()
}

async function isLaunchkitServer(fetchFn: typeof fetch, url: string, timeoutMs: number): Promise<boolean> {
  try {
    const health = (await getJson(fetchFn, `${url}/api/health`, timeoutMs)) as { status?: unknown } | null
    if (health?.status !== 'healthy') return false
    const info = (await getJson(fetchFn, `${url}/api/info`, timeoutMs)) as { app_name?: unknown } | null
    return typeof info?.app_name === 'string'
  } catch {
    return false
  }
}

/**
 * Owns the rules for choosing a server: normalise, require http(s), ask for a
 * second confirmation on plain http to a remote host, validate by
 * `/api/health` and `/api/info`, and only then save.
 */
export function createServerConnection({ store, fetchFn = fetch, timeoutMs = 8000 }: Deps) {
  return {
    async connect(input: string, options: { allowInsecure?: boolean } = {}): Promise<SetServerUrlResult> {
      const parsed = parseServerUrl(input)
      if (!parsed.ok) return parsed
      if (parsed.insecure && !options.allowInsecure) return { ok: false, reason: 'insecure' }
      if (!(await isLaunchkitServer(fetchFn, parsed.url, timeoutMs))) return { ok: false, reason: 'unreachable' }
      store.setServerUrl(parsed.url)
      return { ok: true, url: parsed.url }
    },
  }
}
