import type { TaskColumn } from '@/types'

/** The color of a due chip: neutral, yellow from the day before, red once past, and always neutral in Concluídas. */
export type DueState = 'neutral' | 'soon' | 'late' | 'done'

/**
 * The state of the due day `dueOn` of a task in `column`, given `today` in the workspace's timezone (AD-004):
 * tomorrow or today → `soon` (DUE-03), before today → `late` (DUE-04), later → `neutral` (DUE-02), and `done`
 * in Concluídas whatever the day (DUE-05). Days are `YYYY-MM-DD`, so they compare as text.
 */
export function dueState(dueOn: string, column: TaskColumn, today: string): DueState {
  if (column === 'done') return 'done'
  if (dueOn < today) return 'late'
  return dueOn <= tomorrowOf(today) ? 'soon' : 'neutral'
}

/** The calendar day after `day`, both `YYYY-MM-DD`, counted in UTC so no timezone moves it. */
function tomorrowOf(day: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + 1)
  return date.toISOString().slice(0, 10)
}
