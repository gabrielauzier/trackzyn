import type { AgendaSession, ProjectedOccurrence, ScheduledTask } from '@/types'

const MINUTE_MS = 60_000
const DAY_MS = 24 * 60 * MINUTE_MS
export const DAY_MINUTES = 24 * 60

/** The part of a session that falls on one day of the grid, in minutes since that day's local midnight. */
export interface Piece {
  session: AgendaSession
  /** YYYY-MM-DD in the workspace timezone. */
  day: string
  /** Minutes since local midnight, 0..1440. */
  start: number
  end: number
  /** The session is still open, so this piece grows up to now (AGENDA-05). */
  running: boolean
  /** Length of this piece. */
  seconds: number
  /** The sessions a joined block stands for, in start order; absent on a common block (MERGE-11). */
  members?: AgendaSession[]
}

export type LaidOutPiece = Piece & { lane: number; lanes: number }

/** What a scheduled block stands for: a pending task with a time, or a future occurrence of a series (US-5, US-11). */
export type ScheduledEntry = { kind: 'task'; task: ScheduledTask } | { kind: 'projection'; occurrence: ProjectedOccurrence }

/** The part of a scheduled block that falls on one day of the grid, in minutes since that day's midnight. */
export interface ScheduledPiece {
  scheduled: ScheduledEntry
  day: string
  start: number
  end: number
  /** The whole block: its start, `HH:MM`, and its length in minutes, which may run past midnight. */
  time: string
  minutes: number
}

export type LaidOutScheduled = ScheduledPiece & { lane: number; lanes: number }

/** The length of a scheduled block: the estimate of the task, or 1h without one (D7, D23). */
export const scheduledMinutes = (estimate: number | null) => estimate ?? 60

/** One formatter per timezone: building an `Intl.DateTimeFormat` costs more than formatting with it. */
const formatters = new Map<string, Intl.DateTimeFormat>()
function formatterOf(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function offsetAt(instant: number, timeZone: string): number {
  const parts = formatterOf(timeZone).formatToParts(new Date(instant))
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  const asUtc = Date.UTC(part('year'), part('month') - 1, part('day'), part('hour'), part('minute'), part('second'))
  return asUtc - Math.floor(instant / 1000) * 1000
}

/** The instant of `minute` minutes after the local midnight of `day` in `timeZone`. */
export function zonedInstant(day: string, minute: number, timeZone: string): Date {
  const wall = Date.parse(`${day}T00:00:00Z`) + minute * MINUTE_MS
  // Two passes settle the offset on the far side of a daylight-saving change.
  let instant = wall - offsetAt(wall, timeZone)
  instant = wall - offsetAt(instant, timeZone)
  return new Date(instant)
}

/** YYYY-MM-DD of `instant` in `timeZone`. */
export function dayOf(instant: Date, timeZone: string): string {
  return new Date(instant.getTime() + offsetAt(instant.getTime(), timeZone)).toISOString().slice(0, 10)
}

/** Minutes since the local midnight of its own day, for `instant` in `timeZone`. */
export function minuteOf(instant: Date, timeZone: string): number {
  return Math.floor((instant.getTime() - zonedInstant(dayOf(instant, timeZone), 0, timeZone).getTime()) / MINUTE_MS)
}

/** `day` moved by `days` whole days. */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/** The Monday of the week (Monday to Sunday) that holds `day`. */
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay()
  return addDays(day, -((weekday + 6) % 7))
}

/** The seven days, Monday to Sunday, of the week that starts on `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index))
}

/**
 * Each session cut at local midnight into one piece per day of `days` it touches (AGENDA-07); an open
 * session ends at `now` (AGENDA-05). Pieces of a day come sorted by start.
 */
export function dayPieces(sessions: AgendaSession[], days: string[], timeZone: string, now: Date): Map<string, Piece[]> {
  const pieces = new Map<string, Piece[]>(days.map((day) => [day, []]))
  // The bounds of each day once, not once per session: a drag lays the week out again on every step.
  const bounds = days.map((day) => ({ day, dayStart: zonedInstant(day, 0, timeZone).getTime(), dayEnd: zonedInstant(addDays(day, 1), 0, timeZone).getTime() }))
  for (const session of sessions) {
    const running = session.ended_at === null
    const startMs = Date.parse(session.started_at)
    const endMs = running ? now.getTime() : Date.parse(session.ended_at!)
    for (const { day, dayStart, dayEnd } of bounds) {
      const from = Math.max(startMs, dayStart)
      const to = Math.min(endMs, dayEnd)
      if (to <= from) continue
      pieces.get(day)!.push({
        session,
        day,
        start: Math.min(DAY_MINUTES, (from - dayStart) / MINUTE_MS),
        end: Math.min(DAY_MINUTES, (to - dayStart) / MINUTE_MS),
        running: running && to === endMs,
        seconds: Math.floor((to - from) / 1000),
      })
    }
  }
  for (const list of pieces.values()) list.sort((a, b) => a.start - b.start || a.end - b.end)
  return pieces
}

/**
 * The scheduled blocks cut at midnight into one piece per day of `days` they touch, as sessions are (AGENDA-07):
 * each from its wall-clock time in the workspace timezone, for its estimate or 1h (D23). Pieces of a day come
 * sorted by start.
 */
export function scheduledPieces(timed: ScheduledTask[], projected: ProjectedOccurrence[], days: string[]): Map<string, ScheduledPiece[]> {
  const pieces = new Map<string, ScheduledPiece[]>(days.map((day) => [day, []]))
  const entries: { scheduled: ScheduledEntry; day: string; time: string; minutes: number }[] = [
    ...timed
      .filter((task) => task.scheduled_time !== null)
      .map((task) => ({
        scheduled: { kind: 'task' as const, task },
        day: task.scheduled_on,
        time: task.scheduled_time!,
        minutes: scheduledMinutes(task.estimate_minutes),
      })),
    ...projected.map((occurrence) => ({
      scheduled: { kind: 'projection' as const, occurrence },
      day: occurrence.on,
      time: occurrence.time,
      minutes: scheduledMinutes(occurrence.estimate_minutes),
    })),
  ]
  for (const entry of entries) {
    const [hours, mins] = entry.time.split(':').map(Number)
    const start = hours! * 60 + mins!
    const end = start + entry.minutes
    // The days the block reaches, from its own: past midnight it goes on the next morning.
    for (let offset = 0; offset * DAY_MINUTES < end; offset += 1) {
      const day = addDays(entry.day, offset)
      const from = Math.max(start - offset * DAY_MINUTES, 0)
      const to = Math.min(end - offset * DAY_MINUTES, DAY_MINUTES)
      pieces.get(day)?.push({ ...entry, day, start: from, end: to })
    }
  }
  for (const list of pieces.values()) list.sort((a, b) => a.start - b.start || a.end - b.end)
  return pieces
}

/**
 * Side-by-side lanes for the pieces of one day (AGENDA-06): pieces that overlap, directly or through
 * another piece, share the column width; each takes the first lane free at its start. Sessions and
 * scheduled blocks share the lanes (US-5).
 */
export function assignLanes<T extends { start: number; end: number }>(pieces: T[]): (T & { lane: number; lanes: number })[] {
  type Laid = T & { lane: number; lanes: number }
  const sorted = [...pieces].sort((a, b) => a.start - b.start || a.end - b.end)
  const result: Laid[] = []
  let group: Laid[] = []
  let laneEnds: number[] = []
  let groupEnd = -Infinity
  const close = () => {
    for (const piece of group) piece.lanes = laneEnds.length
    result.push(...group)
    group = []
    laneEnds = []
  }
  for (const piece of sorted) {
    if (piece.start >= groupEnd) close()
    let lane = laneEnds.findIndex((end) => end <= piece.start)
    if (lane === -1) lane = laneEnds.push(piece.end) - 1
    else laneEnds[lane] = piece.end
    group.push({ ...piece, lane, lanes: 0 })
    groupEnd = Math.max(groupEnd, piece.end)
  }
  close()
  return result
}

/** Seconds of the task sessions of a day; breaks do not count (AGENDA-01). */
export function dayTotal(pieces: Piece[]): number {
  return pieces.reduce((sum, piece) => (piece.session.kind === 'task' ? sum + piece.seconds : sum), 0)
}

/** The latest minute a session may end on `day`: the whole of a past day, up to now today, nothing on a later day (AGENDA-23). */
export function dayLimit(day: string, now: Date, timeZone: string): number {
  const today = dayOf(now, timeZone)
  if (day < today) return DAY_MINUTES
  if (day > today) return 0
  return minuteOf(now, timeZone)
}

/**
 * The times `Nova sessão` opens with (AGENDA-15): today, ending now rounded down to 5 min and starting at
 * the full hour before that end.
 */
export function newSessionTimes(now: Date, timeZone: string): { day: string; start: number; end: number } {
  const end = Math.floor(minuteOf(now, timeZone) / 5) * 5
  return { day: dayOf(now, timeZone), start: Math.max(0, Math.ceil(end / 60) * 60 - 60), end }
}

/**
 * The first session of `sessions`, other than `ownId`, that shares time with `start`–`end`; an open session runs to
 * `now` (AGENDA-19, ADJ-07).
 */
export function findOverlap(sessions: AgendaSession[], start: Date, end: Date, now: Date, ownId?: string): AgendaSession | undefined {
  return sessions.find((session) => {
    if (session.id === ownId) return false
    const sessionEnd = session.ended_at === null ? now.getTime() : Date.parse(session.ended_at)
    return Date.parse(session.started_at) < end.getTime() && sessionEnd > start.getTime()
  })
}
