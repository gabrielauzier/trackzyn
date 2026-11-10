import { useLayoutEffect, useRef } from 'react'

/** The grid opens scrolled to this hour (AGENDA-02). */
export const FIRST_HOUR = 7

/** Where the agenda's grid sits under its pinned headers and the page scrolls it (Tailwind's `lg`). */
const WIDE = '(min-width: 1024px)'

/**
 * A ref for the body of the grid, which the page scrolls (it has no scroll of its own). Wide, the page opens with 07:00
 * just under the headers pinned over it (AGENDA-02) and, when the zoom changes, keeps the minute under them where it
 * was, so the hours in view stay in view. `inset` is how much of the window's top those headers cover. Narrow, nothing
 * is pinned and the page opens at its top.
 */
export function useZoomScroll<T extends HTMLElement>(pxPerMinute: number, inset: () => number = () => 0) {
  const body = useRef<T>(null)
  const previous = useRef<number | null>(null)
  useLayoutEffect(() => {
    const element = body.current
    if (element && window.matchMedia(WIDE).matches) {
      const top = element.getBoundingClientRect().top + window.scrollY
      const covered = inset()
      const minute = previous.current === null ? FIRST_HOUR * 60 : (window.scrollY + covered - top) / previous.current
      window.scrollTo({ top: top + minute * pxPerMinute - covered })
    }
    previous.current = pxPerMinute
    // The inset is read when the page scrolls, not a reason to scroll again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pxPerMinute])
  return body
}
