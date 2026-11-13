import { describe, expect, it } from 'vitest'

import { parseTaskLine, targetColumn } from '@/lib/inbox/decision'

// Thursday, 13 November 2026: the week runs from Monday the 9th to Sunday the 15th.
const TODAY = '2026-11-13'

describe('targetColumn (PROC-03, PROC-04)', () => {
  it('no day goes to the Backlog', () => {
    expect(targetColumn(null, TODAY)).toBe('backlog')
    expect(targetColumn('', TODAY)).toBe('backlog')
  })

  it('today goes to Hoje', () => {
    expect(targetColumn('2026-11-13', TODAY)).toBe('today')
  })

  it('a day already past goes to Hoje', () => {
    expect(targetColumn('2026-11-10', TODAY)).toBe('today')
  })

  it('another day of this week, up to Sunday, goes to Esta semana', () => {
    expect(targetColumn('2026-11-14', TODAY)).toBe('this_week')
    expect(targetColumn('2026-11-15', TODAY)).toBe('this_week')
  })

  it('a day after Sunday goes to the Backlog', () => {
    expect(targetColumn('2026-11-16', TODAY)).toBe('backlog')
  })

  it('on a Sunday, the next Monday is already the Backlog', () => {
    expect(targetColumn('2026-11-16', '2026-11-15')).toBe('backlog')
  })

  it('PROC-04 a chosen column wins over the schedule', () => {
    expect(targetColumn('2026-11-13', TODAY, 'backlog')).toBe('backlog')
    expect(targetColumn(null, TODAY, 'today')).toBe('today')
  })
})

describe('parseTaskLine (GRP-03)', () => {
  it('Validar 0:30 is a task of 30 minutes', () => {
    expect(parseTaskLine('Validar 0:30')).toEqual({ title: 'Validar', estimate_minutes: 30 })
  })

  it('HH:MM at the end is the estimate', () => {
    expect(parseTaskLine('Implementar o job 03:00')).toEqual({ title: 'Implementar o job', estimate_minutes: 180 })
  })

  it('24:00 is the longest estimate', () => {
    expect(parseTaskLine('Dia todo 24:00')).toEqual({ title: 'Dia todo', estimate_minutes: 1440 })
  })

  it('outside 00:01 to 24:00 the time stays in the title', () => {
    expect(parseTaskLine('Nada 0:00')).toEqual({ title: 'Nada 0:00', estimate_minutes: null })
    expect(parseTaskLine('Demais 24:01')).toEqual({ title: 'Demais 24:01', estimate_minutes: null })
  })

  it('a time not at the end stays in the title', () => {
    expect(parseTaskLine('Reunião 10:00 com o time')).toEqual({ title: 'Reunião 10:00 com o time', estimate_minutes: null })
  })

  it('a line that is only a time is all title', () => {
    expect(parseTaskLine('0:30')).toEqual({ title: '0:30', estimate_minutes: null })
  })
})
