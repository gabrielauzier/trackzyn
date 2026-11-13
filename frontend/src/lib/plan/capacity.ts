import { scheduledMinutes } from '@/lib/agenda/layout'
import { measure, type Interval } from '@/lib/time/intervals'
import type { HoursCountMode, Workday } from '@/types'
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
 * timed task with a block counts only by its block (PLAN-D7). In net hours shared minutes count once, in the first of
 * task blocks, timed tasks and breaks that covers them (HOURS-27 to HOURS-29).
 */
export function capacity(blocks: DraftBlock[], fixedTimed: FixedTimed[], workday: Workday, mode: HoursCountMode = 'gross'): Capacity {
  const from = minuteOfClock(workday.start)
  const to = minuteOfClock(workday.end)
  const withBlock = new Set(blocks.flatMap((block) => (block.kind === 'task' ? [block.task.id] : [])))
  const tasks: Interval[] = blocks.filter((block) => block.kind === 'task').map((block) => [block.start, block.start + block.minutes])
  const pauses: Interval[] = blocks.filter((block) => block.kind === 'break').map((block) => [block.start, block.start + block.minutes])
  const timed: Interval[] = fixedTimed
    .filter((task) => !withBlock.has(task.id))
    .map((task) => {
      const start = minuteOfClock(task.scheduled_time)
      return [start, start + scheduledMinutes(task.estimate_minutes)]
    })
  let planned: number
  let breaks: number
  let scheduled: number
  if (mode === 'net') {
    planned = measure(tasks)
    scheduled = measure(timed, { within: [from, to], exclude: tasks })
    breaks = measure(pauses, { within: [from, to], exclude: [...tasks, ...timed] })
  } else {
    planned = tasks.reduce((sum, [start, end]) => sum + end - start, 0)
    breaks = pauses.reduce((sum, [start, end]) => sum + inside(start, end - start, from, to), 0)
    scheduled = timed.reduce((sum, [start, end]) => sum + inside(start, end - start, from, to), 0)
  }
  const free = to - from - breaks - scheduled
  return { planned, breaks, scheduled, free, over: Math.max(0, planned - free) }
}
