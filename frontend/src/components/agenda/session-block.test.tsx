import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  it('carries no visible text, and names the task and 13:01 – 13:26 with two digits (AGENDA-03)', () => {
    renderWithProviders(<SessionBlock piece={laid({})} pxPerMinute={1} timezone={SP} />)
    const block = screen.getByRole('button', { name: 'Write the report, 13:01 – 13:26' })
    expect(block.textContent).toBe('')
  })

  it('rests translucent and, on hover, turns opaque with an outline in the color of its list', () => {
    renderWithProviders(<SessionBlock piece={laid({ list_color: 5 })} pxPerMinute={1} timezone={SP} />)
    const block = screen.getByRole('button')
    expect(block).toHaveClass('opacity-75', 'hover:opacity-100', 'hover:outline-(--block-color)')
    expect(block.style.getPropertyValue('--block-color')).toBe('var(--chart-5)')
  })

  it('shows the whole title and the time in a tooltip on hover', async () => {
    const long = 'Write the quarterly report for the finance team, with every chart and the appendix'
    renderWithProviders(<SessionBlock piece={laid({ task_title: long })} pxPerMinute={1} timezone={SP} />)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    await userEvent.hover(screen.getByRole('button'))

    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent(long)
    expect(tooltip).toHaveTextContent('13:01 – 13:26')
    expect(document.querySelector('[data-slot="tooltip-content"] .truncate')).toBeNull()
  })

  it('names a break Break and an open session now in its tooltip', async () => {
    renderWithProviders(
      <SessionBlock piece={laid({ kind: 'break', task_id: null, task_title: null, ended_at: null }, { running: true })} pxPerMinute={1} timezone={SP} />,
    )
    await userEvent.hover(screen.getByRole('button'))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Break')
    expect(tooltip).toHaveTextContent('13:01 – now')
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
