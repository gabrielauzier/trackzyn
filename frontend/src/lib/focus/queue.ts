import { serverNow } from '@/lib/focus/clock'
import type { FocusAction } from '@/lib/focus/optimistic'
import { uuid } from '@/lib/focus/uuid'
import type { FocusState } from '@/types'

const STORAGE_KEY = 'trackzyn.focus.queue'
const MAX_AGE_MS = 24 * 60 * 60 * 1000

/** An action waiting for the server, with the id that makes resending it harmless (AD-002). */
export interface QueuedAction {
  action_id: string
  action: FocusAction
}

/** An action the server refused (SYNC-07): it waits for `Tentar de novo` or `Descartar`. */
export interface FocusConflict extends QueuedAction {
  status: number
  code: string | undefined
}

interface Stored {
  pending: QueuedAction[]
  conflicts: FocusConflict[]
}

// Read and written through on every call, so the queue survives a reload or closing the app.
function load(): Stored {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Stored
  } catch {
    // A corrupt entry is an empty queue.
  }
  return { pending: [], conflicts: [] }
}

function save(stored: Stored): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

/** Keeps the action on this device until the server answers it (SYNC-05). */
export function enqueue(action: FocusAction): QueuedAction {
  const entry = { action_id: uuid(), action }
  const stored = load()
  stored.pending.push(entry)
  save(stored)
  return entry
}

export const pending = (): QueuedAction[] => load().pending
export const conflicts = (): FocusConflict[] => load().conflicts

/**
 * `Tentar de novo`: the refused action goes back to the end of the queue as a new click at `nowMs`.
 * Resent with its old id and time, the server would answer the same refusal forever: it refuses a time
 * before its last change.
 */
export function retry(actionId: string, nowMs = serverNow()): void {
  const stored = load()
  const conflict = stored.conflicts.find((entry) => entry.action_id === actionId)
  if (!conflict) return
  stored.conflicts = stored.conflicts.filter((entry) => entry !== conflict)
  const action = { ...conflict.action, occurred_at: new Date(nowMs).toISOString() }
  stored.pending = [...stored.pending, { action_id: uuid(), action }]
  save(stored)
}

/** Whether `Tentar de novo` can succeed: a transition the focus no longer allows stays refused. */
export const canRetry = (conflict: FocusConflict): boolean => conflict.code !== 'invalid_transition'

/** `Descartar`: the refused action is dropped. */
export function discard(actionId: string): void {
  const stored = load()
  stored.conflicts = stored.conflicts.filter((entry) => entry.action_id !== actionId)
  save(stored)
}

export interface FlushResult {
  /** The server's answers, in the order the actions were sent. */
  states: FocusState[]
  /** Actions older than 24h, dropped without sending (SYNC-06). */
  expired: QueuedAction[]
  /** True when the server could not be reached; what was left stays queued. */
  offline: boolean
}

/** The HTTP status of a refused request, or null when no answer came back. */
function statusOf(error: unknown): number | null {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status
  return typeof status === 'number' ? status : null
}

/**
 * Sends the queued actions in order. An action older than 24h is dropped (SYNC-06); one the server
 * refuses becomes a conflict (SYNC-07); without an answer, or with a server error, it and the ones
 * after it stay queued for the next flush (SYNC-05).
 */
export async function flush(send: (entry: QueuedAction) => Promise<FocusState>, nowMs = serverNow()): Promise<FlushResult> {
  const result: FlushResult = { states: [], expired: [], offline: false }
  for (const entry of load().pending) {
    const remove = () => {
      const stored = load()
      stored.pending = stored.pending.filter((item) => item.action_id !== entry.action_id)
      return stored
    }
    if (nowMs - Date.parse(entry.action.occurred_at) > MAX_AGE_MS) {
      result.expired.push(entry)
      save(remove())
      continue
    }
    try {
      result.states.push(await send(entry))
      save(remove())
    } catch (error) {
      const status = statusOf(error)
      if (status === null || status >= 500) {
        result.offline = true
        break
      }
      const stored = remove()
      const code = (error as { response?: { data?: { code?: string } } }).response?.data?.code
      stored.conflicts.push({ ...entry, status, code })
      save(stored)
    }
  }
  return result
}
