import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { DAY_MINUTES } from '@/lib/agenda/layout'

export type DragMode = 'create' | 'top' | 'bottom' | 'move'

/**
 * The block being drawn or adjusted, in minutes since the local midnight of `day`. A session that
 * crosses midnight may start below 0 or end past 1440.
 */
export interface Draft {
  mode: DragMode
  day: string
  start: number
  end: number
  /** The session being adjusted; null for the draft of a new session. */
  sessionId: string | null
}

/** A block to adjust: its day and its whole start and end, in minutes since that day's local midnight. */
export interface DragTarget {
  day: string
  start: number
  end: number
  sessionId: string | null
}

export interface GridDragOptions {
  pxPerMinute: number
  snapMinutes?: number
  /** The latest minute a session may end on `day`: 1440 for a past day, now for today, 0 for a future day (AGENDA-23). */
  limit: (day: string) => number
  /** The day of the column under `clientX`, to move a block to another day (AGENDA-30); absent keeps the day. */
  dayAt?: (clientX: number) => string | null
  /** Called when the pointer is released with the final draft. */
  onCommit: (draft: Draft) => void
}

const MAX_MINUTES = DAY_MINUTES

interface Gesture {
  mode: DragMode
  target: DragTarget
  /** Top of the day column on the screen. */
  columnTop: number
  /** The minute under the pointer when the gesture began. */
  grab: number
  moved: boolean
}

const columnTopOf = (event: ReactPointerEvent) => {
  const element = event.currentTarget as HTMLElement
  return (element.closest('[data-agenda-column]') ?? element).getBoundingClientRect().top
}

/**
 * Pointer gestures on the agenda grid: drag over empty time to create (AGENDA-14), pull the top or the
 * bottom edge (AGENDA-18, AGENDA-29) and move a whole block (AGENDA-30). Everything snaps to 15 min,
 * never ends after now and lasts from 1 min to 24 h.
 */
export function useGridDrag({ pxPerMinute, snapMinutes = 15, limit, dayAt, onCommit }: GridDragOptions) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const latest = useRef<Draft | null>(null)
  const options = useRef({ pxPerMinute, snapMinutes, limit, dayAt, onCommit })
  useEffect(() => {
    options.current = { pxPerMinute, snapMinutes, limit, dayAt, onCommit }
  })
  const [dragging, setDragging] = useState(false)

  const show = useCallback((next: Draft | null) => {
    latest.current = next
    setDraft(next)
  }, [])

  /** Where the gesture puts the block with the pointer at `clientX`/`clientY`, or null when it cannot go there. */
  const place = useCallback((current: Gesture, clientX: number, clientY: number): Draft | null => {
    const { pxPerMinute: px, snapMinutes: step, limit: limitOf, dayAt: dayOf } = options.current
    const floor = (minute: number) => Math.floor(minute / step) * step
    const ceil = (minute: number) => Math.ceil(minute / step) * step
    const round = (minute: number) => Math.round(minute / step) * step
    const pointer = (clientY - current.columnTop) / px
    const { target, mode } = current

    if (mode === 'create') {
      const cap = floor(Math.min(limitOf(target.day), DAY_MINUTES))
      const from = Math.max(0, Math.min(current.grab, pointer))
      const to = Math.max(current.grab, pointer)
      const start = floor(from)
      const end = Math.min(cap, Math.max(ceil(to), start + step))
      return end > start ? { mode, day: target.day, start, end, sessionId: target.sessionId } : null
    }
    if (mode === 'top') {
      const latestStart = ceil(target.end) - step
      const start = Math.min(latestStart, Math.max(target.end - MAX_MINUTES, round(pointer)))
      return { mode, day: target.day, start, end: target.end, sessionId: target.sessionId }
    }
    if (mode === 'bottom') {
      const cap = Math.min(limitOf(target.day), target.start + MAX_MINUTES)
      const earliestEnd = floor(target.start) + step
      if (cap < earliestEnd) return null
      const end = Math.max(earliestEnd, Math.min(floor(cap), round(pointer)))
      return { mode, day: target.day, start: target.start, end, sessionId: target.sessionId }
    }
    const day = dayOf?.(clientX) ?? target.day
    // A day that has not begun takes no session.
    if (limitOf(day) <= 0) return null
    const length = target.end - target.start
    const start = Math.min(floor(limitOf(day) - length), round(target.start + pointer - current.grab))
    return { mode, day, start, end: start + length, sessionId: target.sessionId }
  }, [])

  const begin = useCallback(
    (event: ReactPointerEvent, mode: DragMode, target: DragTarget) => {
      if (event.button !== 0) return
      event.stopPropagation()
      const columnTop = columnTopOf(event)
      const current: Gesture = { mode, target, columnTop, grab: (event.clientY - columnTop) / options.current.pxPerMinute, moved: false }
      if (mode === 'create') {
        const first = place(current, event.clientX, event.clientY)
        if (first === null) return
        show(first)
      } else {
        show({ mode, ...target })
      }
      gesture.current = current
      setDragging(true)
    },
    [place, show],
  )

  useEffect(() => {
    if (!dragging) return
    const move = (event: PointerEvent) => {
      const current = gesture.current
      if (!current) return
      const next = place(current, event.clientX, event.clientY)
      if (next === null) return
      current.moved = true
      show(next)
    }
    const up = () => {
      const current = gesture.current
      gesture.current = null
      setDragging(false)
      const final = latest.current
      if (!current || !final) return
      const changed = final.day !== current.target.day || final.start !== current.target.start || final.end !== current.target.end
      if (current.mode === 'create' || changed) options.current.onCommit(final)
      // An adjusted session hands over to the saved one; the draft of a new session stays for the panel.
      if (final.sessionId !== null) show(null)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [dragging, place, show])

  return {
    draft,
    dragging,
    /** Sets the draft from the panel fields (AGENDA-17), or clears it with null (AGENDA-26). */
    setDraft: show,
    startCreate: (event: ReactPointerEvent, day: string) =>
      begin(event, 'create', { day, start: 0, end: 0, sessionId: null }),
    startResize: (event: ReactPointerEvent, edge: 'top' | 'bottom', target: DragTarget) => begin(event, edge, target),
    startMove: (event: ReactPointerEvent, target: DragTarget) => begin(event, 'move', target),
  }
}
