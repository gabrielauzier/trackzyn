import type { InboxRefusal } from '@/types'

/** The status and body of a failed API call, or null for a failure with no answer (the network). */
export function failedResponse(error: unknown): { status: number; data: Record<string, unknown> } | null {
  if (!error || typeof error !== 'object' || !('response' in error)) return null
  const response = (error as { response?: { status?: unknown; data?: unknown } }).response
  if (!response || typeof response.status !== 'number') return null
  const data = response.data && typeof response.data === 'object' ? (response.data as Record<string, unknown>) : {}
  return { status: response.status, data }
}

/** Why a capture was refused (CAP-02, CAP-03): `text_empty`, `text_too_long`, or null for any other failure. */
export function captureRefusal(error: unknown): 'text_empty' | 'text_too_long' | null {
  const failed = failedResponse(error)
  if (failed?.status !== 422) return null
  const code = failed.data.code
  return code === 'text_empty' || code === 'text_too_long' ? code : null
}

/** The longest text an item keeps (CAP-03). */
export const MAX_CAPTURE_LENGTH = 500

/** Why a send was refused (QUICK-06, EDGE-01), read from a 409; null for any other failure. */
export function sendRefusal(error: unknown): InboxRefusal | null {
  const failed = failedResponse(error)
  if (failed?.status !== 409) return null
  const reason = failed.data.reason
  return reason === 'list_archived' || reason === 'list_read_only' || reason === 'already_processed' ? reason : null
}
