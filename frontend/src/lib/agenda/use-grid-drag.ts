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

/** A scheduled task to drag (US-6): its day, its start time and its length on the grid. */
export interface ScheduledTarget {
  taskId: string
  title: string
  /** The colour of its list, for the copy that follows the pointer. */
  color: number
  day: string
  /** `HH:MM`. */
  time: string
  /** The estimate, or 1h without one (D23). */
  length: number
}

/** A scheduled task while it is dragged: where it would go, and the pointer the copy follows (US-6, US-14). */
export interface ScheduledDraft {
  taskId: string
  title: string
  color: number
  /** Its schedule before the drag. */
  from: { day: string; time: string | null }
  length: number
  day: string
  /** The start over the grid, in minutes since the local midnight of `day`, in steps of 15 min. */
  start: number | null
  x: number
  y: number
}

/** A scheduled task released at a new day or time (US-6, US-14). */
export interface ScheduledDrop {
  taskId: string
  day: string
  /** `HH:MM`, or null when released over the `Sem hora` row. */
  time: string | null
  from: { day: string; time: string | null }
}

/** What is under the pointer: a column of the grid, with the top of the column on the screen. */
export type DropZone = { day: string; untimed: false; top: number } | { day: string; untimed: true }

export interface GridDragOptions {
  pxPerMinute: number
  snapMinutes?: number
  /** The latest minute a session may end on `day`: 1440 for a past day, now for today, 0 for a future day (AGENDA-23). */
  limit: (day: string) => number
  /** The day of the column under `clientX`, to move a block to another day (AGENDA-30); absent keeps the day. */
  dayAt?: (clientX: number) => string | null
  /** Called when the pointer is released with the final draft. */
  onCommit: (draft: Draft) => void
  /** A scheduled task released at a new place; absent, scheduled tasks do not move (US-6). */
  onScheduledDrop?: (drop: ScheduledDrop) => void
  /** The zone under the pointer; absent, the column the gesture began on, on the day of `dayAt`. */
  zoneAt?: (clientX: number, clientY: number) => DropZone | null
}

const MAX_MINUTES = DAY_MINUTES

/** `HH:MM` of a minute of the day. */
const clockOf = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
const minuteOfClock = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours! * 60 + minutes!
}

interface ScheduledGesture {
  target: { taskId: string; title: string; color: number; from: { day: string; time: string | null }; length: number }
  /** Top of the column the gesture began on. */
  columnTop: number
  /** Minutes between the start of the block and the pointer. */
  grab: number
  startX: number
  startY: number
  moved: boolean
}

interface Gesture {
  mode: DragMode
  target: DragTarget
  /** Top of the day column on the screen. */
  columnTop: number
  /** The minute under the pointer when the gesture began. */
  grab: number
  /** Where the pointer went down, to tell a click from a drag. */
  startX: number
  startY: number
  moved: boolean
  /** The draft before the gesture: a pending new time stays when the block is released in place. */
  before: Draft | null
}

/** A click: the pointer travelled less than this, in px, before it was released. */
const CLICK_TOLERANCE = 3
/** What a click on empty time creates, in minutes (ADJ-10). */
const CLICK_MINUTES = 60

/** Drops the next click, if it comes before the browser is idle again. */
function swallowNextClick() {
  const swallow = (event: MouseEvent) => {
    event.stopPropagation()
    event.preventDefault()
  }
  window.addEventListener('click', swallow, { capture: true, once: true })
  window.setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0)
}

const columnTopOf = (event: ReactPointerEvent) => {
  const element = event.currentTarget as HTMLElement
  return (element.closest('[data-agenda-column]') ?? element).getBoundingClientRect().top
}

/**
 * Pointer gestures on the agenda grid: drag over empty time to create (AGENDA-14), or click it for an hour
 * (ADJ-10), pull the top or the bottom edge (AGENDA-18, AGENDA-29) and move a whole block, saved or new
 * (AGENDA-30, ADJ-12). Everything snaps to 15 min, never ends after now and lasts from 1 min to 24 h.
 */
export function useGridDrag({ pxPerMinute, snapMinutes = 15, limit, dayAt, onCommit, onScheduledDrop, zoneAt }: GridDragOptions) {
  const [draft, setDraft] = useState<Draft | null>(null)
  const gesture = useRef<Gesture | null>(null)
  const latest = useRef<Draft | null>(null)
  const options = useRef({ pxPerMinute, snapMinutes, limit, dayAt, onCommit, onScheduledDrop, zoneAt })
  useEffect(() => {
    options.current = { pxPerMinute, snapMinutes, limit, dayAt, onCommit, onScheduledDrop, zoneAt }
  })
  const [scheduledDraft, setScheduledDraft] = useState<ScheduledDraft | null>(null)
  const scheduledGesture = useRef<ScheduledGesture | null>(null)
  const latestScheduled = useRef<ScheduledDraft | null>(null)
  const [movingScheduled, setMovingScheduled] = useState(false)
  const showScheduled = useCallback((next: ScheduledDraft | null) => {
    latestScheduled.current = next
    setScheduledDraft(next)
  }, [])
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
      const current: Gesture = {
        mode,
        target,
        columnTop,
        grab: (event.clientY - columnTop) / options.current.pxPerMinute,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
        before: latest.current,
      }
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
      if (Math.abs(event.clientX - current.startX) >= CLICK_TOLERANCE || Math.abs(event.clientY - current.startY) >= CLICK_TOLERANCE) {
        current.moved = true
      }
      const next = place(current, event.clientX, event.clientY)
      if (next === null) return
      show(next)
    }
    const up = () => {
      const current = gesture.current
      gesture.current = null
      setDragging(false)
      // The click the browser fires after a drag is not a click on the block (ADJ-06).
      if (current?.moved) swallowNextClick()
      let final = latest.current
      if (!current || !final) return
      if (current.mode === 'create' && !current.moved) {
        // A click creates an hour, cut at now on today and at midnight (ADJ-10).
        const { limit: limitOf, snapMinutes: step } = options.current
        const cap = Math.floor(Math.min(limitOf(final.day), DAY_MINUTES) / step) * step
        final = { ...final, end: Math.max(final.end, Math.min(cap, final.start + CLICK_MINUTES)) }
        show(final)
      }
      const changed = final.day !== current.target.day || final.start !== current.target.start || final.end !== current.target.end
      if (current.mode === 'create' || changed) options.current.onCommit(final)
      // A saved session released at a new time stays drawn there until the page saves or drops it (ADJ-01, ADJ-02);
      // released in place, nothing is pending. The draft of a new session stays for the panel.
      if (final.sessionId !== null && !changed) show(current.before?.sessionId === final.sessionId ? current.before : null)
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

  /**
   * Where a scheduled task goes with the pointer at `clientX`/`clientY`: the column under it, at the pointer less the
   * grab, in steps of 15 min within the day, in the past or the future alike (US-6); null where it cannot go.
   */
  const placeScheduled = useCallback((current: ScheduledGesture, clientX: number, clientY: number): ScheduledDraft | null => {
    const { pxPerMinute: px, snapMinutes: step, dayAt: dayOf, zoneAt: zoneOf } = options.current
    const zone: DropZone | null = zoneOf
      ? zoneOf(clientX, clientY)
      : { day: dayOf?.(clientX) ?? current.target.from.day, untimed: false, top: current.columnTop }
    if (zone === null || zone.untimed) return null
    const pointer = (clientY - zone.top) / px
    const start = Math.min(DAY_MINUTES - step, Math.max(0, Math.round((pointer - current.grab) / step) * step))
    return { ...current.target, day: zone.day, start, x: clientX, y: clientY }
  }, [])

  const beginScheduled = useCallback(
    (event: ReactPointerEvent, target: ScheduledTarget) => {
      if (event.button !== 0 || !options.current.onScheduledDrop) return
      event.stopPropagation()
      const columnTop = columnTopOf(event)
      const start = minuteOfClock(target.time)
      const { taskId, title, color, length } = target
      scheduledGesture.current = {
        target: { taskId, title, color, length, from: { day: target.day, time: target.time } },
        columnTop,
        grab: (event.clientY - columnTop) / options.current.pxPerMinute - start,
        startX: event.clientX,
        startY: event.clientY,
        moved: false,
      }
      showScheduled({ taskId, title, color, length, from: { day: target.day, time: target.time }, day: target.day, start, x: event.clientX, y: event.clientY })
      setMovingScheduled(true)
    },
    [showScheduled],
  )

  useEffect(() => {
    if (!movingScheduled) return
    const move = (event: PointerEvent) => {
      const current = scheduledGesture.current
      if (!current) return
      if (Math.abs(event.clientX - current.startX) >= CLICK_TOLERANCE || Math.abs(event.clientY - current.startY) >= CLICK_TOLERANCE) {
        current.moved = true
      }
      const next = placeScheduled(current, event.clientX, event.clientY)
      showScheduled(next ?? { ...latestScheduled.current!, x: event.clientX, y: event.clientY })
    }
    const up = () => {
      const current = scheduledGesture.current
      const final = latestScheduled.current
      scheduledGesture.current = null
      setMovingScheduled(false)
      showScheduled(null)
      // A press without a move is a click on the block: it opens the task.
      if (!current?.moved || !final) return
      swallowNextClick()
      const time = final.start === null ? null : clockOf(final.start)
      if (final.day === final.from.day && time === final.from.time) return
      options.current.onScheduledDrop?.({ taskId: final.taskId, day: final.day, time, from: final.from })
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [movingScheduled, placeScheduled, showScheduled])

  return {
    draft,
    dragging,
    /** The scheduled task being dragged, or null (US-6, US-14). */
    scheduledDraft,
    /** Whether scheduled tasks can be dragged: the page saves where they are released. */
    schedulable: onScheduledDrop !== undefined,
    /** Drags a scheduled block to another day or time, in the future too; sessions keep AGENDA-23 (US-6). */
    startMoveScheduled: beginScheduled,
    /**
     * Sets the draft from the panel fields (AGENDA-17), or clears it with null (AGENDA-26). A saved session released at
     * a new time keeps its draft until this clears it (ADJ-01).
     */
    setDraft: show,
    startCreate: (event: ReactPointerEvent, day: string) =>
      begin(event, 'create', { day, start: 0, end: 0, sessionId: null }),
    startResize: (event: ReactPointerEvent, edge: 'top' | 'bottom', target: DragTarget) => begin(event, edge, target),
    startMove: (event: ReactPointerEvent, target: DragTarget) => begin(event, 'move', target),
  }
}
