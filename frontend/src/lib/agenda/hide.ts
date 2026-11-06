import type { AgendaSession } from '@/types'

/**
 * Whether the agenda leaves `session` off the grid under the workspace minimum (HIDE-11 to HIDE-13, HIDE-16): a closed
 * session, task or break, whose whole length from start to end is below `minMinutes`. The open session and every
 * session while the minimum is off (null) are shown.
 */
export function isHiddenSession(session: AgendaSession, minMinutes: number | null): boolean {
  if (minMinutes === null || session.ended_at === null) return false
  return Date.parse(session.ended_at) - Date.parse(session.started_at) < minMinutes * 60_000
}
