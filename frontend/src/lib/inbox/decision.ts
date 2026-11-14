import { addDays, weekdayOf } from '@/lib/schedule'
import type { TaskColumn } from '@/types'

/**
 * The column a processed item goes to (PROC-03), the rule of `targetColumn` in
 * `backend-node/src/services/decision.ts`: no day → Backlog; today or a day already past → Today; another day
 * of this week, up to Sunday → This week; later → Backlog. A column chosen in `Vai para` wins (PROC-04).
 * Days are `YYYY-MM-DD` in the workspace's timezone (AD-004), so they compare as text.
 */
export function targetColumn(scheduledOn: string | null | undefined, today: string, chosen?: TaskColumn | null): TaskColumn {
  if (chosen) return chosen
  if (!scheduledOn) return 'backlog'
  if (scheduledOn <= today) return 'today'
  // The week runs Monday to Sunday.
  const weekEnd = addDays(today, 7 - weekdayOf(today))
  return scheduledOn <= weekEnd ? 'this_week' : 'backlog'
}

/**
 * A line typed in the new task field of a group (GRP-03), the rule of `parseTaskLine` in
 * `backend-node/src/services/decision.ts`: an `H:MM` or `HH:MM` at the end, from 00:01 to 24:00, is the
 * estimate and the rest the title; anything else is all title.
 */
export function parseTaskLine(text: string): { title: string; estimate_minutes: number | null } {
  const trimmed = text.trim()
  const match = /^(.*\S)\s+(\d{1,2}):([0-5]\d)$/.exec(trimmed)
  if (match) {
    const minutes = Number(match[2]) * 60 + Number(match[3])
    if (minutes >= 1 && minutes <= 1440) return { title: match[1]!, estimate_minutes: minutes }
  }
  return { title: trimmed, estimate_minutes: null }
}
