import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useZoomScroll } from './use-zoom-scroll'

function Scroller({ pxPerMinute }: { pxPerMinute: number }) {
  const ref = useZoomScroll<HTMLDivElement>(pxPerMinute)
  return <div ref={ref} data-testid="scroller" />
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
})
