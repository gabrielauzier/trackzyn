import { describe, expect, it } from 'vitest'

import type { AgendaSession } from '@/types'
import { isHiddenSession } from './hide'

const START = '2026-11-02T13:00:00.000Z'
const after = (seconds: number) => new Date(Date.parse(START) + seconds * 1000).toISOString()
const session = (endedAt: string | null): AgendaSession => ({
  id: 's1',
  kind: 'task',
  origin: 'focus',
  task_id: 't1',
  task_title: 'Write',
  list_id: 'l1',
  list_name: 'Work',
  list_color: 3,
  started_at: START,
  ended_at: endedAt,
})

describe('isHiddenSession', () => {
  it('HIDE-16 hides nothing while the minimum is off, however short', () => {
    expect(isHiddenSession(session(after(1)), null)).toBe(false)
    expect(isHiddenSession(session(START), null)).toBe(false)
  })

  it('HIDE-13 never hides the open session, even seconds old', () => {
    expect(isHiddenSession(session(null), 5)).toBe(false)
  })

  it('HIDE-11 hides a closed session of 4 min 59 s under a minimum of 5', () => {
    expect(isHiddenSession(session(after(4 * 60 + 59)), 5)).toBe(true)
  })

  it('HIDE-12 shows a closed session of exactly 5 min, and one of 6 min, under a minimum of 5', () => {
    expect(isHiddenSession(session(after(5 * 60)), 5)).toBe(false)
    expect(isHiddenSession(session(after(6 * 60)), 5)).toBe(false)
  })

  it('HIDE-11 applies to a break too', () => {
    expect(isHiddenSession({ ...session(after(60)), kind: 'break', task_id: null, task_title: null }, 5)).toBe(true)
  })
})
