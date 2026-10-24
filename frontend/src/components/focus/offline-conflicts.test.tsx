import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { toast } from 'sonner'

import { OfflineConflicts } from '@/components/focus/offline-conflicts'
import type { FocusConflict } from '@/lib/focus/queue'
import { i18n, renderWithProviders } from '@/test/utils'

vi.mock('sonner', () => ({ toast: { warning: vi.fn() } }))

const PAUSE: FocusConflict = {
  action_id: 'action-1',
  action: { type: 'pause', occurred_at: '2026-10-24T13:15:00.000Z', device_id: 'device-a', list_id: 'list-1' },
  status: 409,
  code: 'invalid_transition',
}

function renderConflicts(conflicts: FocusConflict[] = [PAUSE], expired = 0) {
  const onRetry = vi.fn()
  const onDiscard = vi.fn()
  const result = renderWithProviders(
    <OfflineConflicts conflicts={conflicts} expired={expired} onRetry={onRetry} onDiscard={onDiscard} />,
  )
  return { ...result, onRetry, onDiscard }
}

beforeEach(() => {
  vi.mocked(toast.warning).mockClear()
})

describe('OfflineConflicts (SYNC-07)', () => {
  it('shows the refused action with Try again and Discard', () => {
    renderConflicts()

    const item = screen.getByRole('listitem')
    expect(item).toHaveTextContent('Pause')
    expect(within(item).getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(within(item).getByRole('button', { name: 'Discard' })).toBeInTheDocument()
  })

  it('retries and discards the action of its row', async () => {
    const { user, onRetry, onDiscard } = renderConflicts()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledWith('action-1')

    await user.click(screen.getByRole('button', { name: 'Discard' }))
    expect(onDiscard).toHaveBeenCalledWith('action-1')
  })

  it('shows nothing without conflicts', () => {
    renderConflicts([])

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('shows the refused action in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderConflicts()

      const item = screen.getByRole('listitem')
      expect(item).toHaveTextContent('Pausar')
      expect(within(item).getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument()
      expect(within(item).getByRole('button', { name: 'Descartar' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})

describe('OfflineConflicts (SYNC-06)', () => {
  it('warns once when an action older than 24h was dropped', () => {
    const { rerender } = renderConflicts([], 1)

    expect(toast.warning).toHaveBeenCalledTimes(1)
    expect(toast.warning).toHaveBeenCalledWith('An action made offline more than 24h ago was discarded.')

    rerender(<OfflineConflicts conflicts={[]} expired={1} onRetry={vi.fn()} onDiscard={vi.fn()} />)
    expect(toast.warning).toHaveBeenCalledTimes(1)
  })

  it('warns in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderConflicts([], 1)

      expect(toast.warning).toHaveBeenCalledWith('Uma ação feita sem conexão há mais de 24h foi descartada.')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('does not warn while nothing was dropped', () => {
    renderConflicts([], 0)

    expect(toast.warning).not.toHaveBeenCalled()
  })
})
