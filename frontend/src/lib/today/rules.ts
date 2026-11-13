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

/** What adherence, switches and the timeline read of a session of today, in minutes of the day. */
export interface SessionInput {
  kind: 'task' | 'break'
  task_id: string | null
  start_minute: number
  end_minute: number
  /** An open session goes until now, whatever its last read said. */
  open: boolean
}

/**
 * The minutes of today's task blocks until now that a session of the same task covers, over the minutes of those
 * blocks until now, rounded; null when no task block has started yet (HOJE-52).
 */
export function adherence(
  blocks: (BlockInput & { task_id: string | null })[],
  sessions: SessionInput[],
  nowMinute: number,
): number | null {
  let plannedMinutes = 0
  let coveredMinutes = 0
  for (const block of blocks) {
    if (block.kind !== 'task') continue
    const from = block.start_minute
    const to = Math.min(block.start_minute + block.minutes, nowMinute)
    if (to <= from) continue
    plannedMinutes += to - from
    for (const session of sessions) {
      if (session.kind !== 'task' || session.task_id !== block.task_id) continue
      const end = session.open ? nowMinute : session.end_minute
      coveredMinutes += Math.max(0, Math.min(to, end) - Math.max(from, session.start_minute))
    }
  }
  return plannedMinutes === 0 ? null : Math.round((coveredMinutes / plannedMinutes) * 100)
}

/**
 * The seconds of today's sessions of one kind, summed from their instants and truncated once, as the reports count
 * them (HOJE-49). An open session goes on from its last read by the minutes of the day passed since.
 */
export function sessionSeconds(
  sessions: (SessionInput & { started_at: string; ended_at: string })[],
  kind: SessionInput['kind'],
  nowMinute: number,
): number {
  const ms = sessions
    .filter((session) => session.kind === kind)
    .reduce((sum, session) => {
      const since = session.open ? Math.max(0, nowMinute - session.end_minute) * 60_000 : 0
      return sum + Date.parse(session.ended_at) + since - Date.parse(session.started_at)
    }, 0)
  return Math.floor(ms / 1000)
}

/** The task sessions of today, in order of start, whose task differs from the task session before (HOJE-53). */
export function switches(sessions: SessionInput[]): number {
  const tasks = sessions
    .filter((session) => session.kind === 'task')
    .sort((a, b) => a.start_minute - b.start_minute)
    .map((session) => session.task_id)
  return tasks.filter((taskId, index) => index > 0 && taskId !== tasks[index - 1]).length
}

const minuteOfClock = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))

/**
 * The scale of `Plano × real` in minutes of the day, on full hours: from the full hour at or before the earliest of
 * the workday start, the first block and the first session, to the full hour at or after the latest of their ends
 * (HOJE-43).
 */
export function timelineRange(
  workday: { start: string; end: string },
  blocks: BlockInput[],
  sessions: SessionInput[],
): { from: number; to: number } {
  const starts = [minuteOfClock(workday.start), ...blocks.map((b) => b.start_minute), ...sessions.map((s) => s.start_minute)]
  const ends = [minuteOfClock(workday.end), ...blocks.map((b) => b.start_minute + b.minutes), ...sessions.map((s) => s.end_minute)]
  return { from: Math.floor(Math.min(...starts) / 60) * 60, to: Math.ceil(Math.max(...ends) / 60) * 60 }
}
