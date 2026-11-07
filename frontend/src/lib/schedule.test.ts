/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'

import i18n from '@/lib/i18n'
import { asksSeriesScope, recurrenceSummary, repeatsLabel, scheduleBadge } from '@/lib/schedule'
import type { RecurrenceRule, TaskColumn, TaskSchedule } from '@/types'

// Wednesday 2026-11-11, 14:07 in America/Sao_Paulo (UTC-3).
const NOW = new Date('2026-11-11T17:07:00Z')
const TZ = 'America/Sao_Paulo'

const rule = (given: Partial<RecurrenceRule> & Pick<RecurrenceRule, 'freq'>): RecurrenceRule => ({
  interval: 1,
  weekdays: null,
  month_day: null,
  until: null,
  count: null,
  ...given,
})
const FRIDAYS = rule({ freq: 'weekly', weekdays: [5] })

const schedule = (on: string | null, time: string | null = null, series: RecurrenceRule | null = null): TaskSchedule => ({
  scheduled_on: on,
  scheduled_time: time,
  series: series && { id: 'series-1', rule: series, next_on: null },
})

function badge(language: 'pt-BR' | 'en', task: TaskSchedule, column: TaskColumn = 'this_week', now = NOW) {
  return scheduleBadge(task, column, { now, timeZone: TZ, t: i18n.getFixedT(language), language })
}
const label = (language: 'pt-BR' | 'en', task: TaskSchedule, column: TaskColumn = 'this_week', now = NOW) =>
  badge(language, task, column, now)?.label

describe('scheduleBadge: the day (US-3)', () => {
  it.each([
    ['2026-11-11', 'Hoje', 'Today'],
    ['2026-11-12', 'Amanhã', 'Tomorrow'],
    ['2026-11-13', 'Sex', 'Fri'],
    ['2026-11-17', 'Ter', 'Tue'],
    ['2026-11-18', '18 nov', 'Nov 18'],
    ['2026-12-03', '3 dez', 'Dec 3'],
  ])('%s reads %s in pt-BR and %s in English, with the calendar icon', (day, pt, en) => {
    expect(label('pt-BR', schedule(day))).toBe(pt)
    expect(label('en', schedule(day))).toBe(en)
    expect(badge('en', schedule(day))!.icon).toBe('calendar')
  })

  it('an earlier day out of Today reads as a date', () => {
    expect(label('pt-BR', schedule('2026-11-04'), 'backlog')).toBe('4 nov')
  })

  it('decides today in the workspace timezone: 23:30 in Sao Paulo is still Wednesday', () => {
    const late = new Date('2026-11-12T02:30:00Z')
    expect(label('pt-BR', schedule('2026-11-12'), 'backlog', late)).toBe('Amanhã')
    expect(label('pt-BR', schedule('2026-11-11'), 'backlog', late)).toBe('Hoje')
  })

  it('the tooltip says the day in full', () => {
    expect(badge('pt-BR', schedule('2026-11-13'))!.tooltip).toBe('Sex, 13 nov')
    expect(badge('en', schedule('2026-11-13'))!.tooltip).toBe('Fri, Nov 13')
  })
})

describe('scheduleBadge: the time (US-3)', () => {
  it('joins the start time to the day, with the clock icon', () => {
    expect(label('pt-BR', schedule('2026-11-13', '14:00'))).toBe('Sex 14:00')
    expect(label('en', schedule('2026-11-13', '14:00'))).toBe('Fri 14:00')
    expect(label('pt-BR', schedule('2026-11-12', '09:30'))).toBe('Amanhã 09:30')
    expect(label('pt-BR', schedule('2026-11-20', '08:15'), 'backlog')).toBe('20 nov 08:15')
    expect(badge('pt-BR', schedule('2026-11-13', '14:00'))).toMatchObject({ icon: 'clock', tooltip: 'Sex, 13 nov · 14:00' })
  })

  it('in Today shows only the time, also for a day that came from earlier', () => {
    expect(label('pt-BR', schedule('2026-11-11', '14:00'), 'today')).toBe('14:00')
    expect(label('en', schedule('2026-11-09', '09:00'), 'today')).toBe('09:00')
  })
})

describe('scheduleBadge: Agendada in Today (D21)', () => {
  it('a scheduled task in Today without a time reads Agendada, with the day in the tooltip', () => {
    expect(badge('pt-BR', schedule('2026-11-04'), 'today')).toEqual({
      label: 'Agendada',
      tooltip: 'Agendada para qua, 4 nov',
      icon: 'check',
      repeats: false,
    })
    expect(badge('en', schedule('2026-11-11'), 'today')).toMatchObject({ label: 'Scheduled', tooltip: 'Scheduled for Wed, Nov 11' })
  })
})

describe('scheduleBadge: a later day kept in Today (D3)', () => {
  it('shows the day, not Agendada, and the day with the time', () => {
    expect(label('pt-BR', schedule('2026-11-12'), 'today')).toBe('Amanhã')
    expect(label('pt-BR', schedule('2026-11-13', '14:00'), 'today')).toBe('Sex 14:00')
  })
})

describe('scheduleBadge: no badge', () => {
  it('D5 Done shows none, even with a schedule', () => {
    expect(badge('pt-BR', schedule('2026-11-13', '14:00'), 'done')).toBeNull()
  })

  it('a task without a schedule shows none', () => {
    expect(badge('pt-BR', schedule(null), 'today')).toBeNull()
  })
})

describe('scheduleBadge: a series (US-11)', () => {
  it('marks the repetition and says the rule in the tooltip', () => {
    expect(badge('pt-BR', schedule('2026-11-13', '14:00', FRIDAYS))).toEqual({
      label: 'Sex 14:00',
      tooltip: 'Sex, 13 nov · 14:00\nRepete toda sexta',
      icon: 'clock',
      repeats: true,
    })
    expect(badge('en', schedule('2026-11-13', null, FRIDAYS))!.tooltip).toBe('Fri, Nov 13\nRepeats every Friday')
  })
})

describe('recurrenceSummary and repeatsLabel (US-9, US-11)', () => {
  const summary = (language: 'pt-BR' | 'en', given: RecurrenceRule) => recurrenceSummary(given, i18n.getFixedT(language), language)
  const repeats = (language: 'pt-BR' | 'en', given: RecurrenceRule) => repeatsLabel(given, i18n.getFixedT(language), language)

  it('Repete toda quinta', () => {
    expect(repeats('pt-BR', rule({ freq: 'weekly', weekdays: [4] }))).toBe('Repete toda quinta')
    expect(repeats('en', rule({ freq: 'weekly', weekdays: [4] }))).toBe('Repeats every Thursday')
    expect(summary('pt-BR', rule({ freq: 'weekly', weekdays: [6] }))).toBe('Todo sábado')
  })

  it('A cada 2 semanas, ter e qui, 5 vezes', () => {
    const given = rule({ freq: 'weekly', interval: 2, weekdays: [4, 2], count: 5 })
    expect(summary('pt-BR', given)).toBe('A cada 2 semanas, ter e qui, 5 vezes')
    expect(summary('en', given)).toBe('Every 2 weeks, Tue and Thu, 5 times')
    expect(repeats('pt-BR', given)).toBe('Repete a cada 2 semanas, ter e qui, 5 vezes')
  })

  it('the options of the picker: every day, weekdays and every month on the day', () => {
    expect(summary('pt-BR', rule({ freq: 'daily' }))).toBe('Todo dia')
    expect(summary('pt-BR', rule({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }))).toBe('Dias úteis (seg a sex)')
    expect(repeats('pt-BR', rule({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] }))).toBe('Repete em dias úteis (seg a sex)')
    expect(summary('pt-BR', rule({ freq: 'monthly', month_day: 13 }))).toBe('Todo mês no dia 13')
    expect(summary('en', rule({ freq: 'monthly', month_day: 13 }))).toBe('Every month on day 13')
  })

  it('a month day of 29 to 31 says "ou no último dia"', () => {
    expect(summary('pt-BR', rule({ freq: 'monthly', month_day: 31 }))).toBe('Todo mês no dia 31 (ou no último dia)')
    expect(summary('en', rule({ freq: 'monthly', month_day: 29 }))).toBe('Every month on day 29 (or the last day)')
    expect(summary('pt-BR', rule({ freq: 'monthly', month_day: 28 }))).toBe('Todo mês no dia 28')
  })

  it('the custom rules: several weekdays, an interval, an end by day or by count', () => {
    expect(summary('pt-BR', rule({ freq: 'weekly', weekdays: [3, 1] }))).toBe('Toda semana, seg e qua')
    expect(summary('pt-BR', rule({ freq: 'daily', interval: 3, count: 1 }))).toBe('A cada 3 dias, 1 vez')
    expect(summary('pt-BR', rule({ freq: 'monthly', interval: 2, month_day: 13, until: '2027-03-13' }))).toBe(
      'A cada 2 meses, no dia 13, até 13 mar',
    )
    expect(summary('en', rule({ freq: 'daily', until: '2026-12-20' }))).toBe('Every day, until Dec 20')
  })
})

describe('asksSeriesScope (US-12, D16)', () => {
  const occurrence = schedule('2026-11-13', '10:00', FRIDAYS)

  it('asks when the day or the time of an occurrence changes', () => {
    expect(asksSeriesScope(occurrence, { scheduled_on: '2026-11-12' })).toBe(true)
    expect(asksSeriesScope(occurrence, { scheduled_time: '11:00' })).toBe(true)
    expect(asksSeriesScope(occurrence, { scheduled_time: null })).toBe(true)
    expect(asksSeriesScope(occurrence, { scheduled_on: '2026-11-13', scheduled_time: '11:00' })).toBe(true)
  })

  it('does not ask for a task without a series, the same day and time, a new rule or removing the schedule', () => {
    expect(asksSeriesScope(schedule('2026-11-13', '10:00'), { scheduled_on: '2026-11-12' })).toBe(false)
    expect(asksSeriesScope(occurrence, { scheduled_on: '2026-11-13', scheduled_time: '10:00' })).toBe(false)
    expect(asksSeriesScope(occurrence, { scheduled_on: '2026-11-12', recurrence: rule({ freq: 'daily' }) })).toBe(false)
    expect(asksSeriesScope(occurrence, { recurrence: null })).toBe(false)
    expect(asksSeriesScope(occurrence, { scheduled_on: null })).toBe(false)
  })
})
