import { describe, expect, it } from 'vitest'

import { dueState } from '@/lib/board/due'
import { todayInTimezone } from '@/lib/date-utils'

// Wednesday 2026-11-11 in the workspace's timezone.
const TODAY = '2026-11-11'

describe('dueState: the color of the due chip (DUE-02..05)', () => {
  it('DUE-03 a due day tomorrow is soon, out of Concluídas', () => {
    expect(dueState('2026-11-12', 'this_week', TODAY)).toBe('soon')
  })

  it('DUE-03 a due day today is soon, out of Concluídas', () => {
    expect(dueState('2026-11-11', 'today', TODAY)).toBe('soon')
  })

  it('DUE-04 a due day yesterday is late, out of Concluídas', () => {
    expect(dueState('2026-11-10', 'backlog', TODAY)).toBe('late')
  })

  it('DUE-05 a due day yesterday in Concluídas is done, never late', () => {
    expect(dueState('2026-11-10', 'done', TODAY)).toBe('done')
  })

  it('DUE-05 a due day today in Concluídas is done, not soon', () => {
    expect(dueState('2026-11-11', 'done', TODAY)).toBe('done')
  })

  it('DUE-02 a due day after tomorrow is neutral', () => {
    expect(dueState('2026-11-13', 'backlog', TODAY)).toBe('neutral')
  })

  it('counts days across a month: 2026-11-30 is tomorrow on 2026-11-29 and late on 2026-12-01', () => {
    expect(dueState('2026-11-30', 'backlog', '2026-11-29')).toBe('soon')
    expect(dueState('2026-11-30', 'backlog', '2026-12-01')).toBe('late')
  })

  it('turns the day in the workspace timezone: 23:30 in Sao Paulo is still the 11th, 02:30 UTC of the 12th', () => {
    const now = new Date('2026-11-12T02:30:00Z')
    // In Sao Paulo the due day of the 11th is still today; in UTC it is already yesterday.
    expect(dueState('2026-11-11', 'today', todayInTimezone('America/Sao_Paulo', now))).toBe('soon')
    expect(dueState('2026-11-11', 'today', todayInTimezone('UTC', now))).toBe('late')
  })
})
