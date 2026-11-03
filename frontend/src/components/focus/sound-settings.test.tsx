import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { SoundSettings } from '@/components/focus/sound-settings'
import { isEnabled, setEnabled } from '@/lib/sounds/prefs'
import { renderWithProviders } from '@/test/utils'

const LABELS = ['Task completed', 'Every 10 minutes', 'End of estimate', 'End of break']

describe('SoundSettings (SOUND-06)', () => {
  it('opens from the settings icon with the 4 switches, all on by default', async () => {
    const { user } = renderWithProviders(<SoundSettings />)

    await user.click(screen.getByRole('button', { name: 'Sound settings' }))

    expect(screen.getByText('Sounds')).toBeInTheDocument()
    expect(LABELS.map((name) => screen.getByRole('switch', { name }).getAttribute('aria-checked'))).toEqual([
      'true',
      'true',
      'true',
      'true',
    ])
  })

  it('shows a sound already turned off on this device', async () => {
    setEnabled('estimate', false)
    const { user } = renderWithProviders(<SoundSettings />)

    await user.click(screen.getByRole('button', { name: 'Sound settings' }))

    expect(screen.getByRole('switch', { name: 'End of estimate' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByRole('switch', { name: 'End of break' })).toHaveAttribute('aria-checked', 'true')
  })

  it('turns off only the sound whose switch is clicked, and turns it back on', async () => {
    const { user } = renderWithProviders(<SoundSettings />)
    await user.click(screen.getByRole('button', { name: 'Sound settings' }))
    const progress = screen.getByRole('switch', { name: 'Every 10 minutes' })

    await user.click(progress)

    expect(progress).toHaveAttribute('aria-checked', 'false')
    expect([isEnabled('complete'), isEnabled('progress'), isEnabled('estimate'), isEnabled('break_end')]).toEqual([
      true,
      false,
      true,
      true,
    ])

    await user.click(progress)

    expect(progress).toHaveAttribute('aria-checked', 'true')
    expect(isEnabled('progress')).toBe(true)
  })
})
