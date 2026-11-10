/** A stretch of time from `start` to `end`, in any unit (minutes of the day, milliseconds...). */
export type Interval = readonly [start: number, end: number]

/**
 * The intervals sorted and joined where they overlap or touch, so each instant appears once. Empty and
 * inverted intervals (`end <= start`) are left out.
 */
export function merge(intervals: readonly Interval[]): Interval[] {
  const sorted = intervals.filter(([start, end]) => end > start).sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1]
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

/**
 * The length of the union of `include`, cut to `within` and without what `exclude` covers: the time the
 * intervals take when shared time counts once (net hours, AD-010).
 */
export function measure(include: readonly Interval[], options: { within?: Interval; exclude?: readonly Interval[] } = {}): number {
  const [from, to] = options.within ?? [-Infinity, Infinity]
  const cut = merge(include.map(([start, end]) => [Math.max(start, from), Math.min(end, to)] as const))
  const out = merge(options.exclude ?? [])
  let total = 0
  for (const [start, end] of cut) {
    total += end - start
    for (const [outStart, outEnd] of out) total -= Math.max(0, Math.min(end, outEnd) - Math.max(start, outStart))
  }
  return total
}
