import { describe, expect, it } from 'vitest'

import { ShellLogo } from '@/components/shell-logo'
import { renderWithProviders } from '@/test/utils'

describe('ShellLogo', () => {
  it('renders an svg at the default size', () => {
    const { container } = renderWithProviders(<ShellLogo />)

    const svg = container.querySelector('svg')!
    expect(svg).toBeInTheDocument()
    expect(svg).toHaveAttribute('width', '24')
    expect(svg).toHaveAttribute('height', '24')
  })

  it('honours an explicit size on both axes', () => {
    const { container } = renderWithProviders(<ShellLogo size={64} />)

    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('width', '64')
    expect(svg).toHaveAttribute('height', '64')
  })

  it('keeps a square viewBox so the mark never distorts', () => {
    const { container } = renderWithProviders(<ShellLogo size={120} />)

    const svg = container.querySelector('svg')!
    expect(svg).toHaveAttribute('viewBox', '0 -1.5 43 43')
    expect(svg).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet')
  })

  it('paints the brand gradient by default', () => {
    const { container } = renderWithProviders(<ShellLogo />)

    const gradient = container.querySelector('linearGradient')!
    expect(gradient).toBeInTheDocument()
    const ring = container.querySelector('[data-part="ring"]')!
    expect(ring.getAttribute('fill')).toBe(`url(#${gradient.id})`)
  })

  it('gives every instance its own gradient ids', () => {
    const { container } = renderWithProviders(
      <>
        <ShellLogo />
        <ShellLogo />
      </>,
    )

    const ids = [...container.querySelectorAll('linearGradient')].map((g) => g.id)
    expect(ids).toHaveLength(4)
    expect(new Set(ids).size).toBe(4)
    for (const id of ids) expect(id).toMatch(/^[\w-]+$/)
  })

  it('fills from currentColor in the mono variant, so it follows the theme', () => {
    const { container } = renderWithProviders(<ShellLogo variant="mono" />)

    expect(container.querySelector('linearGradient')).toBeNull()
    expect(container.querySelector('g')).toHaveAttribute('fill', 'currentColor')
  })

  it('accepts a className', () => {
    const { container } = renderWithProviders(
      <ShellLogo className="text-primary" />,
    )

    expect(container.querySelector('svg')).toHaveClass('text-primary')
  })
})
