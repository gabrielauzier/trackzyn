import type { Workday } from '@/types'
import { clockMinutes } from './clock'
import { SNAP_MINUTES } from './draft'

/** Time of the day already taken: a block of the draft, a session or a timed task, in minutes since midnight. */
export interface Occupied {
  start: number
  minutes: number
}

export interface FitResult<T> {
  /** Each task that fit, with its start, in the order given. */
  placed: { task: T; start: number }[]
  /** The tasks no free time of the workday could hold (PLAN-33). */
  left: T[]
}

/**
 * `Encaixar` (PLAN-32, PLAN-33): puts each task, in the order given, at the first free time of the workday where it
 * fits whole, without overlapping what is taken nor a task placed before it. A start lands on a quarter of an hour, the
 * step of the grid. The tasks that fit nowhere come back in `left`.
 */
export function fit<T extends { minutes: number }>(tasks: T[], occupied: Occupied[], workday: Workday): FitResult<T> {
  const from = clockMinutes(workday.start) ?? 0
  const to = clockMinutes(workday.end) ?? 0
  const taken = occupied.map(({ start, minutes }) => ({ start, end: start + minutes }))
  const placed: FitResult<T>['placed'] = []
  const left: T[] = []

  for (const task of tasks) {
    let start = from
    let found: number | null = null
    // Walk the taken time in start order: each gap before the next one that overlaps is a candidate.
    const ordered = [...taken].sort((a, b) => a.start - b.start)
    while (start + task.minutes <= to) {
      start = Math.ceil(start / SNAP_MINUTES) * SNAP_MINUTES
      if (start + task.minutes > to) break
      const clash = ordered.find((range) => range.start < start + task.minutes && range.end > start)
      if (!clash) {
        found = start
        break
      }
      start = clash.end
    }
    if (found === null) {
      left.push(task)
      continue
    }
    placed.push({ task, start: found })
    taken.push({ start: found, end: found + task.minutes })
  }
  return { placed, left }
}
