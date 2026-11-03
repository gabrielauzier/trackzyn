import { todayInTimezone } from '@/lib/date-utils'

export type ProductiveKind = 'hour' | 'weekday' | 'month'

const DAY_MS = 24 * 60 * 60 * 1000

/** The default report period: from the current Monday to today, in the workspace timezone (REPORT-01). */
export function defaultRange(timezone: string | null | undefined, now = new Date()): { from: string; to: string } {
  const to = todayInTimezone(timezone, now)
  const today = new Date(`${to}T00:00:00Z`)
  const sinceMonday = (today.getUTCDay() + 6) % 7
  const from = new Date(today.getTime() - sinceMonday * DAY_MS).toISOString().slice(0, 10)
  return { from, to }
}

function hourLabel(hour: number, locale: string): string {
  if (locale.startsWith('pt')) return `${hour}–${hour + 1}h`
  const twelve = (h: number) => ({ h: h % 12 === 0 ? 12 : h % 12, half: h % 24 < 12 ? 'AM' : 'PM' })
  const start = twelve(hour)
  const end = twelve(hour + 1)
  return start.half === end.half ? `${start.h}–${end.h} ${end.half}` : `${start.h} ${start.half}–${end.h} ${end.half}`
}

function weekdayLabel(isoWeekday: number, locale: string): string {
  // 2024-01-01 is a Monday, so ISO day n falls on 2023-12-31 + n.
  const day = new Date(Date.UTC(2023, 11, 31 + isoWeekday))
  const name = new Intl.DateTimeFormat(locale, { weekday: 'long', timeZone: 'UTC' }).format(day)
  return name.replace(/-feira$/, '')
}

function monthLabel(month: string, locale: string): string {
  const [year, index] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year!, index! - 1, 1)),
  )
}

/** Every tied most productive value in one phrase: `18–19h`, `Segunda e quarta`, `out. de 2026`; `—` when empty. */
export function formatProductive(values: (number | string)[], kind: ProductiveKind, locale: string): string {
  if (values.length === 0) return '—'
  const labels = values.map((value) =>
    kind === 'hour'
      ? hourLabel(Number(value), locale)
      : kind === 'weekday'
        ? weekdayLabel(Number(value), locale)
        : monthLabel(String(value), locale),
  )
  const phrase = new Intl.ListFormat(locale, { type: 'conjunction' }).format(labels)
  return kind === 'weekday' ? phrase.charAt(0).toUpperCase() + phrase.slice(1) : phrase
}
