import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { StaleSessionDialog } from '@/components/focus/stale-session-dialog'
import { i18n, renderWithProviders } from '@/test/utils'

const STALE = { session_id: 'session-1', last_seen_at: '2026-10-24T12:47:26.000Z', seconds: 754 }

function renderDialog(stale: typeof STALE | null = STALE) {
  const onRecover = vi.fn()
  const result = renderWithProviders(<StaleSessionDialog stale={stale} onRecover={onRecover} />)
  return { ...result, onRecover }
}

describe('StaleSessionDialog (SYNC-11)', () => {
  it('shows how long the session counted since the last signal', () => {
    renderDialog()

    expect(screen.getByRole('dialog')).toHaveTextContent('The task kept counting for 12min since the last signal.')
    expect(screen.getByRole('button', { name: 'Keep' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cut at the last signal' })).toBeInTheDocument()
  })

  it('calls recover with keep from Keep, and closes', async () => {
    const { user, onRecover } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Keep' }))

    expect(onRecover).toHaveBeenCalledTimes(1)
    expect(onRecover).toHaveBeenCalledWith('keep')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('calls recover with cut from Cut at the last signal, and closes', async () => {
    const { user, onRecover } = renderDialog()

    await user.click(screen.getByRole('button', { name: 'Cut at the last signal' }))

    expect(onRecover).toHaveBeenCalledTimes(1)
    expect(onRecover).toHaveBeenCalledWith('cut')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('stays closed without a stale session', () => {
    renderDialog(null)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows the question in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderDialog()

      expect(screen.getByRole('dialog')).toHaveTextContent('A tarefa ficou contando 12min desde o último sinal.')
      expect(screen.getByRole('button', { name: 'Manter' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cortar no último sinal' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
