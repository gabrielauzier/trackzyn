import { screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import type { LaidOutPiece } from '@/lib/agenda/layout'
import { renderWithProviders } from '@/test/utils'
import type { AgendaSession } from '@/types'
import { SessionBlock } from './session-block'

const SP = 'America/Sao_Paulo'

function laid(overrides: Partial<AgendaSession>, piece: Partial<LaidOutPiece> = {}): LaidOutPiece {
  const session: AgendaSession = {
    id: 's1',
    kind: 'task',
    origin: 'focus',
    task_id: 't1',
    task_title: 'Write the report',
    list_id: 'l1',
    list_name: 'Work',
    list_color: 3,
    // 13:01 to 13:26 in São Paulo.
    started_at: '2026-11-02T16:01:00.000Z',
    ended_at: '2026-11-02T16:26:00.000Z',
    ...overrides,
  }
  return { session, day: '2026-11-02', start: 781, end: 806, running: false, seconds: 1500, lane: 0, lanes: 1, ...piece }
}

describe('SessionBlock', () => {
  it('shows the task title and 13:01 – 13:26 with two digits (AGENDA-03)', () => {
    renderWithProviders(<SessionBlock piece={laid({})} pxPerMinute={1} timezone={SP} />)
    const block = screen.getByRole('button', { name: 'Write the report, 13:01 – 13:26' })
    expect(block).toHaveTextContent('Write the report')
    expect(block).toHaveTextContent('13:01 – 13:26')
  })

  it('starts at its start time with a height of its duration (AGENDA-03)', () => {
    renderWithProviders(<SessionBlock piece={laid({})} pxPerMinute={2} timezone={SP} />)
    const block = screen.getByRole('button')
    expect(block.style.top).toBe('1562px')
    expect(block.style.height).toBe('50px')
  })

  it('takes the color of its list (AGENDA-04)', () => {
    renderWithProviders(<SessionBlock piece={laid({ list_color: 5 })} pxPerMinute={1} timezone={SP} />)
    const block = screen.getByRole('button')
    expect(block.style.borderLeftColor).toBe('var(--chart-5)')
    expect(block.style.backgroundColor).toContain('var(--chart-5)')
  })

  it('draws a break as Break in grey with a dashed border (AGENDA-04)', () => {
    renderWithProviders(<SessionBlock piece={laid({ kind: 'break', task_id: null, task_title: null })} pxPerMinute={1} timezone={SP} />)
    const block = screen.getByRole('button', { name: 'Break, 13:01 – 13:26' })
    expect(block).toHaveClass('border-dashed', 'bg-muted')
    expect(block.style.backgroundColor).toBe('')
  })

  it('ends an open session with now and an indigo border (AGENDA-05)', () => {
    renderWithProviders(
      <SessionBlock piece={laid({ ended_at: null }, { running: true })} pxPerMinute={1} timezone={SP} />,
    )
    const block = screen.getByRole('button', { name: 'Write the report, 13:01 – now' })
    expect(block).toHaveClass('border-primary')
    expect(block).not.toHaveClass('border-dashed')
  })

  it('splits the column width with the sessions it overlaps (AGENDA-06)', () => {
    renderWithProviders(<SessionBlock piece={laid({}, { lane: 1, lanes: 2 })} pxPerMinute={1} timezone={SP} />)
    const block = screen.getByRole('button')
    expect([block.style.left, block.style.width]).toEqual(['50%', '50%'])
  })
})
