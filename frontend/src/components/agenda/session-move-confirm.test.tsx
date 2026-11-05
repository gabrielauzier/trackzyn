import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { i18n, renderWithProviders } from '@/test/utils'
import type { AgendaSession } from '@/types'
import { SessionMoveConfirm } from './session-move-confirm'

const SP = 'America/Sao_Paulo'
// Wednesday 4 November 2026, 17:07 in São Paulo.
const NOW = new Date('2026-11-04T20:07:00.000Z')

// Wednesday 11:00 to 12:00 in São Paulo.
const saved: AgendaSession = {
  id: 's1',
  kind: 'task',
  origin: 'manual',
  task_id: 't1',
  task_title: 'Test moving the session',
  list_id: 'l1',
  list_name: 'Personal',
  list_color: 3,
  started_at: '2026-11-04T14:00:00.000Z',
  ended_at: '2026-11-04T15:00:00.000Z',
}
// The new time: 13:00 to 14:00 the same day.
const moved = { day: '2026-11-04', start: 13 * 60, end: 14 * 60 }

function confirm(props: Partial<Parameters<typeof SessionMoveConfirm>[0]> = {}) {
  const handlers = { onCancel: vi.fn(), onSave: vi.fn(async () => undefined) }
  const result = renderWithProviders(
    <SessionMoveConfirm session={saved} times={moved} timezone={SP} now={NOW} sessions={[saved]} {...handlers} {...props} />,
  )
  return { ...result, ...handlers }
}

describe('SessionMoveConfirm', () => {
  it('ADJ-01 shows the task, the list, the saved time struck through and the new one with its duration', () => {
    const { container } = confirm()
    expect(screen.getByRole('heading', { name: 'Test moving the session' })).toBeInTheDocument()
    expect(screen.getByText('Personal')).toBeInTheDocument()
    expect(screen.getByText('New time — not saved yet')).toBeInTheDocument()
    expect(container.querySelector('del')).toHaveTextContent('Wed, Nov 4 · 11:00 – 12:00')
    expect(screen.getByText('Wed, Nov 4 · 13:00 – 14:00 · 1hr')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save time' })).toBeInTheDocument()
  })

  it('ADJ-01 names a break Break', () => {
    confirm({ session: { ...saved, kind: 'break', task_id: null, task_title: null } })
    expect(screen.getByRole('heading', { name: 'Break' })).toBeInTheDocument()
  })

  it('ADJ-03 saves once on Save time and keeps the button off until the save answers', async () => {
    let answer: () => void = () => {}
    const onSave = vi.fn(() => new Promise<void>((resolve) => (answer = resolve)))
    const { user } = confirm({ onSave })
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(screen.getByRole('button', { name: 'Save time' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    answer()
    await screen.findByRole('button', { name: 'Save time' })
    expect(screen.getByRole('button', { name: 'Save time' })).toBeEnabled()
  })

  it('ADJ-04 shows a refusal and keeps Cancel and Save time', async () => {
    const onSave = vi.fn(async () => {
      throw { response: { data: { code: 'invalid_time' } } }
    })
    const { user } = confirm({ onSave })
    await user.click(screen.getByRole('button', { name: 'Save time' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(i18n.t('agenda.errors.future'))
    expect(screen.getByRole('button', { name: 'Save time' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
  })

  it('ADJ-05 cancels on Cancel and on Esc, without saving', async () => {
    const { user, onCancel, onSave } = confirm()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('ADJ-07 warns about another session in the new time, and not about the session itself', () => {
    // 13:30 to 13:45 of another task, inside the new time.
    const other: AgendaSession = { ...saved, id: 's2', task_title: 'Call', started_at: '2026-11-04T16:30:00.000Z', ended_at: '2026-11-04T16:45:00.000Z' }
    const { unmount } = confirm({ sessions: [saved, other] })
    expect(screen.getByRole('status')).toHaveTextContent('Overlaps Call (13:30 – 13:45).')
    unmount()
    confirm({ sessions: [saved] })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('reads Novo horário — ainda não salvo and Salvar horário in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    confirm()
    expect(screen.getByText('Novo horário — ainda não salvo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Salvar horário' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})
