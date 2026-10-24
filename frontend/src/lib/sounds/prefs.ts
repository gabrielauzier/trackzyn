import type { SoundKind } from '@/lib/sounds/synth'

const STORAGE_KEY = 'trackzyn.sounds'

type Switches = Partial<Record<SoundKind, boolean>>

function read(): Switches {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    return parsed !== null && typeof parsed === 'object' ? (parsed as Switches) : {}
  } catch {
    return {}
  }
}

/** Whether this sound plays on this device (SOUND-06). Every sound is on until turned off. */
export function isEnabled(kind: SoundKind): boolean {
  return read()[kind] !== false
}

/** Turns one sound on or off on this device, kept in localStorage across reloads (SOUND-06). */
export function setEnabled(kind: SoundKind, on: boolean): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(), [kind]: on }))
}
