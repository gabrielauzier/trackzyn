import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/utils'
import { DatePickerChip } from './date-picker-chip'

const TODAY = '2026-11-04'

function open(onPick = vi.fn(), shown = TODAY) {
  const result = renderWithProviders(<DatePickerChip today={TODAY} shown={shown} onPick={onPick} />)
  return { ...result, onPick }
}

describe('DatePickerChip', () => {
  it('opens the calendar of the month with today filled and the month arrows (AGENDA-39)', async () => {
    const { user } = open()
    await user.click(screen.getByRole('button', { name: 'Today' }))
    const calendar = await screen.findByRole('dialog')
    expect(within(calendar).getByRole('button', { name: 'November 2026' })).toBeInTheDocument()
    // The first 4 is 4 November; 4 December closes the last row.
    expect(within(calendar).getAllByRole('button', { name: '4' })[0]).toHaveClass('bg-primary')
    expect(within(calendar).getByRole('button', { name: '12' })).not.toHaveClass('bg-primary')
    expect(within(calendar).getByRole('button', { name: 'Go to today' })).toBeInTheDocument()

    // The arrow after the month name goes to the next month.
    const header = within(calendar).getByRole('button', { name: 'November 2026' })
    await user.click(header.nextElementSibling as HTMLElement)
    expect(within(calendar).getByRole('button', { name: 'December 2026' })).toBeInTheDocument()
  })

  it('hands over 12 November as 2026-11-12 and closes the calendar (AGENDA-40, AGENDA-41)', async () => {
    const { user, onPick } = open()
    await user.click(screen.getByRole('button', { name: 'Today' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: '12' }))
    expect(onPick).toHaveBeenCalledWith('2026-11-12')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('hands over today on Go to today, from another month too', async () => {
    const { user, onPick } = open(vi.fn(), '2026-09-14')
    await user.click(screen.getByRole('button', { name: 'Today' }))
    const calendar = await screen.findByRole('dialog')
    expect(within(calendar).getByRole('button', { name: 'September 2026' })).toBeInTheDocument()
    await user.click(within(calendar).getByRole('button', { name: 'Go to today' }))
    expect(onPick).toHaveBeenCalledWith(TODAY)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
