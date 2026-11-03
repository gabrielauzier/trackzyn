import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { IconBadge } from '@/components/icon-badge'
import { renderWithProviders } from '@/test/utils'

describe('IconBadge', () => {
  it('renders the icon it was asked for', () => {
    // Asserting only that an svg exists would also pass on the fallback,
    // which is the failure this test is here to catch. Lucide stamps the
    // icon name into the class list, so pin that.
    const { container } = renderWithProviders(
      <IconBadge icon="shopping-bag" color="#22c55e" />,
    )

    expect(container.querySelector('svg')).toHaveClass('lucide-shopping-bag')
  })

  it('renders an emoji icon as text, for values saved as an emoji', () => {
    renderWithProviders(<IconBadge icon="🍔" color="#f97316" />)

    expect(screen.getByText('🍔')).toBeInTheDocument()
  })

  it('falls back to a placeholder icon for an unknown name', () => {
    // A renamed icon in a future lucide release must not blank the row.
    const { container } = renderWithProviders(
      <IconBadge icon="not-a-real-icon" color="#22c55e" />,
    )

    // CircleHelp renders as circle-question-mark: lucide renamed the icon and
    // kept the old export as an alias.
    expect(container.querySelector('svg')).toHaveClass(
      'lucide-circle-question-mark',
    )
  })

  it('survives a value with no icon or colour at all', () => {
    const { container } = renderWithProviders(
      <IconBadge icon={null} color={null} />,
    )

    expect(container.querySelector('svg')).toBeInTheDocument()
    expect(container.firstElementChild).toHaveStyle({
      backgroundColor: 'rgb(107, 114, 128)',
    })
  })

  it('paints the colour as the background', () => {
    const { container } = renderWithProviders(
      <IconBadge icon="shopping-bag" color="#22c55e" />,
    )

    expect(container.firstElementChild).toHaveStyle({
      backgroundColor: 'rgb(34, 197, 94)',
    })
  })

  it('grows with the requested size', () => {
    const { container: small } = renderWithProviders(
      <IconBadge icon="shopping-bag" color="#22c55e" size="xs" />,
    )
    expect(small.firstElementChild).toHaveClass('w-4', 'h-4')

    const { container: large } = renderWithProviders(
      <IconBadge icon="shopping-bag" color="#22c55e" size="xl" />,
    )
    expect(large.firstElementChild).toHaveClass('w-11', 'h-11')
  })

  it('never shrinks inside a flex row', () => {
    // Icon badges sit next to variable-length names in lists; without
    // shrink-0 a long name squashes the icon.
    const { container } = renderWithProviders(
      <IconBadge icon="shopping-bag" color="#22c55e" />,
    )

    expect(container.firstElementChild).toHaveClass('shrink-0')
  })
})
