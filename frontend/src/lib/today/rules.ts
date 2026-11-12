/**
 * The per-minute counts of the Hoje dashboard. The server answers the day as raw data, in minutes of the day in the
 * workspace timezone; these pure functions run again on the client every minute, with no request.
 */

/** What grouping and sizing read of a task of `Pendente`. */
export interface PendingInput {
  estimate_minutes: number | null
  position: number
  /** The minute of `scheduled_time` when the task is scheduled for today. */
  scheduled_minute: number | null
  /** The start of the task's first block in today's plan. */
  plan_minute: number | null
  has_session_today: boolean
  /** Today minus the scheduled day, when that day is before today. */
  days_late: number | null
}

/** What the suggestion reads of a block of today's plan. */
export interface BlockInput {
  kind: 'task' | 'break'
  start_minute: number
  minutes: number
  done: boolean
}

/** The groups of `Pendente`, in the order a task is tried against them (HOJE-25). */
export type PendingGroupKey = 'late' | 'timed' | 'planned' | 'carried' | 'unplanned'

export interface PendingGroup<T extends PendingInput> {
  key: PendingGroupKey
  tasks: T[]
}

const GROUPS: readonly PendingGroupKey[] = ['late', 'timed', 'planned', 'carried', 'unplanned']

/** The start of the task today: its scheduled time, else the start of its first planned block. */
export const startToday = (task: PendingInput): number | null => task.scheduled_minute ?? task.plan_minute

function groupOf(task: PendingInput, nowMinute: number): PendingGroupKey {
  const start = startToday(task)
  if (start !== null && start < nowMinute && !task.has_session_today) return 'late'
  if (task.scheduled_minute !== null) return 'timed'
  if (task.plan_minute !== null) return 'planned'
  if (task.days_late !== null) return 'carried'
  return 'unplanned'
}

/**
 * Puts each task in the first group it fits, in the order of HOJE-25, and leaves the empty groups out. Inside a
 * group, by the start of today, then, without one, by the position in the column (HOJE-26).
 */
export function groupPending<T extends PendingInput>(tasks: T[], nowMinute: number): PendingGroup<T>[] {
  const byStart = (a: T, b: T) => {
    const startA = startToday(a)
    const startB = startToday(b)
    if (startA !== startB) {
      if (startA === null) return 1
      if (startB === null) return -1
      return startA - startB
    }
    return a.position - b.position
  }
  return GROUPS.map((key) => ({ key, tasks: tasks.filter((task) => groupOf(task, nowMinute) === key).sort(byStart) })).filter(
    (group) => group.tasks.length > 0,
  )
}

/** Whether the pending work fits what is left of the workday, in seconds (HOJE-29 to HOJE-32). */
export interface Capacity {
  /** The estimates of `Pendente` plus what is left of the focused task's estimate. */
  needSeconds: number
  /** From now to the end of the workday, zero after it. */
  leftSeconds: number
  overSeconds: number
  freeSeconds: number
  /** Tasks without an estimate, counted as 0. */
  withoutEstimate: number
}

/** `workdayEnd` and `nowMinute` are minutes of the day; `focusLeftSeconds` is what is left of the focused task. */
export function capacity(pending: PendingInput[], focusLeftSeconds: number, nowMinute: number, workdayEnd: number): Capacity {
  const needSeconds = pending.reduce((sum, task) => sum + (task.estimate_minutes ?? 0) * 60, 0) + Math.max(0, focusLeftSeconds)
  const leftSeconds = Math.max(0, workdayEnd - nowMinute) * 60
  return {
    needSeconds,
    leftSeconds,
    overSeconds: Math.max(0, needSeconds - leftSeconds),
    freeSeconds: Math.max(0, leftSeconds - needSeconds),
    withoutEstimate: pending.filter((task) => task.estimate_minutes === null).length,
  }
}

/** The block of a pending task that holds `nowMinute`; the one that started last when blocks overlap (HOJE-11). */
export function suggestedBlock<T extends BlockInput>(blocks: T[], nowMinute: number): T | null {
  let found: T | null = null
  for (const block of blocks) {
    if (block.kind !== 'task' || block.done) continue
    if (block.start_minute > nowMinute || nowMinute >= block.start_minute + block.minutes) continue
    if (found === null || block.start_minute > found.start_minute) found = block
  }
  return found
}
