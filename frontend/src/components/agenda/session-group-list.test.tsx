import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { i18n, renderWithProviders } from '@/test/utils'
import type { AgendaSession } from '@/types'
import { SessionGroupList } from './session-group-list'
import { SessionDetails } from './session-panel'

const SP = 'America/Sao_Paulo'
// Wednesday 4 November 2026, 14:07 in São Paulo.
const NOW = new Date('2026-11-04T17:07:00.000Z')

const session = (overrides: Partial<AgendaSession>): AgendaSession => ({
  id: 's1',
  kind: 'task',
  origin: 'focus',
  task_id: 't1',
  task_title: 'Write the spec',
  list_id: 'produto',
  list_name: 'Produto',
  list_color: 3,
  started_at: '2026-11-02T13:20:00.000Z',
  ended_at: '2026-11-02T13:50:00.000Z',
  ...overrides,
})

// Monday 2 November 2026 in São Paulo: 10:20–10:50 by the focus, 10:52–11:10 on the agenda, and a break 11:14–11:40.
const members: AgendaSession[] = [
  session({ id: 'a' }),
  session({
    id: 'b',
    origin: 'manual',
    task_id: 't2',
    task_title: 'Review the design',
    started_at: '2026-11-02T13:52:00.000Z',
    ended_at: '2026-11-02T14:10:00.000Z',
  }),
  session({
    id: 'c',
    kind: 'break',
    task_id: null,
    task_title: null,
    started_at: '2026-11-02T14:14:00.000Z',
    ended_at: '2026-11-02T14:40:00.000Z',
  }),
]

const list = (
  handlers: { onPick?: (session: AgendaSession) => void; onPreview?: (session: AgendaSession | null) => void; onClose?: () => void } = {},
  sessions = members,
) =>
  renderWithProviders(
    <SessionGroupList
      sessions={sessions}
      timezone={SP}
      onPick={handlers.onPick ?? vi.fn()}
      onPreview={handlers.onPreview}
      onClose={handlers.onClose ?? vi.fn()}
    />,
  )

describe('SessionGroupList (MERGE-27)', () => {
  it('heads the panel with the list and 3 sessions, the day and the span of the block, and how to pick one', () => {
    list()
    expect(screen.getByRole('heading', { name: 'Produto · 3 sessions' })).toBeInTheDocument()
    expect(screen.getByText('Monday, November 2 · 10:20 – 11:40')).toBeInTheDocument()
    expect(screen.getByText('Pick a session to see its details, edit or delete it.')).toBeInTheDocument()
  })

  it('offers one button per session in start order with its title, where it was recorded, its times and duration', () => {
    list({}, [members[2]!, members[0]!, members[1]!])
    const buttons = within(screen.getByRole('list')).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    const [first, second, third] = buttons as [HTMLElement, HTMLElement, HTMLElement]
    expect(within(first).getByText('Write the spec')).toBeInTheDocument()
    expect(within(first).getByText('recorded by the focus')).toBeInTheDocument()
    expect(within(first).getByText('10:20 – 10:50 · 30min')).toBeInTheDocument()
    expect(within(second).getByText('Review the design')).toBeInTheDocument()
    expect(within(second).getByText('recorded on the agenda')).toBeInTheDocument()
    expect(within(second).getByText('10:52 – 11:10 · 18min')).toBeInTheDocument()
    expect(within(third).getByText('Break')).toBeInTheDocument()
    expect(within(third).getByText('11:14 – 11:40 · 26min')).toBeInTheDocument()
  })

  it('MERGE-28 hands the clicked session to onPick', async () => {
    const onPick = vi.fn()
    const { user } = list({ onPick })
    const buttons = within(screen.getByRole('list')).getAllByRole('button')
    await user.click(buttons[1]!)
    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(members[1])
  })

  it('hands a session hovered or focused to onPreview, and null when it leaves, without picking it', async () => {
    const onPreview = vi.fn()
    const onPick = vi.fn()
    const { user } = list({ onPreview, onPick })
    const buttons = within(screen.getByRole('list')).getAllByRole('button')
    await user.hover(buttons[1]!)
    expect(onPreview).toHaveBeenLastCalledWith(members[1])
    await user.unhover(buttons[1]!)
    expect(onPreview).toHaveBeenLastCalledWith(null)
    buttons[2]!.focus()
    expect(onPreview).toHaveBeenLastCalledWith(members[2])
    buttons[2]!.blur()
    expect(onPreview).toHaveBeenLastCalledWith(null)
    expect(onPick).not.toHaveBeenCalled()
  })

  it('MERGE-31 closes on Close and on Esc', async () => {
    const onClose = vi.fn()
    const { user } = list({ onClose })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('reads the panel in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      list()
      expect(screen.getByRole('heading', { name: 'Produto · 3 sessões' })).toBeInTheDocument()
      expect(screen.getByText('segunda-feira, 2 de novembro · 10:20 – 11:40')).toBeInTheDocument()
      expect(screen.getByText('Escolha uma sessão para ver os detalhes, editar ou excluir.')).toBeInTheDocument()
      expect(screen.getAllByText('registrada pelo foco')).toHaveLength(2)
      expect(screen.getByText('registrada na agenda')).toBeInTheDocument()
      expect(screen.getByText('Intervalo')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})

describe('SessionDetails with the way back to its block (MERGE-33)', () => {
  it('shows ‹ Produto · 3 sessions and calls onBack on it', async () => {
    const onBack = vi.fn()
    const onClose = vi.fn()
    const { user } = renderWithProviders(
      <SessionDetails session={members[1]!} timezone={SP} now={NOW} onClose={onClose} onEdit={vi.fn()} onDelete={vi.fn()} onBack={onBack} groupCount={3} />,
    )
    await user.click(screen.getByRole('button', { name: '‹ Produto · 3 sessions' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
    // MERGE-28: the details of the chosen session, with Edit and Delete.
    expect(screen.getByRole('heading', { name: 'Review the design' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
  })

  it('reads the way back in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(
        <SessionDetails session={members[1]!} timezone={SP} now={NOW} onClose={vi.fn()} onBack={vi.fn()} groupCount={3} />,
      )
      expect(screen.getByRole('button', { name: '‹ Produto · 3 sessões' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('offers no way back without onBack, as before', () => {
    renderWithProviders(<SessionDetails session={members[1]!} timezone={SP} now={NOW} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /‹/ })).toBeNull()
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Close'])
  })
})
