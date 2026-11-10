import { render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useZoomScroll } from './use-zoom-scroll'

function Body({ pxPerMinute, inset }: { pxPerMinute: number; inset?: () => number }) {
  const ref = useZoomScroll<HTMLDivElement>(pxPerMinute, inset)
  return <div ref={ref} data-testid="body" />
}

const wide = (matches: boolean) =>
  vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ matches: matches && query === '(min-width: 1024px)' }) as MediaQueryList)

beforeEach(() => {
  vi.mocked(window.scrollTo).mockClear()
  // The body starts at the top of the document; on the screen it moves up as the page scrolls, as a browser lays it out.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => DOMRect.fromRect({ x: 0, y: -window.scrollY, width: 700, height: 0 }))
})

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(window, 'scrollY', { value: 0, configurable: true })
})

describe('useZoomScroll (AGENDA-02)', () => {
  it('wide, scrolls the page to 07:00 under the inset and keeps the minute under it when the zoom changes', () => {
    wide(true)
    const { rerender } = render(<Body pxPerMinute={2.4} inset={() => 100} />)
    expect(window.scrollTo).toHaveBeenLastCalledWith({ top: 7 * 60 * 2.4 - 100 })

    // Scrolled so 09:30 sits under the inset at 3x, then down to 1x: 09:30 stays there.
    Object.defineProperty(window, 'scrollY', { value: 570 * 2.4 - 100, configurable: true })
    rerender(<Body pxPerMinute={0.8} inset={() => 100} />)
    const { top } = vi.mocked(window.scrollTo).mock.lastCall![0] as ScrollToOptions
    expect(top! + 100).toBeCloseTo(570 * 0.8)
  })

  it('narrow, where nothing is pinned, leaves the page at its top', () => {
    wide(false)
    render(<Body pxPerMinute={2.4} />)
    expect(window.scrollTo).not.toHaveBeenCalled()
  })
})
