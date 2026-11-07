import { describe, expect, it } from 'vitest'
import { type RecurrenceRule, nextOccurrence } from '../../src/services/recurrence.ts'

const rule = (given: Partial<RecurrenceRule> & Pick<RecurrenceRule, 'freq'>): RecurrenceRule => ({
  interval: 1,
  weekdays: null,
  monthDay: null,
  until: null,
  count: null,
  ...given,
})

// 2026-11-09 is a Monday; 2026-11-13 is a Friday.
describe('nextOccurrence: the first day of the rule after the occurrence and after today (US-10, D17)', () => {
  it('daily: the next day, or every N days', () => {
    expect(nextOccurrence(rule({ freq: 'daily' }), '2026-11-11', '2026-11-11', 1)).toBe('2026-11-12')
    expect(nextOccurrence(rule({ freq: 'daily', interval: 3 }), '2026-11-11', '2026-11-11', 1)).toBe('2026-11-14')
    expect(nextOccurrence(rule({ freq: 'daily' }), '2026-12-31', '2026-12-31', 1)).toBe('2027-01-01')
  })

  it('weekdays (weekly, Monday to Friday): Friday goes to Monday', () => {
    const weekdays = rule({ freq: 'weekly', weekdays: [1, 2, 3, 4, 5] })
    expect(nextOccurrence(weekdays, '2026-11-13', '2026-11-13', 1)).toBe('2026-11-16')
    expect(nextOccurrence(weekdays, '2026-11-10', '2026-11-10', 1)).toBe('2026-11-11')
  })

  it('weekly on several days every 2 weeks: the next day of the same week, then the first day two weeks on', () => {
    const everyOther = rule({ freq: 'weekly', interval: 2, weekdays: [1, 3] })
    expect(nextOccurrence(everyOther, '2026-11-09', '2026-11-09', 1)).toBe('2026-11-11')
    expect(nextOccurrence(everyOther, '2026-11-11', '2026-11-11', 2)).toBe('2026-11-23')
  })

  it('weekly on one day: the same weekday a week later', () => {
    expect(nextOccurrence(rule({ freq: 'weekly', weekdays: [6] }), '2026-11-14', '2026-11-14', 1)).toBe('2026-11-21')
  })

  it('monthly on day 31: the last day of a shorter month, and day 31 again when the month has it', () => {
    const last = rule({ freq: 'monthly', monthDay: 31 })
    expect(nextOccurrence(last, '2027-01-31', '2027-01-31', 1)).toBe('2027-02-28')
    expect(nextOccurrence(last, '2027-02-28', '2027-02-28', 2)).toBe('2027-03-31')
    expect(nextOccurrence(last, '2027-03-31', '2027-03-31', 3)).toBe('2027-04-30')
    expect(nextOccurrence(last, '2028-01-31', '2028-01-31', 1)).toBe('2028-02-29')
  })

  it('monthly on day 13 every 2 months', () => {
    expect(nextOccurrence(rule({ freq: 'monthly', monthDay: 13, interval: 2 }), '2026-11-13', '2026-11-13', 1)).toBe('2027-01-13')
  })

  it('completed late: the missed days are skipped and the next one is after today', () => {
    // Every Friday; the occurrence of Friday 6 completed on Wednesday 18: Friday 13 is skipped.
    expect(nextOccurrence(rule({ freq: 'weekly', weekdays: [5] }), '2026-11-06', '2026-11-18', 1)).toBe('2026-11-20')
    expect(nextOccurrence(rule({ freq: 'daily' }), '2026-11-01', '2026-11-11', 1)).toBe('2026-11-12')
    expect(nextOccurrence(rule({ freq: 'monthly', monthDay: 5 }), '2026-08-05', '2026-11-11', 1)).toBe('2026-12-05')
    // Every 3 days from the 1st: the 4th, 7th and 10th are missed; the next one keeps the step.
    expect(nextOccurrence(rule({ freq: 'daily', interval: 3 }), '2026-11-01', '2026-11-11', 1)).toBe('2026-11-13')
    // Every other week on Monday: the next one keeps the step of two weeks from the occurrence.
    expect(nextOccurrence(rule({ freq: 'weekly', interval: 2, weekdays: [1] }), '2026-10-26', '2026-11-11', 1)).toBe('2026-11-23')
  })

  it('completed early: the occurrence day itself is not repeated', () => {
    // Every Friday; the occurrence of Friday 13 completed on Wednesday 11: the next is Friday 20, not 13.
    expect(nextOccurrence(rule({ freq: 'weekly', weekdays: [5] }), '2026-11-13', '2026-11-11', 1)).toBe('2026-11-20')
    expect(nextOccurrence(rule({ freq: 'daily' }), '2026-11-13', '2026-11-11', 1)).toBe('2026-11-14')
  })

  it('until: the last possible day is kept; after it the series ends', () => {
    const until = rule({ freq: 'daily', until: '2026-11-12' })
    expect(nextOccurrence(until, '2026-11-11', '2026-11-11', 1)).toBe('2026-11-12')
    expect(nextOccurrence(until, '2026-11-12', '2026-11-12', 2)).toBeNull()
    // Completed late, past the end: no occurrence is left.
    expect(nextOccurrence(rule({ freq: 'weekly', weekdays: [5], until: '2026-11-20' }), '2026-11-13', '2026-11-21', 1)).toBeNull()
  })

  it('count: once the series created all its occurrences, it ends', () => {
    const three = rule({ freq: 'daily', count: 3 })
    expect(nextOccurrence(three, '2026-11-11', '2026-11-11', 2)).toBe('2026-11-12')
    expect(nextOccurrence(three, '2026-11-12', '2026-11-12', 3)).toBeNull()
    expect(nextOccurrence(rule({ freq: 'daily', count: 1 }), '2026-11-11', '2026-11-11', 1)).toBeNull()
  })
})
