export type ParsedServerUrl =
  | { ok: true; url: string; insecure: boolean }
  | { ok: false; reason: 'invalid-url' }

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * Turns what the user typed into the URL the app stores. Only http(s) with an
 * explicit scheme is accepted; plain http to a host that is not this machine
 * is flagged so the caller can ask for a second confirmation.
 */
export function parseServerUrl(input: string): ParsedServerUrl {
  const trimmed = input.trim()
  if (!/^https?:\/\//i.test(trimmed)) return { ok: false, reason: 'invalid-url' }
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return { ok: false, reason: 'invalid-url' }
  }
  if (!parsed.hostname) return { ok: false, reason: 'invalid-url' }
  const url = parsed.origin + parsed.pathname.replace(/\/+$/, '')
  return { ok: true, url, insecure: parsed.protocol === 'http:' && !LOCAL_HOSTS.has(parsed.hostname) }
}
