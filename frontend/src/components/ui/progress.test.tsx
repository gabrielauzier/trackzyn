import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { Progress } from '@/components/ui/progress'
import { renderWithProviders } from '@/test/utils'

describe('Progress', () => {
  it.each([0, 50, 100])('reports %i% and fills that much of the bar', (value) => {
    const { container } = renderWithProviders(<Progress value={value} aria-label="Done" />)

    expect(screen.getByRole('progressbar', { name: 'Done' })).toHaveAttribute('aria-valuenow', String(value))
    expect(container.querySelector('[data-slot="progress-indicator"]')).toHaveStyle({ width: `${value}%` })
  })
})
