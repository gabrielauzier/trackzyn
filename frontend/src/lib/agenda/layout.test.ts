import { describe, expect, it } from 'vitest'
import type { AgendaSession } from '@/types'
import { assignLanes, dayPieces, dayTotal, mondayOf, weekDays, type Piece } from './layout'

const SP = 'America/Sao_Paulo'

function session(overrides: Partial<AgendaSession>): AgendaSession {
  return {
    id: 's1',
    kind: 'task',
    origin: 'focus',
    task_id: 't1',
    task_title: 'Write the report',
    list_id: 'l1',
    list_name: 'Work',
    list_color: 3,
    started_at: '2026-11-02T12:00:00.000Z',
    ended_at: '2026-11-02T13:00:00.000Z',
    ...overrides,
  }
}

const piece = (id: string, start: number, end: number, kind: 'task' | 'break' = 'task'): Piece => ({
  session: session({ id, kind }),
  day: '2026-11-02',
  start,
  end,
  running: false,
  seconds: (end - start) * 60,
})

describe('dayPieces', () => {
  it('cuts a session from 23:30 to 00:30 in São Paulo into 30 min on each day (AGENDA-07)', () => {
    // 23:30 at UTC-3 is 02:30 UTC of the next day.
    const crossing = session({ started_at: '2026-11-03T02:30:00.000Z', ended_at: '2026-11-03T03:30:00.000Z' })
    const pieces = dayPieces([crossing], ['2026-11-02', '2026-11-03'], SP, new Date('2026-11-04T12:00:00Z'))
    expect(pieces.get('2026-11-02')).toEqual([
      expect.objectContaining({ start: 23 * 60 + 30, end: 24 * 60, seconds: 1800, running: false }),
    ])
    expect(pieces.get('2026-11-03')).toEqual([
      expect.objectContaining({ start: 0, end: 30, seconds: 1800, running: false }),
    ])
  })

  it('places a block at its local start with a length of its duration (AGENDA-03)', () => {
    // 13:01 to 13:26 in São Paulo.
    const short = session({ started_at: '2026-11-02T16:01:00.000Z', ended_at: '2026-11-02T16:26:00.000Z' })
    const [only] = dayPieces([short], ['2026-11-02'], SP, new Date('2026-11-04T12:00:00Z')).get('2026-11-02')!
    expect([only!.start, only!.end, only!.seconds]).toEqual([13 * 60 + 1, 13 * 60 + 26, 25 * 60])
  })

  it('grows an open session up to now and marks it running (AGENDA-05)', () => {
    const open = session({ started_at: '2026-11-04T12:00:00.000Z', ended_at: null })
    const [only] = dayPieces([open], ['2026-11-04'], SP, new Date('2026-11-04T13:20:00.000Z')).get('2026-11-04')!
    expect(only).toEqual(expect.objectContaining({ start: 9 * 60, end: 10 * 60 + 20, running: true, seconds: 80 * 60 }))
  })

  it('keeps a day without sessions empty', () => {
    const pieces = dayPieces([], weekDays('2026-11-02'), SP, new Date('2026-11-04T12:00:00Z'))
    expect([...pieces.keys()]).toEqual(weekDays('2026-11-02'))
    expect([...pieces.values()].every((day) => day.length === 0)).toBe(true)
  })
})

describe('assignLanes', () => {
  it('puts two overlapping sessions side by side and leaves a separate one whole (AGENDA-06)', () => {
    const laid = assignLanes([piece('a', 600, 660), piece('b', 630, 700), piece('c', 800, 860)])
    const byId = Object.fromEntries(laid.map((p) => [p.session.id, { lane: p.lane, lanes: p.lanes }]))
    expect(byId).toEqual({ a: { lane: 0, lanes: 2 }, b: { lane: 1, lanes: 2 }, c: { lane: 0, lanes: 1 } })
  })

  it('keeps a session that only touches an overlapping pair at the full width (AGENDA-06)', () => {
    // A overlaps B; B ends exactly when C starts.
    const laid = assignLanes([piece('a', 600, 660), piece('b', 630, 690), piece('c', 690, 750)])
    const byId = Object.fromEntries(laid.map((p) => [p.session.id, { lane: p.lane, lanes: p.lanes }]))
    expect(byId).toEqual({ a: { lane: 0, lanes: 2 }, b: { lane: 1, lanes: 2 }, c: { lane: 0, lanes: 1 } })
  })

  it('does not count sessions that only touch as overlapping', () => {
    const laid = assignLanes([piece('a', 600, 660), piece('b', 660, 720)])
    expect(laid.map((p) => [p.lane, p.lanes])).toEqual([[0, 1], [0, 1]])
  })
})

describe('dayTotal', () => {
  it('adds the task sessions and leaves breaks out (AGENDA-01)', () => {
    expect(dayTotal([piece('a', 0, 360), piece('b', 400, 415), piece('c', 420, 450, 'break')])).toBe(375 * 60)
  })
})

describe('mondayOf and weekDays', () => {
  it('runs a week from Monday to Sunday', () => {
    expect(mondayOf('2026-11-08')).toBe('2026-11-02')
    expect(weekDays(mondayOf('2026-11-04'))).toEqual([
      '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08',
    ])
  })
})
