import { useLayoutEffect, useRef } from 'react'

/** The grid opens scrolled to this hour (AGENDA-02). */
export const FIRST_HOUR = 7

/**
 * A ref for the scroller of the grid: it opens at 07:00 (AGENDA-02) and, when the zoom changes, keeps the
 * minute at its top where it was, so the hours in view stay in view. When `shift` changes (something above the scroller
 * came or went), it scrolls by as much as the scroller moved, so the hours stay where they were on the screen.
 */
export function useZoomScroll<T extends HTMLElement>(pxPerMinute: number, shift?: unknown) {
  const scroller = useRef<T>(null)
  const previous = useRef<number | null>(null)
  useLayoutEffect(() => {
    const element = scroller.current
    if (element) {
      element.scrollTop =
        previous.current === null ? FIRST_HOUR * 60 * pxPerMinute : (element.scrollTop / previous.current) * pxPerMinute
    }
    previous.current = pxPerMinute
  }, [pxPerMinute])
  const top = useRef<number | null>(null)
  useLayoutEffect(() => {
    const element = scroller.current
    if (!element) return
    const now = element.getBoundingClientRect().top
    const before = top.current
    top.current = now
    if (before !== null && now !== before) element.scrollTop += now - before
  }, [shift])
  return scroller
}
