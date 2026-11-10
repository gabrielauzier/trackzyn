import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useZoomScroll } from './use-zoom-scroll'

function Scroller({ pxPerMinute, row = false }: { pxPerMinute: number; row?: boolean }) {
  const ref = useZoomScroll<HTMLDivElement>(pxPerMinute, row)
  return (
    <>
      {row && <div data-testid="row" />}
      <div ref={ref} data-testid="scroller" />
    </>
  )
}

describe('useZoomScroll', () => {
  it('opens at 07:00 and keeps the minute at the top in view when the zoom changes', () => {
    const { getByTestId, rerender } = render(<Scroller pxPerMinute={2.4} />)
    const scroller = getByTestId('scroller')
    expect(scroller.scrollTop).toBe(7 * 60 * 2.4)

    // Scrolled to 09:30 at 3x, then down to 1x: 09:30 stays at the top.
    scroller.scrollTop = 570 * 2.4
    rerender(<Scroller pxPerMinute={0.8} />)
    expect(scroller.scrollTop).toBeCloseTo(570 * 0.8)
  })

  it('US-14 scrolls by as much as a row above pushes it, and back when the row goes, so the hours stay put', () => {
    // The scroller sits 80 px lower while the row above it shows.
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const top = this.dataset.testid === 'scroller' && document.querySelector('[data-testid="row"]') ? 280 : 200
      return DOMRect.fromRect({ x: 0, y: top, width: 700, height: 500 })
    })
    try {
      const { getByTestId, rerender } = render(<Scroller pxPerMinute={2.4} />)
      const scroller = getByTestId('scroller')
      scroller.scrollTop = 1000
      rerender(<Scroller pxPerMinute={2.4} row />)
      expect(scroller.scrollTop).toBe(1080)
      rerender(<Scroller pxPerMinute={2.4} />)
      expect(scroller.scrollTop).toBe(1000)
    } finally {
      rect.mockRestore()
    }
  })
})
