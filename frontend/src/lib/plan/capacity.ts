import { scheduledMinutes } from '@/lib/agenda/layout'
import type { Workday } from '@/types'
import type { DraftBlock } from './draft'

/** A pending task scheduled with a time on the day of the plan (PLAN-D7). */
export interface FixedTimed {
  id: string
  /** `HH:MM`. */
  scheduled_time: string
  estimate_minutes: number | null
}

/** The minutes of the day, against the workday (PLAN-19, PLAN-20). */
export interface Capacity {
  /** The task blocks, wherever they are. */
  planned: number
  /** The breaks, inside the workday. */
  breaks: number
  /** The timed tasks without a block, inside the workday. */
  scheduled: number
  /** The workday less the breaks and the scheduled time. */
  free: number
  /** How much the planned time goes past the free time; 0 while it fits. */
  over: number
}

const minuteOfClock = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

/** The minutes of `start`..`start + minutes` inside `from`..`to`. */
const inside = (start: number, minutes: number, from: number, to: number) => Math.max(0, Math.min(start + minutes, to) - Math.max(start, from))

/**
 * Does the day fit (PLAN-19, PLAN-20)? The breaks and the timed tasks take the workday only where they fall in it; a
 * timed task with a block counts only by its block (PLAN-D7).
 */
export function capacity(blocks: DraftBlock[], fixedTimed: FixedTimed[], workday: Workday): Capacity {
  const from = minuteOfClock(workday.start)
  const to = minuteOfClock(workday.end)
  let planned = 0
  let breaks = 0
  const withBlock = new Set<string>()
  for (const block of blocks) {
    if (block.kind === 'task') {
      planned += block.minutes
      withBlock.add(block.task.id)
    } else {
      breaks += inside(block.start, block.minutes, from, to)
    }
  }
  const scheduled = fixedTimed
    .filter((task) => !withBlock.has(task.id))
    .reduce((sum, task) => sum + inside(minuteOfClock(task.scheduled_time), scheduledMinutes(task.estimate_minutes), from, to), 0)
  const free = to - from - breaks - scheduled
  return { planned, breaks, scheduled, free, over: Math.max(0, planned - free) }
}
