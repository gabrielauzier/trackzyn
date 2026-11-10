import { describe, expect, it } from 'vitest'
import type { AgendaSession } from '@/types'
import { joinPieces } from './join'
import { dayPieces, type Piece } from './layout'

const UTC = 'UTC'
const DAY = '2026-11-02'
const NOW = new Date('2026-11-04T12:00:00.000Z')

/** A closed session of list `l1` from `from` to `to`, wall clock `HH:MM` or `HH:MM:SS` on DAY in UTC. */
function session(id: string, from: string, to: string | null, overrides: Partial<AgendaSession> = {}): AgendaSession {
  const at = (time: string) => `${DAY}T${time.length === 5 ? `${time}:00` : time}.000Z`
  return {
    id,
    kind: 'task',
    origin: 'focus',
    task_id: 't1',
    task_title: 'Write the report',
    list_id: 'l1',
    list_name: 'Produto',
    list_color: 3,
    started_at: at(from),
    ended_at: to === null ? null : at(to),
    ...overrides,
  }
}

const piecesOf = (sessions: AgendaSession[], day = DAY, days = [DAY]) => dayPieces(sessions, days, UTC, NOW).get(day)!
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))
const ids = (pieces: Piece[]) => pieces.map((piece) => (piece.members ? piece.members.map((m) => m.id) : piece.session.id))

describe('joinPieces', () => {
  it('MERGE-11 joins 10:20–11:01 and 11:05–11:16 of one list under 5 min into one piece from 10:20 to 11:16', () => {
    const a = session('a', '10:20', '11:01')
    const b = session('b', '11:05', '11:16')
    const joined = joinPieces(piecesOf([b, a]), 5, null)
    expect(joined).toStrictEqual([
      {
        session: a,
        day: DAY,
        start: minute('10:20'),
        end: minute('11:16'),
        running: false,
        seconds: (41 + 11) * 60,
        members: [a, b],
      },
    ])
  })

  it('MERGE-11 joins two sessions exactly 5 min apart', () => {
    const joined = joinPieces(piecesOf([session('a', '10:20', '11:01'), session('b', '11:06', '11:16')]), 5, null)
    expect(ids(joined)).toEqual([['a', 'b']])
    expect([joined[0]!.start, joined[0]!.end]).toEqual([minute('10:20'), minute('11:16')])
  })

  it('MERGE-12 keeps apart two sessions 5 min and 1 s apart', () => {
    const pieces = piecesOf([session('a', '10:20', '11:01'), session('b', '11:06:01', '11:16')])
    expect(joinPieces(pieces, 5, null)).toStrictEqual(pieces)
  })

  it('MERGE-13 joins in a chain: 4 then 2 min apart make one piece, though the first and the last are 22 min apart', () => {
    const joined = joinPieces(
      piecesOf([session('a', '10:00', '10:30'), session('b', '10:34', '10:50'), session('c', '10:52', '11:00')]),
      5,
      null,
    )
    expect(ids(joined)).toEqual([['a', 'b', 'c']])
    expect([joined[0]!.start, joined[0]!.end, joined[0]!.seconds]).toEqual([minute('10:00'), minute('11:00'), (30 + 16 + 8) * 60])
  })

  it('MERGE-14 joins overlapping sessions of one list and kind, up to the latest end, and measures the next gap from it', () => {
    const joined = joinPieces(
      piecesOf([session('a', '10:00', '11:00'), session('b', '10:10', '10:20'), session('c', '11:03', '11:10')]),
      5,
      null,
    )
    expect(ids(joined)).toEqual([['a', 'b', 'c']])
    expect([joined[0]!.start, joined[0]!.end]).toEqual([minute('10:00'), minute('11:10')])
  })

  it('MERGE-15 keeps apart sessions of different lists, whatever the gap', () => {
    const pieces = piecesOf([
      session('a', '10:00', '10:30'),
      session('b', '10:31', '10:50', { list_id: 'l2', list_name: 'Suporte' }),
      session('c', '10:40', '10:45', { list_id: 'l2', list_name: 'Suporte' }),
    ])
    expect(ids(joinPieces(pieces, 5, null))).toEqual(['a', ['b', 'c']])
  })

  it('MERGE-16 keeps apart a task session and a break of the same list, whatever the gap', () => {
    const pieces = piecesOf([
      session('a', '10:00', '10:30'),
      session('b', '10:30', '10:40', { kind: 'break', task_id: null, task_title: null }),
    ])
    expect(joinPieces(pieces, 5, null)).toStrictEqual(pieces)
  })

  it('MERGE-17 joins two task sessions of one list over a break between them, which keeps its own piece', () => {
    const pause = session('p', '10:31', '10:33', { kind: 'break', task_id: null, task_title: null })
    const joined = joinPieces(piecesOf([session('a', '10:00', '10:30'), pause, session('b', '10:34', '11:00')]), 5, null)
    expect(ids(joined)).toEqual([['a', 'b'], 'p'])
    expect(joined.find((piece) => piece.session.id === 'p')).toStrictEqual(piecesOf([pause])[0])
  })

  it('MERGE-18 keeps the open session out of any block', () => {
    // The open session grows up to NOW, 12:00 of 2026-11-04, so both sit on that day.
    const today = piecesOf(
      [
        session('a', '10:00', '10:30', { started_at: '2026-11-04T10:00:00.000Z', ended_at: '2026-11-04T10:30:00.000Z' }),
        session('b', '10:32', null, { started_at: '2026-11-04T10:32:00.000Z' }),
      ],
      '2026-11-04',
      ['2026-11-04'],
    )
    expect(today[1]!.running).toBe(true)
    expect(joinPieces(today, 5, null)).toStrictEqual(today)
  })

  it('MERGE-18 keeps a session that crosses midnight out of any block, on both days it touches', () => {
    const before = session('a', '23:40', '23:48')
    const crossing = session('b', '23:50', '00:10', { ended_at: '2026-11-03T00:10:00.000Z' })
    const after = session('c', '00:12', '00:30', { started_at: '2026-11-03T00:12:00.000Z', ended_at: '2026-11-03T00:30:00.000Z' })
    const days = [DAY, '2026-11-03']
    const first = piecesOf([before, crossing, after], DAY, days)
    const second = piecesOf([before, crossing, after], '2026-11-03', days)
    expect(ids(first)).toEqual(['a', 'b'])
    expect(ids(second)).toEqual(['b', 'c'])
    expect(joinPieces(first, 5, null)).toStrictEqual(first)
    expect(joinPieces(second, 5, null)).toStrictEqual(second)
  })

  it('MERGE-29 keeps the apart session out, and joins the rest without it', () => {
    const pair = piecesOf([session('a', '10:00', '10:30'), session('b', '10:32', '10:40')])
    expect(joinPieces(pair, 5, 'b')).toStrictEqual(pair)

    const trio = piecesOf([session('a', '10:00', '10:30'), session('b', '10:32', '10:40'), session('c', '10:42', '11:00')])
    expect(ids(joinPieces(trio, 5, 'a'))).toEqual(['a', ['b', 'c']])
  })

  it('MERGE-22 gives the pieces back unchanged while the join gap is off', () => {
    const pieces = piecesOf([session('a', '10:20', '11:01'), session('b', '11:05', '11:16')])
    expect(joinPieces(pieces, null, null)).toStrictEqual(pieces)
  })
})

describe('joinPieces in net hours (#42)', () => {
  it('HOURS-13 gives a joined block with overlapping members the length of their union in net', () => {
    const a = session('a', '10:00', '11:00')
    const b = session('b', '10:30', '11:30')
    const [net] = joinPieces(piecesOf([a, b]), 5, null, 'net')
    expect(net).toMatchObject({ start: minute('10:00'), end: minute('11:30'), seconds: 90 * 60, members: [a, b] })
  })

  it('HOURS-10 keeps the summed length of the members in gross', () => {
    const a = session('a', '10:00', '11:00')
    const b = session('b', '10:30', '11:30')
    expect(joinPieces(piecesOf([a, b]), 5, null, 'gross')[0]!.seconds).toBe(120 * 60)
    expect(joinPieces(piecesOf([a, b]), 5, null)[0]!.seconds).toBe(120 * 60)
  })
})
