import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'

import { DAY_MINUTES } from '@/lib/agenda/layout'
import { SNAP_MINUTES, type DropItem } from './draft'

/** A block of the draft to move or pull: its key, its start in minutes since midnight and its length. */
export interface PlanDragTarget {
  key: string
  start: number
  minutes: number
}

/** What the grid draws while a gesture runs; `start` of a drop is null while the pointer is off the grid. */
export type PlanDragPreview =
  | { mode: 'drop'; item: DropItem; start: number | null; x: number; y: number }
  | { mode: 'move' | 'resize'; key: string; start: number; minutes: number }

export interface PlanDragOptions {
  pxPerMinute: number
  snapMinutes?: number
  /** The top on the screen of the plan column under the pointer, or null off the grid; absent, `[data-plan-column]`. */
  columnAt?: (clientX: number, clientY: number) => number | null
  /** An item from the side list released over the grid, at the quarter under the pointer (PLAN-04, PLAN-15). */
  onDrop: (item: DropItem, start: number) => void
  /** A block released at a new start (PLAN-05). */
  onMove: (key: string, start: number) => void
  /** A block whose bottom edge was pulled to a new length (PLAN-05). */
  onResize: (key: string, minutes: number) => void
}

type Gesture =
  | { mode: 'drop'; item: DropItem; startX: number; startY: number; moved: boolean }
  | { mode: 'move' | 'resize'; target: PlanDragTarget; startX: number; startY: number; moved: boolean }

/** A click: the pointer travelled less than this, in px, before it was released. */
const CLICK_TOLERANCE = 3

const contains = (rect: DOMRect, clientX: number, clientY: number) =>
  rect.width > 0 && clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom

/** The top of the plan column under the pointer, or null anywhere else (the hit test of `lib/agenda/drop-zone.ts`). */
function planColumnAt(clientX: number, clientY: number): number | null {
  const column = document.querySelector<HTMLElement>('[data-plan-column]')
  if (!column) return null
  const rect = column.getBoundingClientRect()
  return contains(rect, clientX, clientY) ? rect.top : null
}

/** Drops the next click, if it comes before the browser is idle again: a drag is not a click on the block. */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

/**
 * Pointer gestures on the plan grid (PLAN-04, PLAN-05, PLAN-15): drag a task or a break from the side list onto the
 * grid, move a block of the draft and pull its bottom edge, all in steps of 15 min. Released off the grid, a drop
 * creates nothing; Esc cancels any gesture. Nothing here is saved: the page puts each result in the draft.
 */
export function usePlanDrag({ pxPerMinute, snapMinutes = SNAP_MINUTES, columnAt = planColumnAt, onDrop, onMove, onResize }: PlanDragOptions) {
  const [preview, setPreview] = useState<PlanDragPreview | null>(null)
  const [active, setActive] = useState(false)
  const gesture = useRef<Gesture | null>(null)
  const latest = useRef<PlanDragPreview | null>(null)
  const options = useRef({ pxPerMinute, snapMinutes, columnAt, onDrop, onMove, onResize })
  useEffect(() => {
    options.current = { pxPerMinute, snapMinutes, columnAt, onDrop, onMove, onResize }
  })

  const show = useCallback((next: PlanDragPreview | null) => {
    latest.current = next
    setPreview(next)
  }, [])

  /** Where the gesture puts the block with the pointer at `clientX`/`clientY`. */
  const place = useCallback((current: Gesture, clientX: number, clientY: number): PlanDragPreview => {
    const { pxPerMinute: px, snapMinutes: step, columnAt: columnOf } = options.current
    if (current.mode === 'drop') {
      const top = columnOf(clientX, clientY)
      if (top === null) return { mode: 'drop', item: current.item, start: null, x: clientX, y: clientY }
      const start = Math.min(DAY_MINUTES - step, Math.max(0, Math.floor((clientY - top) / px / step) * step))
      return { mode: 'drop', item: current.item, start, x: clientX, y: clientY }
    }
    const { target } = current
    const delta = (clientY - current.startY) / px
    if (current.mode === 'move') {
      const start = Math.min(DAY_MINUTES - step, Math.max(0, Math.round((target.start + delta) / step) * step))
      return { mode: 'move', key: target.key, start, minutes: target.minutes }
    }
    // The bottom edge lands on a quarter, at least one quarter after the start.
    const earliestEnd = Math.floor(target.start / step) * step + step
    const end = Math.max(earliestEnd, Math.round((target.start + target.minutes + delta) / step) * step)
    return { mode: 'resize', key: target.key, start: target.start, minutes: end - target.start }
  }, [])

  const begin = useCallback(
    (event: ReactPointerEvent, next: Gesture) => {
      if (event.button !== 0) return
      event.stopPropagation()
      gesture.current = next
      show(place(next, event.clientX, event.clientY))
      setActive(true)
    },
    [place, show],
  )

  useEffect(() => {
    if (!active) return
    const stop = () => {
      gesture.current = null
      setActive(false)
      show(null)
    }
    const move = (event: PointerEvent) => {
      const current = gesture.current
      if (!current) return
      if (Math.abs(event.clientX - current.startX) >= CLICK_TOLERANCE || Math.abs(event.clientY - current.startY) >= CLICK_TOLERANCE) {
        current.moved = true
      }
      show(place(current, event.clientX, event.clientY))
    }
    const up = () => {
      const current = gesture.current
      const final = latest.current
      stop()
      // A press without a move is a click: it opens the block (PLAN-06).
      if (!current?.moved || !final) return
      swallowNextClick()
      const { onDrop: drop, onMove: moveTo, onResize: resize } = options.current
      if (current.mode === 'drop' && final.mode === 'drop') {
        if (final.start !== null) drop(final.item, final.start)
        return
      }
      if (current.mode === 'drop' || final.mode === 'drop') return
      if (final.mode === 'move' && final.start !== current.target.start) moveTo(final.key, final.start)
      if (final.mode === 'resize' && final.minutes !== current.target.minutes) resize(final.key, final.minutes)
    }
    // Esc puts everything back, changing nothing.
    const key = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      stop()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', stop)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', stop)
      window.removeEventListener('keydown', key)
    }
  }, [active, place, show])

  return {
    preview,
    /** Drags a task or a break from the side list (PLAN-04, PLAN-15). */
    startDrop: (event: ReactPointerEvent, item: DropItem) =>
      begin(event, { mode: 'drop', item, startX: event.clientX, startY: event.clientY, moved: false }),
    /** Moves a block of the draft (PLAN-05). */
    startMove: (event: ReactPointerEvent, target: PlanDragTarget) =>
      begin(event, { mode: 'move', target, startX: event.clientX, startY: event.clientY, moved: false }),
    /** Pulls the bottom edge of a block of the draft (PLAN-05). */
    startResize: (event: ReactPointerEvent, target: PlanDragTarget) =>
      begin(event, { mode: 'resize', target, startX: event.clientX, startY: event.clientY, moved: false }),
  }
}
