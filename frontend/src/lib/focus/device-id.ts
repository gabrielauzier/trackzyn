import { uuid } from '@/lib/focus/uuid'

const STORAGE_KEY = 'trackzyn.device'

/**
 * The id of this device (SYNC-02): a UUID generated once and kept in localStorage, so every window of
 * the same app shares it and another browser or computer is a different device.
 */
export function deviceId(): string {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored
  const id = uuid()
  localStorage.setItem(STORAGE_KEY, id)
  return id
}
