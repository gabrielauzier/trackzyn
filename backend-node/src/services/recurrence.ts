import type { SeriesFreq } from '../db/schema.ts'

/**
 * A recurrence rule of a task series (Recorrência). `weekdays` (1 = Monday to 7 = Sunday) only on `weekly`,
 * `monthDay` (1 to 31) only on `monthly`; `until` (`YYYY-MM-DD`) and `count` never together.
 */
export interface RecurrenceRule {
  freq: SeriesFreq
  interval: number
  weekdays: number[] | null
  monthDay: number | null
  until: string | null
  count: number | null
}

const DAY_MS = 86_400_000

/** Calendar dates (`YYYY-MM-DD`) as UTC midnights, so the arithmetic never meets a timezone. */
const toDate = (day: string) => new Date(`${day}T00:00:00Z`)
const toDay = (date: Date) => date.toISOString().slice(0, 10)
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS)
const daysBetween = (from: Date, to: Date) => Math.round((to.getTime() - from.getTime()) / DAY_MS)
/** 1 (Monday) to 7 (Sunday). */
const isoWeekday = (date: Date) => date.getUTCDay() || 7
const lastDayOfMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

/** The weekday of a calendar date (`YYYY-MM-DD`), 1 (Monday) to 7 (Sunday). */
export const weekdayOf = (day: string) => isoWeekday(toDate(day))

/** The days the rule falls on in the `period`-th period from the one of `anchor` (day, week from Monday, or month). */
function daysOfPeriod(rule: RecurrenceRule, anchor: Date, period: number): Date[] {
  if (rule.freq === 'daily') return [addDays(anchor, period)]
  if (rule.freq === 'weekly') {
    const monday = addDays(anchor, 7 * period - (isoWeekday(anchor) - 1))
    return [...(rule.weekdays ?? [])].sort((a, b) => a - b).map((weekday) => addDays(monday, weekday - 1))
  }
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth() + period
  // A month shorter than the rule's day falls on its last day.
  const day = Math.min(rule.monthDay ?? anchor.getUTCDate(), lastDayOfMonth(year, month))
  return [new Date(Date.UTC(year, month, day))]
}

/** How many periods (days, weeks or months) separate the period of `from` from the one of `to`. */
function periodsBetween(rule: RecurrenceRule, from: Date, to: Date): number {
  if (rule.freq === 'daily') return daysBetween(from, to)
  if (rule.freq === 'weekly') return Math.floor(daysBetween(addDays(from, -(isoWeekday(from) - 1)), to) / 7)
  return (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth())
}

/**
 * The first day of the rule after the occurrence's day `after` and after `today` (D17): missed days are
 * skipped and an occurrence completed early does not repeat its own day. The rule counts its periods from
 * `after`, every `interval` of them. Answers null when the series has no occurrence left: `createdCount`
 * reached `count`, or the day would pass `until`. `today` is the workspace's day (AD-004).
 */
export function nextOccurrence(rule: RecurrenceRule, after: string, today: string, createdCount: number): string | null {
  if (rule.count !== null && createdCount >= rule.count) return null
  const anchor = toDate(after)
  const floor = toDate(today > after ? today : after)
  // Start at the step of the rule that holds `floor`; its days at or before `floor` are passed over.
  let period = Math.floor(periodsBetween(rule, anchor, floor) / rule.interval) * rule.interval
  for (;;) {
    const found = daysOfPeriod(rule, anchor, period).find((day) => day > floor)
    if (found) {
      const day = toDay(found)
      return rule.until !== null && day > rule.until ? null : day
    }
    period += rule.interval
  }
}
