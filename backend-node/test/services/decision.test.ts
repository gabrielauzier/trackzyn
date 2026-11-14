import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { decisionSchema, parseTaskLine, targetColumn } from '../../src/services/decision.ts'

// Friday 2026-11-13; the week runs from Monday 2026-11-09 to Sunday 2026-11-15 (AD-004).
const TODAY = '2026-11-13'
const WEEK_END = '2026-11-15'

describe('targetColumn (PROC-03, PROC-04)', () => {
  it('without a day goes to Backlog', () => {
    expect(targetColumn(null, TODAY, WEEK_END)).toBe('backlog')
    expect(targetColumn(undefined, TODAY, WEEK_END)).toBe('backlog')
  })

  it('today goes to Hoje', () => {
    expect(targetColumn(TODAY, TODAY, WEEK_END)).toBe('today')
  })

  it('a day already past goes to Hoje, in this week or before it', () => {
    expect(targetColumn('2026-11-10', TODAY, WEEK_END)).toBe('today')
    expect(targetColumn('2026-11-06', TODAY, WEEK_END)).toBe('today')
  })

  it('another day of this week goes to Esta semana, Sunday included', () => {
    expect(targetColumn('2026-11-14', TODAY, WEEK_END)).toBe('this_week')
    expect(targetColumn('2026-11-15', TODAY, WEEK_END)).toBe('this_week')
  })

  it('the next Monday goes to Backlog', () => {
    expect(targetColumn('2026-11-16', TODAY, WEEK_END)).toBe('backlog')
  })

  it('a column chosen in Vai para wins over the schedule', () => {
    expect(targetColumn(TODAY, TODAY, WEEK_END, 'backlog')).toBe('backlog')
    expect(targetColumn(null, TODAY, WEEK_END, 'this_week')).toBe('this_week')
  })
})

describe('parseTaskLine (GRP-03)', () => {
  it('"Validar 0:30" is the title Validar with 30 minutes', () => {
    expect(parseTaskLine('Validar 0:30')).toEqual({ title: 'Validar', estimate_minutes: 30 })
  })

  it('HH:MM up to 24:00 is the estimate', () => {
    expect(parseTaskLine('Revisar o PR 01:30')).toEqual({ title: 'Revisar o PR', estimate_minutes: 90 })
    expect(parseTaskLine('Migrar 24:00')).toEqual({ title: 'Migrar', estimate_minutes: 1440 })
  })

  it('without HH:MM at the end there is no estimate', () => {
    expect(parseTaskLine('Validar o deploy')).toEqual({ title: 'Validar o deploy', estimate_minutes: null })
    expect(parseTaskLine('Às 10:30 ligar')).toEqual({ title: 'Às 10:30 ligar', estimate_minutes: null })
  })

  it('24:01 and 00:00 are not an estimate and stay in the title', () => {
    expect(parseTaskLine('Validar 24:01')).toEqual({ title: 'Validar 24:01', estimate_minutes: null })
    expect(parseTaskLine('Validar 00:00')).toEqual({ title: 'Validar 00:00', estimate_minutes: null })
  })
})

describe('decisionSchema', () => {
  const listId = randomUUID()

  it('takes a task with its fields, a group with its tasks, a done task and a discard', () => {
    expect(decisionSchema.parse({ type: 'task', name: 'DEV-1701', list_id: listId, estimate_minutes: 90, scheduled_on: TODAY })).toMatchObject({
      type: 'task',
      name: 'DEV-1701',
      priority: 'none',
      estimate_minutes: 90,
    })
    expect(decisionSchema.safeParse({ type: 'group', name: 'Pipeline', list_id: listId, tasks: [{ title: 'Validar', estimate_minutes: 30 }] }).success).toBe(true)
    expect(decisionSchema.safeParse({ type: 'done', name: 'Responder', list_id: listId }).success).toBe(true)
    expect(decisionSchema.safeParse({ type: 'discard' }).success).toBe(true)
  })

  it('GRP-02 refuses a group without tasks', () => {
    expect(decisionSchema.safeParse({ type: 'group', name: 'Pipeline', list_id: listId, tasks: [] }).success).toBe(false)
  })

  it('REM-02 refuses a reminder with an estimate', () => {
    expect(decisionSchema.safeParse({ type: 'reminder', name: 'Pagar o DAS', list_id: listId, estimate_minutes: 30 }).success).toBe(false)
    expect(decisionSchema.safeParse({ type: 'reminder', name: 'Pagar o DAS', list_id: listId }).success).toBe(true)
  })

  it('refuses a name of 256 characters, and takes one of 255', () => {
    expect(decisionSchema.safeParse({ type: 'task', name: 'a'.repeat(256), list_id: listId }).success).toBe(false)
    expect(decisionSchema.safeParse({ type: 'task', name: 'a'.repeat(255), list_id: listId }).success).toBe(true)
  })
})
