import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { ListBadge } from '@/components/lists/list-badge'
import { renderWithProviders } from '@/test/utils'

describe('ListBadge', () => {
  it('shows the upper-cased initial of the name', () => {
    renderWithProviders(<ListBadge name="week" color={3} />)

    expect(screen.getByText('W')).toBeInTheDocument()
  })

  it('paints the chosen palette colour', () => {
    renderWithProviders(<ListBadge name="week" color={3} />)

    expect(screen.getByText('W').style.backgroundColor).toBe('var(--chart-3)')
  })
})
