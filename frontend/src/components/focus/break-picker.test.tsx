import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { BreakPicker } from '@/components/focus/break-picker'
import { renderWithProviders } from '@/test/utils'

function renderPicker() {
  const onPick = vi.fn()
  const result = renderWithProviders(<BreakPicker onPick={onPick} />)
  return { ...result, onPick }
}

describe('BreakPicker (BREAK-01, BREAK-02)', () => {
  it('offers 5, 10 and 15 min and sends the shortcut picked', async () => {
    const { user, onPick } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Break' }))
    expect(screen.getByRole('button', { name: '5 min' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '15 min' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '10 min' }))

    expect(onPick).toHaveBeenCalledTimes(1)
    expect(onPick).toHaveBeenCalledWith(10)
  })

  it.each(['0', '121'])('blocks %s minutes typed in the field', async (typed) => {
    const { user, onPick } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Break' }))
    await user.type(screen.getByLabelText('Minutes'), typed)
    await user.click(screen.getByRole('button', { name: 'Start break' }))

    expect(screen.getByText('Use 1 to 120 minutes')).toBeInTheDocument()
    expect(onPick).not.toHaveBeenCalled()
  })

  it('sends 120 minutes typed in the field', async () => {
    const { user, onPick } = renderPicker()

    await user.click(screen.getByRole('button', { name: 'Break' }))
    await user.type(screen.getByLabelText('Minutes'), '120')
    await user.click(screen.getByRole('button', { name: 'Start break' }))

    expect(onPick).toHaveBeenCalledWith(120)
    expect(screen.queryByText('Use 1 to 120 minutes')).not.toBeInTheDocument()
  })
})
