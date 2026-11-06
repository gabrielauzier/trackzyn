/** A day of the week by its place in the agenda week: 0 is Monday, 6 is Sunday (AD-004). */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const ALL_DAYS: WeekDay[] = [0, 1, 2, 3, 4, 5, 6]
/** The `Seg – Sex` shortcut (DAYS-11). */
export const WORK_DAYS: WeekDay[] = [0, 1, 2, 3, 4]

/** Where this device remembers the week days the agenda shows. */
export const DAYS_STORAGE_KEY = 'agenda.days'

const isWeekDay = (value: unknown): value is WeekDay => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 6

/** The days in week order, each once. */
const inOrder = (days: WeekDay[]): WeekDay[] => ALL_DAYS.filter((day) => days.includes(day))

/**
 * The week days this device last chose to show (DAYS-15): the seven when nothing valid is stored, the list is empty
 * or storage is off.
 */
export function readShownDays(): WeekDay[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(DAYS_STORAGE_KEY) ?? 'null')
    if (!Array.isArray(stored) || stored.length === 0 || !stored.every(isWeekDay)) return ALL_DAYS
    return inOrder(stored)
  } catch {
    return ALL_DAYS
  }
}

/** Remembers `days` on this device; without storage, the choice only lasts the visit. */
export function saveShownDays(days: WeekDay[]): void {
  try {
    localStorage.setItem(DAYS_STORAGE_KEY, JSON.stringify(inOrder(days)))
  } catch {
    // Storage is off (private window, blocked site data): nothing to remember.
  }
}

/** `days` with `day` checked or unchecked, in week order; the last shown day stays (DAYS-13). */
export function toggleDay(days: WeekDay[], day: WeekDay): WeekDay[] {
  if (!days.includes(day)) return inOrder([...days, day])
  return days.length === 1 ? days : days.filter((shown) => shown !== day)
}
