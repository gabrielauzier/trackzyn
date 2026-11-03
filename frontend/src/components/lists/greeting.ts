export type DayPeriod = 'dawn' | 'morning' | 'afternoon' | 'night'

/**
 * Period of the day for the home greeting: 00:00–04:59 dawn, 05:00–11:59
 * morning, 12:00–17:59 afternoon, 18:00–23:59 night.
 */
export function greetingFor(hour: number): DayPeriod {
  if (hour < 5) return 'dawn'
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'night'
}

/** Hour (0–23) of `at` on the wall clock of `timeZone`. */
export function hourIn(timeZone: string, at: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', hourCycle: 'h23' })
    .formatToParts(at)
    .find((part) => part.type === 'hour')?.value
  return Number(hour) % 24
}
