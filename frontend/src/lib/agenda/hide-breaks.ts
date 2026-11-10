/** Where this device remembers whether the agenda hides the breaks (ADJ-25). */
export const HIDE_BREAKS_STORAGE_KEY = 'agenda.hideBreaks'

/** Whether this device last chose to hide the breaks: false when nothing valid is stored or storage is off (ADJ-21, ADJ-25). */
export function readHideBreaks(): boolean {
  try {
    return localStorage.getItem(HIDE_BREAKS_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Remembers the choice on this device; without storage, it only lasts the visit. */
export function saveHideBreaks(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_BREAKS_STORAGE_KEY, String(hide))
  } catch {
    // Storage is off (private window, blocked site data): nothing to remember.
  }
}

/** Where this device remembers whether the agenda hides the scheduled and planned tasks. */
export const HIDE_SCHEDULED_STORAGE_KEY = 'agenda.hideScheduled'

/** Whether this device last chose to hide the scheduled and planned tasks: false when nothing valid is stored. */
export function readHideScheduled(): boolean {
  try {
    return localStorage.getItem(HIDE_SCHEDULED_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

/** Remembers the choice on this device; without storage, it only lasts the visit. */
export function saveHideScheduled(hide: boolean): void {
  try {
    localStorage.setItem(HIDE_SCHEDULED_STORAGE_KEY, String(hide))
  } catch {
    // Storage is off: nothing to remember.
  }
}
