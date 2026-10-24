import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders, t } from '@/test/utils'
import { TooltipProvider } from '@/components/ui/tooltip'
import ComponentsShowcasePage from './index'

describe('ComponentsShowcasePage', () => {
  it('renders every section of the catalogue', () => {
    renderWithProviders(
      <TooltipProvider>
        <ComponentsShowcasePage />
      </TooltipProvider>,
    )
    for (const id of ['foundations', 'primitives', 'forms', 'composed', 'charts']) {
      expect(screen.getByRole('heading', { level: 2, name: t(`showcase.${id}.title`) })).toBeInTheDocument()
    }
    // A sample from each family proves the specimens actually mounted.
    expect(screen.getByRole('heading', { name: 'Button' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /SankeyChart/ })).toBeInTheDocument()
  })
})
