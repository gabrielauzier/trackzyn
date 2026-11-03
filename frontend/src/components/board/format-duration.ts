/**
 * Short duration for task cards and column totals: `0min`, `27min`, `1h`,
 * `1h 27min` in Portuguese, `1hr 27min` in English. Seconds below a whole
 * minute are dropped, so time spent never reads as more than it was.
 */
export function formatDuration(seconds: number, locale: string): string {
  const totalMinutes = Math.floor(seconds / 60)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes}min`
  const hourLabel = `${hours}${locale.startsWith('pt') ? 'h' : 'hr'}`
  return minutes === 0 ? hourLabel : `${hourLabel} ${minutes}min`
}
