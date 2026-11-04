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

  it('a task that never counted is dashed with the stopped badge', () => {
    const { unmount } = renderWithProviders(<FocusTaskCard title="DEV-1725" display={{ mode: 'paused', seconds: 2700 }} stopped />)

    const card = screen.getByRole('timer').closest('[data-running]')!
    expect(card).toHaveClass('border-dashed')
    expect(screen.getByText('Timer stopped')).toBeInTheDocument()
    // The estimate, in grey.
    expect(screen.getByRole('timer')).toHaveTextContent('00:45:00')
    expect(screen.getByRole('timer')).toHaveClass('text-muted-foreground')
    unmount()

    // A paused task that already counted keeps the solid contour, its time and no badge.
    renderWithProviders(<FocusTaskCard title="DEV-1725" display={{ mode: 'paused', seconds: 2100 }} />)
    const paused = screen.getByRole('timer').closest('[data-running]')!
    expect(paused).not.toHaveClass('border-dashed')
    expect(screen.queryByText('Timer stopped')).not.toBeInTheDocument()
    expect(screen.getByRole('timer')).not.toHaveClass('text-muted-foreground')
  })

  it('the drop zone covers the card and keeps its content, so the card keeps its size', () => {
    const { container } = renderWithProviders(
      <FocusTaskCard title="DEV-1725" display={{ mode: 'countdown', seconds: 3000 }} dropHint="DEV-1725 goes back to the top of the queue.">
        <ul aria-label="Subtasks"><li>One</li><li>Two</li></ul>
      </FocusTaskCard>,
    )

    // One card, the same box as without the drag: title, timer and subtasks still lay it out.
    const card = container.querySelector<HTMLElement>('[data-running]')!
    expect(container.querySelectorAll('[data-running]')).toHaveLength(1)
    const content = card.querySelector<HTMLElement>('[data-card-content]')!
    expect(content).toHaveClass('invisible')
    expect(content).toHaveTextContent('DEV-1725')
    expect(content).toHaveTextContent('00:50:00')
    expect(content).toHaveTextContent('OneTwo')
    // The message is a layer over that box, not a box of its own.
    const zone = card.querySelector<HTMLElement>('[data-drop-zone]')!
    expect(zone).toHaveClass('absolute')
    expect(zone).toHaveTextContent('Drop to focus on this now')
    expect(zone).toHaveTextContent('DEV-1725 goes back to the top of the queue.')
  })
})
