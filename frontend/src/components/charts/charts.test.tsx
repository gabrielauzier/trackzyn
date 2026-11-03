import { afterEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '@/test/utils'
import { AreaChart, BarChart, DonutChart, SankeyChart, StatTile } from '@/components/charts'

const data = [
  { month: 'Jan', a: 10, b: 4 },
  { month: 'Feb', a: 12, b: 6 },
]

afterEach(() => {
  vi.restoreAllMocks()
})

describe('charts', () => {
  it('shows a legend for two or more series and none for one', () => {
    const { rerender } = renderWithProviders(
      <AreaChart data={data} xKey="month" series={[{ key: 'a', label: 'Alpha' }, { key: 'b', label: 'Beta' }]} />,
    )
    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByText('Beta')).toBeInTheDocument()

    rerender(<BarChart data={data} xKey="month" series={[{ key: 'a', label: 'Alpha' }]} />)
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('lists every donut slice with its share', () => {
    renderWithProviders(
      <DonutChart
        data={[
          { key: 'x', label: 'Free', value: 75 },
          { key: 'y', label: 'Pro', value: 25 },
        ]}
      />,
    )
    expect(screen.getByText('Free')).toBeInTheDocument()
    expect(screen.getByText('75%')).toBeInTheDocument()
    expect(screen.getByText('25%')).toBeInTheDocument()
  })

  it('lays out a sankey with a label per node', () => {
    // jsdom has no layout; the sankey measures its container to lay out.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      DOMRect.fromRect({ width: 600, height: 320 }),
    )
    renderWithProviders(
      <SankeyChart
        nodes={[
          { id: 'in', label: 'Visitors' },
          { id: 'out', label: 'Signups' },
        ]}
        links={[{ source: 'in', target: 'out', value: 40 }]}
      />,
    )
    expect(screen.getByText('Visitors')).toBeInTheDocument()
    expect(screen.getByText('Signups')).toBeInTheDocument()
  })

  it('colours a delta by whether the direction is good news', () => {
    const { rerender } = renderWithProviders(<StatTile label="Revenue" value="$10" delta={0.1} />)
    expect(screen.getByText('+10.0%').closest('span')).toHaveClass('text-status-good')

    rerender(<StatTile label="Churn" value="3%" delta={0.1} higherIsBetter={false} />)
    expect(screen.getByText('+10.0%').closest('span')).toHaveClass('text-status-critical')
  })
})
