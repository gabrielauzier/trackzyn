import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { ExtendPrompt } from '@/components/focus/extend-prompt'
import { renderWithProviders } from '@/test/utils'

function renderPrompt() {
  const onExtend = vi.fn()
  const onComplete = vi.fn()
  const result = renderWithProviders(<ExtendPrompt onExtend={onExtend} onComplete={onComplete} />)
  return { ...result, onExtend, onComplete }
}

describe('ExtendPrompt (FOCUS-10, FOCUS-12)', () => {
  it('shows the timer at 00:00:00 with Extend and Complete', () => {
    renderPrompt()

    expect(screen.getByText('00:00:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Extend' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Complete' })).toBeEnabled()
  })

  it('calls extend from Extend', async () => {
    const { user, onExtend, onComplete } = renderPrompt()

    await user.click(screen.getByRole('button', { name: 'Extend' }))

    expect(onExtend).toHaveBeenCalledTimes(1)
    expect(onComplete).not.toHaveBeenCalled()
  })

  it('calls complete from Complete', async () => {
    const { user, onExtend, onComplete } = renderPrompt()

    await user.click(screen.getByRole('button', { name: 'Complete' }))

    expect(onComplete).toHaveBeenCalledTimes(1)
    expect(onExtend).not.toHaveBeenCalled()
  })
})
