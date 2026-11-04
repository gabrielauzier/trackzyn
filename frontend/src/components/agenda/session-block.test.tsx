import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'

import type { LaidOutPiece } from '@/lib/agenda/layout'
import { i18n, renderWithProviders } from '@/test/utils'
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

  it('fills over the card with the theme share of its list colour, edged in that colour, and takes more of it with an outline on hover', () => {
    renderWithProviders(<SessionBlock piece={laid({ list_color: 5 })} pxPerMinute={1} timezone={SP} />)
    const block = screen.getByRole('button')
    expect(block.style.backgroundColor).toBe('color-mix(in oklab, var(--chart-5) var(--session-tint), var(--card))')
    const edge = 'color-mix(in oklab, var(--chart-5) var(--session-edge), var(--foreground))'
    expect([block.style.borderTopColor, block.style.borderRightColor, block.style.borderBottomColor]).toEqual([edge, edge, edge])
    expect(block.style.borderLeftColor).toBe('var(--chart-5)')
    expect(block).toHaveClass('border', 'border-l-4', 'hover:[--session-tint:var(--session-tint-hover)]', 'hover:outline-(--block-color)')
    expect(block).not.toHaveClass('opacity-75')
    expect(block.style.getPropertyValue('--block-color')).toBe('var(--chart-5)')
  })

  it('edges a break in the full muted foreground', () => {
    renderWithProviders(<SessionBlock piece={laid({ kind: 'break', task_id: null, task_title: null })} pxPerMinute={1} timezone={SP} />)
    expect(screen.getByRole('button')).toHaveClass('border-dashed', 'border-muted-foreground')
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

describe('SessionBlock of a joined block (#23)', () => {
  // Three sessions of Produto in São Paulo: 10:20–10:50, 10:52–11:10 (a break of the task, then the same task again) and
  // 11:14–11:40, of two tasks.
  const members: AgendaSession[] = [
    laid({ id: 'a', task_title: 'Write the spec', list_name: 'Produto', started_at: '2026-11-02T13:20:00.000Z', ended_at: '2026-11-02T13:50:00.000Z' }).session,
    laid({ id: 'b', task_title: 'Review the design', list_name: 'Produto', started_at: '2026-11-02T13:52:00.000Z', ended_at: '2026-11-02T14:10:00.000Z' }).session,
    laid({ id: 'c', task_title: 'Write the spec', list_name: 'Produto', started_at: '2026-11-02T14:14:00.000Z', ended_at: '2026-11-02T14:40:00.000Z' }).session,
  ]
  const joined = (sessions = members) =>
    laid({}, { session: sessions[0]!, start: 620, end: 700, seconds: (30 + 18 + 26) * 60, members: sessions })

  it('MERGE-32 carries the count 3 in its top right corner and no other text', () => {
    renderWithProviders(<SessionBlock piece={joined()} pxPerMinute={1} timezone={SP} />)
    const block = screen.getByRole('button')
    expect(block.textContent).toBe('3')
    expect(block).toHaveAttribute('data-joined')
    const badge = block.querySelector('[data-slot="session-count"]')!
    expect(badge.textContent).toBe('3')
    expect(badge).toHaveClass('absolute', 'top-0', 'right-0')
  })

  it('MERGE-25 names the block with its list, 3 sessions and the span from the first start to the last end', () => {
    renderWithProviders(<SessionBlock piece={joined()} pxPerMinute={1} timezone={SP} />)
    expect(screen.getByRole('button', { name: 'Produto, 3 sessions, 10:20 – 11:40' })).toBeInTheDocument()
  })

  it('MERGE-25 names it in Portuguese with N sessões', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<SessionBlock piece={joined()} pxPerMinute={1} timezone={SP} />)
      expect(screen.getByRole('button', { name: 'Produto, 3 sessões, 10:20 – 11:40' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('MERGE-26 lists each session in start order with its own title and time in the tooltip, and how to pick one', async () => {
    renderWithProviders(<SessionBlock piece={joined()} pxPerMinute={1} timezone={SP} />)
    await userEvent.hover(screen.getByRole('button'))
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip).toHaveTextContent('Produto · 3 sessions')
    const lines = within(tooltip).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toEqual(['Write the spec10:20 – 10:50', 'Review the design10:52 – 11:10', 'Write the spec11:14 – 11:40'])
    expect(tooltip).toHaveTextContent('Click to pick a session')
  })

  it('MERGE-26 shows the tooltip when the focus reaches the block, and names breaks Break', async () => {
    const breaks = members.map((m) => ({ ...m, kind: 'break' as const, task_id: null, task_title: null }))
    renderWithProviders(<SessionBlock piece={joined(breaks)} pxPerMinute={1} timezone={SP} />)
    await userEvent.tab()
    const tooltip = await screen.findByRole('tooltip')
    const lines = within(tooltip).getAllByRole('listitem').map((li) => li.textContent)
    expect(lines).toEqual(['Break10:20 – 10:50', 'Break10:52 – 11:10', 'Break11:14 – 11:40'])
    expect(tooltip).toHaveTextContent('Click to pick a session')
  })

  it('MERGE-26 shows the tooltip text in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      const breaks = members.map((m) => ({ ...m, kind: 'break' as const, task_id: null, task_title: null }))
      renderWithProviders(<SessionBlock piece={joined(breaks)} pxPerMinute={1} timezone={SP} />)
      await userEvent.hover(screen.getByRole('button'))
      const tooltip = await screen.findByRole('tooltip')
      expect(tooltip).toHaveTextContent('Produto · 3 sessões')
      expect(tooltip).toHaveTextContent('Intervalo10:20 – 10:50')
      expect(tooltip).toHaveTextContent('Clique para escolher uma sessão')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
