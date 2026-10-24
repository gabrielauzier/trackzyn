import { randomBytes } from 'node:crypto'
import type { KeyValueStore } from '../ports/key-value-store.ts'

export const TEMP_TOKEN_TTL_SECONDS = 300

/** `secrets.token_urlsafe(n)`: n random bytes, base64url without padding. */
export function tokenUrlsafe(bytes: number): string {
  return randomBytes(bytes).toString('base64url')
}

export interface TempTokenPayload {
  userId: string
  availableMethods: string[]
}

/** Stores the pending second factor of a login under `2fa_temp:<token>`, shared with the Python stack. */
export async function issueTempToken(store: KeyValueStore, userId: string, availableMethods: string[]): Promise<string> {
  const token = tokenUrlsafe(32)
  await store.set(`2fa_temp:${token}`, JSON.stringify({ user_id: userId, available_methods: availableMethods }), {
    ttlSeconds: TEMP_TOKEN_TTL_SECONDS,
  })
  return token
}

/**
 * Reads a stored payload. A value that is not JSON is a legacy token that kept only the user id,
 * which counts as a TOTP-only token; JSON that is not an object with a string `user_id` is invalid.
 */
export function parseTempTokenPayload(raw: string): { user_id: string; available_methods?: unknown } | null {
  let payload: unknown
  try {
    payload = JSON.parse(raw)
  } catch {
    return { user_id: raw, available_methods: ['totp'] }
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null
  const record = payload as Record<string, unknown>
  if (typeof record.user_id !== 'string') return null
  return { user_id: record.user_id, available_methods: record.available_methods }
}

/** The payload when it is valid and offers `method`, else null. */
export function payloadOffering(raw: string, method: string): { user_id: string } | null {
  const payload = parseTempTokenPayload(raw)
  const methods = payload?.available_methods ?? []
  if (!payload || !Array.isArray(methods) || !methods.includes(method)) return null
  return { user_id: payload.user_id }
}
