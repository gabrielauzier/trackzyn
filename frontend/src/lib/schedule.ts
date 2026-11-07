import { format } from 'date-fns'
import type { TFunction } from 'i18next'

import { resolveDateFnsLocale } from '@/lib/date-fns-locale'
import { todayInTimezone } from '@/lib/date-utils'
import type { RecurrenceRule, TaskColumn, TaskSchedule } from '@/types'

const DAY_MS = 86_400_000

/** A calendar day (`YYYY-MM-DD`) as a local midnight, for date-fns to format; it never meets a timezone. */
export const dayDate = (day: string) => {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year!, month! - 1, date!)
}

/** Whole days from `from` to `to`, both `YYYY-MM-DD`. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)

const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1)
const uncapitalize = (text: string) => text.charAt(0).toLocaleLowerCase() + text.slice(1)

/** `13 nov` (pt-BR) or `Nov 13` (en). */
export function shortDay(day: string, t: TFunction, language: string) {
  return format(dayDate(day), t('schedule.dayMonthFormat'), { locale: resolveDateFnsLocale(language) })
}

/** The calendar day `days` after `day`, both `YYYY-MM-DD`. */
export function addDays(day: string, days: number): string {
  const date = dayDate(day)
  date.setDate(date.getDate() + days)
  return format(date, 'yyyy-MM-dd')
}

/** The ISO weekday of a calendar day, 1 (Monday) to 7 (Sunday). */
export const weekdayOf = (day: string) => dayDate(day).getDay() || 7

/** The short weekday of an ISO weekday, 1 (Monday) to 7 (Sunday): `seg` (pt-BR) or `Mon` (en). */
export const shortWeekday = (weekday: number, t: TFunction) => t(`schedule.weekdayShort_${weekday}`)

/** `qua, 4 nov` (pt-BR) or `Wed, Nov 4` (en): the day of a tooltip. */
export function longDay(day: string, t: TFunction, language: string) {
  return t('schedule.weekdayDay', { weekday: shortWeekday(weekdayOf(day), t), day: shortDay(day, t, language) })
}

export interface ScheduleBadge {
  /** `Hoje`, `Amanhã`, `Qui`, `13 nov`, `Qui 14:00`, `14:00` or `Agendada` (US-3, D21). */
  label: string
  /** The scheduled day in full and, for a series, its rule (US-11). */
  tooltip: string
  /** Calendar for a day, clock for a time, check for a task the schedule brought to Today without a time. */
  icon: 'calendar' | 'clock' | 'check'
  /** The task is an occurrence of a series: the card adds the repeat icon. */
  repeats: boolean
}

/**
 * The text of the schedule badge of a card, in the workspace's timezone (US-3): `Hoje`, `Amanhã`, the weekday up to
 * 6 days ahead or `13 nov` after that, joined by the start time when there is one; on the day, and in Today for a
 * day that came from earlier, only the time, or `Agendada` without one (D21). No badge in Done (D5) or for a task that is not scheduled.
 */
export function scheduleBadge(
  task: TaskSchedule,
  column: TaskColumn,
  { now, timeZone, t, language }: { now: Date; timeZone: string | null | undefined; t: TFunction; language: string },
): ScheduleBadge | null {
  if (column === 'done' || task.scheduled_on === null) return null
  const day = task.scheduled_on
  const time = task.scheduled_time
  const today = todayInTimezone(timeZone, now)
  const ahead = daysBetween(today, day)

  const repeats = task.series !== null
  const rule = task.series ? `\n${repeatsLabel(task.series.rule, t, language)}` : ''
  const when = time === null ? longDay(day, t, language) : `${longDay(day, t, language)} · ${time}`

  // Brought to Today by its day (D21); a later day kept in Today shows that day.
  if (column === 'today' && time === null && ahead <= 0) {
    return { label: t('schedule.scheduled'), tooltip: t('schedule.scheduledFor', { day: longDay(day, t, language) }) + rule, icon: 'check', repeats }
  }
  let dayLabel: string
  if (ahead === 0) dayLabel = t('schedule.today')
  else if (ahead === 1) dayLabel = t('schedule.tomorrow')
  else if (ahead > 1 && ahead < 7) dayLabel = capitalize(shortWeekday(weekdayOf(day), t))
  else dayLabel = shortDay(day, t, language)

  if (time === null) return { label: dayLabel, tooltip: capitalize(when) + rule, icon: 'calendar', repeats }
  // On the day itself, and in Today for a day that came from earlier, the time says it all.
  const label = ahead === 0 || (column === 'today' && ahead < 0) ? time : `${dayLabel} ${time}`
  return { label, tooltip: capitalize(when) + rule, icon: 'clock', repeats }
}

const isWeekdays = (weekdays: number[]) => weekdays.length === 5 && [1, 2, 3, 4, 5].every((day) => weekdays.includes(day))

/**
 * The rule in words, as the picker and the custom editor show it (US-9): `Toda quinta`, `Todo dia`,
 * `Dias úteis (seg a sex)`, `Todo mês no dia 13`, or `A cada 2 semanas, ter e qui, 5 vezes` for anything else.
 */
export function recurrenceSummary(rule: RecurrenceRule, t: TFunction, language: string): string {
  const weekdays = [...(rule.weekdays ?? [])].sort((a, b) => a - b)
  const monthDay = rule.month_day ?? 1
  const lastDay = monthDay >= 29 ? t('schedule.orLastDay') : ''
  const days = new Intl.ListFormat(language, { type: 'conjunction' }).format(weekdays.map((day) => shortWeekday(day, t)))
  const parts: string[] = []

  if (rule.interval === 1 && rule.freq === 'daily') parts.push(t('schedule.everyDay'))
  else if (rule.interval === 1 && rule.freq === 'weekly' && weekdays.length === 1) parts.push(t(`schedule.everyWeekday_${weekdays[0]}`))
  else if (rule.interval === 1 && rule.freq === 'weekly' && isWeekdays(weekdays)) parts.push(t('schedule.weekdays'))
  else if (rule.interval === 1 && rule.freq === 'weekly') parts.push(t('schedule.everyWeek'), days)
  else if (rule.interval === 1) parts.push(t('schedule.everyMonthOn', { day: monthDay }) + lastDay)
  else {
    parts.push(t(`schedule.every_${rule.freq}`, { count: rule.interval }))
    if (rule.freq === 'weekly') parts.push(days)
    if (rule.freq === 'monthly') parts.push(t('schedule.onDay', { day: monthDay }) + lastDay)
  }
  if (rule.until !== null) parts.push(t('schedule.until', { day: shortDay(rule.until, t, language) }))
  if (rule.count !== null) parts.push(t('schedule.times', { count: rule.count }))
  return parts.join(', ')
}

/** `Repete toda quinta` or `Repete a cada 2 semanas, ter e qui, 5 vezes`: the rule of a series in a tooltip (US-9, US-11). */
export function repeatsLabel(rule: RecurrenceRule, t: TFunction, language: string): string {
  const summary = recurrenceSummary(rule, t, language)
  const weekdays = t('schedule.weekdays')
  const phrase = summary.startsWith(weekdays) ? t('schedule.onWeekdays') + summary.slice(weekdays.length) : uncapitalize(summary)
  return t('schedule.repeats', { rule: phrase })
}

/** The options of `Repetir`, built from the chosen day (US-9). */
export type RepeatPreset = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'custom'

/** The wall-clock time of `now` in `timeZone`, `HH:MM`. */
export function clockIn(timeZone: string | null | undefined, now: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timeZone ?? undefined, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
}

const plain = (rule: Omit<RecurrenceRule, 'until' | 'count'>): RecurrenceRule => ({ ...rule, until: null, count: null })

/** The rule of a preset on `day`. */
export function presetRule(preset: RepeatPreset, day: string): RecurrenceRule | null {
  switch (preset) {
    case 'daily':
      return plain({ freq: 'daily', interval: 1, weekdays: null, month_day: null })
    case 'weekdays':
      return plain({ freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], month_day: null })
    case 'weekly':
      return plain({ freq: 'weekly', interval: 1, weekdays: [weekdayOf(day)], month_day: null })
    case 'monthly':
      return plain({ freq: 'monthly', interval: 1, weekdays: null, month_day: dayDate(day).getDate() })
    default:
      return null
  }
}

/** Which preset an existing rule is on `day`; anything the presets do not say is custom. */
export function presetOf(rule: RecurrenceRule | null, day: string | null): RepeatPreset {
  if (rule === null) return 'none'
  if (day !== null) {
    for (const preset of ['daily', 'weekdays', 'weekly', 'monthly'] as const) {
      const candidate = presetRule(preset, day)!
      const same = (a: number[] | null, b: number[] | null) => JSON.stringify(a && [...a].sort()) === JSON.stringify(b && [...b].sort())
      if (
        candidate.freq === rule.freq &&
        candidate.interval === rule.interval &&
        same(candidate.weekdays, rule.weekdays) &&
        candidate.month_day === rule.month_day &&
        rule.until === null &&
        rule.count === null
      )
        return preset
    }
  }
  return 'custom'
}

const isoDay = (date: Date) => format(date, 'yyyy-MM-dd')
const plusDays = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
const isoWeekday = (date: Date) => date.getDay() || 7

/**
 * The first `count` days of a series that starts on `start`, as the server counts them (`nextOccurrence`):
 * every `interval` days, weeks from Monday or months, a shorter month falling on its last day, up to
 * `until` or `count`. The editor of a custom rule shows them under its summary.
 */
export function seriesDays(rule: RecurrenceRule, start: string, count: number): string[] {
  const anchor = dayDate(start)
  const found: string[] = [start]
  const limit = Math.min(count, rule.count ?? count)
  for (let period = 0; found.length < limit && period < 400; period += rule.interval) {
    let days: Date[]
    if (rule.freq === 'daily') days = [plusDays(anchor, period)]
    else if (rule.freq === 'weekly') {
      const monday = plusDays(anchor, 7 * period - (isoWeekday(anchor) - 1))
      days = [...(rule.weekdays ?? [])].sort((a, b) => a - b).map((weekday) => plusDays(monday, weekday - 1))
    } else {
      const month = new Date(anchor.getFullYear(), anchor.getMonth() + period, 1)
      const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
      days = [new Date(month.getFullYear(), month.getMonth(), Math.min(rule.month_day ?? anchor.getDate(), last))]
    }
    for (const day of days.map(isoDay)) {
      if (day <= found.at(-1)!) continue
      if (rule.until !== null && day > rule.until) return found
      if (found.length < limit) found.push(day)
    }
  }
  return found
}

/** The rule `Personalizado…` starts from on `day`: every week, on its weekday. */
export const defaultCustomRule = (day: string): RecurrenceRule => ({
  freq: 'weekly',
  interval: 1,
  weekdays: [weekdayOf(day)],
  month_day: null,
  until: null,
  count: null,
})

/** What a save changes in the schedule of a task; a field left out keeps its value. */
export interface ScheduleChangeFields {
  scheduled_on?: string | null
  scheduled_time?: string | null
  recurrence?: RecurrenceRule | null
}

/**
 * Whether a save moves an occurrence of a series and so asks `Só esta ocorrência` or `Esta e as próximas`
 * (US-12, D16): its day or its time changes. A new rule always counts for the series, and removing the
 * schedule ends it (D29), so neither asks.
 */
export function asksSeriesScope(task: TaskSchedule, change: ScheduleChangeFields): boolean {
  if (task.series === null || change.recurrence !== undefined || change.scheduled_on === null) return false
  return (
    (change.scheduled_on !== undefined && change.scheduled_on !== task.scheduled_on) ||
    (change.scheduled_time !== undefined && change.scheduled_time !== task.scheduled_time)
  )
}
