import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { FocusTaskCard } from '@/components/focus/focus-task-card'
import { renderWithProviders } from '@/test/utils'

describe('FocusTaskCard (FOCUS-02, FOCUS-03, FOCUS-13)', () => {
  it('shows the task and what is left of its estimate as HH:MM:SS', () => {
    renderWithProviders(<FocusTaskCard title="DEV-1725" display={{ mode: 'countdown', seconds: 3000 }} />)

    expect(screen.getByText('DEV-1725')).toBeInTheDocument()
    expect(screen.getByRole('timer')).toHaveTextContent('00:50:00')
  })

  it('shows the time counting up past one hour', () => {
    renderWithProviders(<FocusTaskCard title="DEV-1725" display={{ mode: 'countup', seconds: 3601 }} />)

    expect(screen.getByRole('timer')).toHaveTextContent('01:00:01')
  })

  it('shows a paused task frozen at its value', () => {
    renderWithProviders(<FocusTaskCard title="DEV-1725" display={{ mode: 'paused', seconds: 59 }} />)

    expect(screen.getByRole('timer')).toHaveTextContent('00:00:59')
  })
})
