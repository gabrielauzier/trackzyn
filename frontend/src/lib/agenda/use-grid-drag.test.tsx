import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useGridDrag, type Draft, type DragTarget, type ScheduledDrop, type ScheduledTarget } from './use-grid-drag'

const DAY = '2026-11-03'
const at = (hours: number, minutes: number) => hours * 60 + minutes

/**
 * A one-day column at the top of the screen with 1 px per minute, so a pointer at `clientY` is that
 * minute of the day.
 */
function Column({
  limit,
  onCommit,
  block,
  limitOf,
  dayAt,
}: {
  limit: number
  onCommit: (draft: Draft) => void
  block?: DragTarget
  /** The limit of each day, when the days differ; `limit` for every day otherwise. */
  limitOf?: (day: string) => number
  /** The day under the pointer, to move a block to another day. */
  dayAt?: (clientX: number) => string | null
}) {
  const drag = useGridDrag({ pxPerMinute: 1, limit: limitOf ?? (() => limit), dayAt, onCommit })
  return (
    <div data-agenda-column data-testid="column" onPointerDown={(event) => drag.startCreate(event, DAY)}>
      {block && (
        <div data-testid="block" onPointerDown={(event) => drag.startMove(event, block)}>
          <div data-testid="top" onPointerDown={(event) => drag.startResize(event, 'top', block)} />
          <div data-testid="bottom" onPointerDown={(event) => drag.startResize(event, 'bottom', block)} />
        </div>
      )}
      {drag.draft && <output data-testid="draft">{`${drag.draft.start}-${drag.draft.end}`}</output>}
    </div>
  )
}

function drag(element: HTMLElement, from: number, to: number, toX = 0) {
  fireEvent.pointerDown(element, { clientX: 0, clientY: from, button: 0 })
  fireEvent.pointerMove(window, { clientX: toX, clientY: to })
  fireEvent.pointerUp(window, { clientX: toX, clientY: to })
}

const oneHour: DragTarget = { day: DAY, start: at(14, 0), end: at(15, 0), sessionId: 's1' }

describe('useGridDrag', () => {
  it('snaps a drag from 17:32 to 18:41 to the draft 17:30 – 18:45 (AGENDA-14)', () => {
    const onCommit = vi.fn()
    render(<Column limit={24 * 60} onCommit={onCommit} />)
    drag(screen.getByTestId('column'), at(17, 32), at(18, 41))
    expect(onCommit).toHaveBeenCalledWith({ mode: 'create', day: DAY, start: at(17, 30), end: at(18, 45), sessionId: null })
    expect(screen.getByTestId('draft')).toHaveTextContent(`${at(17, 30)}-${at(18, 45)}`)
  })

  it('stops a drag past now at the last step before now (AGENDA-23)', () => {
    const onCommit = vi.fn()
    render(<Column limit={at(14, 7)} onCommit={onCommit} />)
    drag(screen.getByTestId('column'), at(13, 10), at(15, 0))
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ start: at(13, 0), end: at(14, 0) }))
  })

  it('takes no drag that starts after now (AGENDA-23)', () => {
    const onCommit = vi.fn()
    render(<Column limit={at(14, 7)} onCommit={onCommit} />)
    drag(screen.getByTestId('column'), at(15, 0), at(16, 0))
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.queryByTestId('draft')).toBeNull()
  })

  it('moves a block of 1 h keeping 1 h, snapped to 15 min (AGENDA-30)', () => {
    const onCommit = vi.fn()
    render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} />)
    drag(screen.getByTestId('block'), at(14, 10), at(15, 27))
    expect(onCommit).toHaveBeenCalledWith({ mode: 'move', day: DAY, start: at(15, 15), end: at(16, 15), sessionId: 's1' })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('moves a block to the day under the pointer, keeping 1 h (AGENDA-30)', () => {
    const onCommit = vi.fn()
    // The column under x = 300 is Wednesday.
    const dayAt = (clientX: number) => (clientX >= 200 ? '2026-11-04' : DAY)
    render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} dayAt={dayAt} />)
    drag(screen.getByTestId('block'), at(14, 10), at(9, 10), 300)
    expect(onCommit).toHaveBeenCalledWith({ mode: 'move', day: '2026-11-04', start: at(9, 0), end: at(10, 0), sessionId: 's1' })
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('does not move a block to a day that has not begun (AGENDA-23, AGENDA-30)', () => {
    const onCommit = vi.fn()
    const limitOf = (day: string) => (day === '2026-11-05' ? 0 : 24 * 60)
    render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} limitOf={limitOf} dayAt={() => '2026-11-05'} />)
    drag(screen.getByTestId('block'), at(14, 10), at(9, 10), 300)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('pulls the bottom edge from 15:00 to 15:30 (AGENDA-29)', () => {
    const onCommit = vi.fn()
    render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} />)
    drag(screen.getByTestId('bottom'), at(15, 0), at(15, 32))
    expect(onCommit).toHaveBeenCalledWith({ mode: 'bottom', day: DAY, start: at(14, 0), end: at(15, 30), sessionId: 's1' })
  })

  it('pulls the top edge in steps of 15 min (AGENDA-18)', () => {
    const onCommit = vi.fn()
    render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} />)
    drag(screen.getByTestId('top'), at(14, 0), at(13, 41))
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'top', start: at(13, 45), end: at(15, 0) }))
  })

  it('keeps an edge pulled past the other one at least one step long (AGENDA-29)', () => {
    const onCommit = vi.fn()
    render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} />)
    drag(screen.getByTestId('bottom'), at(15, 0), at(12, 0))
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ start: at(14, 0), end: at(14, 15) }))
  })

  it('does not end a pulled edge after now (AGENDA-29)', () => {
    const onCommit = vi.fn()
    render(<Column limit={at(15, 40)} onCommit={onCommit} block={oneHour} />)
    drag(screen.getByTestId('bottom'), at(15, 0), at(17, 0))
    expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ end: at(15, 30) }))
  })

  it('saves nothing when a block is pressed and released in place', () => {
    const onCommit = vi.fn()
    render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} />)
    drag(screen.getByTestId('block'), at(14, 30), at(14, 30))
    expect(onCommit).not.toHaveBeenCalled()
  })
  describe('#29', () => {
    const click = (element: HTMLElement, y: number) => {
      fireEvent.pointerDown(element, { clientX: 0, clientY: y, button: 0 })
      fireEvent.pointerUp(window, { clientX: 0, clientY: y })
    }

    it('ADJ-10 creates one hour from the quarter hour clicked, at 10:07 of a past day', () => {
      const onCommit = vi.fn()
      render(<Column limit={24 * 60} onCommit={onCommit} />)
      click(screen.getByTestId('column'), at(10, 7))
      expect(onCommit).toHaveBeenCalledWith({ mode: 'create', day: DAY, start: at(10, 0), end: at(11, 0), sessionId: null })
      expect(screen.getByTestId('draft')).toHaveTextContent(`${at(10, 0)}-${at(11, 0)}`)
    })

    it('ADJ-10 cuts the hour at midnight', () => {
      const onCommit = vi.fn()
      render(<Column limit={24 * 60} onCommit={onCommit} />)
      click(screen.getByTestId('column'), at(23, 30))
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ start: at(23, 30), end: 24 * 60 }))
    })

    it('ADJ-10 cuts the hour at the quarter hour of now on today', () => {
      const onCommit = vi.fn()
      // Now is 14:07: a click at 13:40 runs to 14:00.
      render(<Column limit={at(14, 7)} onCommit={onCommit} />)
      click(screen.getByTestId('column'), at(13, 40))
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ start: at(13, 30), end: at(14, 0) }))
    })

    it('ADJ-10 creates one hour for a click whose pointer shakes less than 3 px', () => {
      const onCommit = vi.fn()
      render(<Column limit={24 * 60} onCommit={onCommit} />)
      fireEvent.pointerDown(screen.getByTestId('column'), { clientX: 0, clientY: at(10, 7), button: 0 })
      fireEvent.pointerMove(window, { clientX: 1, clientY: at(10, 7) + 2 })
      fireEvent.pointerUp(window, { clientX: 1, clientY: at(10, 7) + 2 })
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ start: at(10, 0), end: at(11, 0) }))
    })

    it('ADJ-11 still draws a drag of 10:00 to 10:40 in steps of 15 min', () => {
      const onCommit = vi.fn()
      render(<Column limit={24 * 60} onCommit={onCommit} />)
      drag(screen.getByTestId('column'), at(10, 0), at(10, 40))
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ start: at(10, 0), end: at(10, 45) }))
    })

    const newDraft: DragTarget = { day: DAY, start: at(10, 0), end: at(11, 0), sessionId: null }

    it('ADJ-12 moves the new session two hours down, keeping one hour', () => {
      const onCommit = vi.fn()
      render(<Column limit={24 * 60} onCommit={onCommit} block={newDraft} />)
      drag(screen.getByTestId('block'), at(10, 10), at(12, 10))
      expect(onCommit).toHaveBeenCalledWith({ mode: 'move', day: DAY, start: at(12, 0), end: at(13, 0), sessionId: null })
      expect(screen.getByTestId('draft')).toHaveTextContent(`${at(12, 0)}-${at(13, 0)}`)
    })

    it('ADJ-12 moves the new session to the day under the pointer', () => {
      const onCommit = vi.fn()
      render(<Column limit={24 * 60} onCommit={onCommit} block={newDraft} dayAt={() => '2026-11-02'} />)
      drag(screen.getByTestId('block'), at(10, 10), at(9, 10), 300)
      expect(onCommit).toHaveBeenCalledWith({ mode: 'move', day: '2026-11-02', start: at(9, 0), end: at(10, 0), sessionId: null })
    })

    it('ADJ-12 never moves the new session past the limit of the day', () => {
      const onCommit = vi.fn()
      render(<Column limit={at(14, 7)} onCommit={onCommit} block={newDraft} />)
      drag(screen.getByTestId('block'), at(10, 10), at(18, 0))
      expect(onCommit).toHaveBeenCalledWith(expect.objectContaining({ start: at(13, 0), end: at(14, 0) }))
    })

    it('ADJ-01 ADJ-02 keeps a saved session released at a new time drawn there, for the page to save or drop', () => {
      const onCommit = vi.fn()
      render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} />)
      drag(screen.getByTestId('block'), at(14, 10), at(16, 10))
      expect(onCommit).toHaveBeenCalledWith({ mode: 'move', day: DAY, start: at(16, 0), end: at(17, 0), sessionId: 's1' })
      expect(screen.getByTestId('draft')).toHaveTextContent(`${at(16, 0)}-${at(17, 0)}`)
    })

    it('ADJ-06 keeps a pending new time when its block is pressed and released in place', () => {
      const onCommit = vi.fn()
      const { rerender } = render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} />)
      drag(screen.getByTestId('block'), at(14, 10), at(16, 10))
      // The page draws the block at its pending time; a click on it starts and ends there.
      rerender(<Column limit={24 * 60} onCommit={onCommit} block={{ ...oneHour, start: at(16, 0), end: at(17, 0) }} />)
      drag(screen.getByTestId('block'), at(16, 10), at(16, 10))
      expect(onCommit).toHaveBeenCalledTimes(1)
      expect(screen.getByTestId('draft')).toHaveTextContent(`${at(16, 0)}-${at(17, 0)}`)
    })

    it('leaves nothing pending when a saved session is released in place', () => {
      const onCommit = vi.fn()
      render(<Column limit={24 * 60} onCommit={onCommit} block={oneHour} />)
      drag(screen.getByTestId('block'), at(14, 10), at(14, 10))
      expect(onCommit).not.toHaveBeenCalled()
      expect(screen.queryByTestId('draft')).toBeNull()
    })
  })

  describe('moveScheduled (US-6)', () => {
    const plan: ScheduledTarget = { taskId: 't1', title: 'Plan', color: 3, day: DAY, time: '14:00', length: 90 }

    /** A column with a scheduled block of 14:00 – 15:30 and the session of 14:00 – 15:00; nothing has begun on it yet. */
    function Scheduled({ onDrop, onCommit = vi.fn(), dayAt }: { onDrop?: (drop: ScheduledDrop) => void; onCommit?: (draft: Draft) => void; dayAt?: (clientX: number) => string | null }) {
      // A future day: no session may be on it (AGENDA-23).
      const drag = useGridDrag({ pxPerMinute: 1, limit: () => 0, dayAt, onCommit, onScheduledDrop: onDrop })
      return (
        <div data-agenda-column data-testid="column" onPointerDown={(event) => drag.startCreate(event, DAY)}>
          <div data-testid="scheduled" onPointerDown={(event) => drag.startMoveScheduled(event, plan)} />
          <div data-testid="block" onPointerDown={(event) => drag.startMove(event, oneHour)} />
          {drag.scheduledDraft && (
            <output data-testid="scheduled-draft">{`${drag.scheduledDraft.day} ${drag.scheduledDraft.start} ${drag.scheduledDraft.x},${drag.scheduledDraft.y}`}</output>
          )}
        </div>
      )
    }

    it('moves the block to another day and time in steps of 15 min, in the future, keeping its length', () => {
      const onDrop = vi.fn()
      render(<Scheduled onDrop={onDrop} dayAt={(clientX) => (clientX >= 200 ? '2026-11-06' : DAY)} />)
      const block = screen.getByTestId('scheduled')
      fireEvent.pointerDown(block, { clientX: 0, clientY: at(14, 10), button: 0 })
      fireEvent.pointerMove(window, { clientX: 300, clientY: at(9, 17) })
      // While it moves, the draft keeps the 90 min from the new start and follows the pointer.
      expect(screen.getByTestId('scheduled-draft')).toHaveTextContent(`2026-11-06 ${at(9, 0)} 300,${at(9, 17)}`)
      fireEvent.pointerUp(window, { clientX: 300, clientY: at(9, 17) })
      expect(onDrop).toHaveBeenCalledExactlyOnceWith({ taskId: 't1', day: '2026-11-06', time: '09:00', from: { day: DAY, time: '14:00' } })
      expect(screen.queryByTestId('scheduled-draft')).toBeNull()
    })

    it('snaps 16:22 to 16:15 on the same day', () => {
      const onDrop = vi.fn()
      render(<Scheduled onDrop={onDrop} />)
      drag(screen.getByTestId('scheduled'), at(14, 0), at(16, 22))
      expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ day: DAY, time: '16:15' }))
    })

    it('keeps the start within the day: dragged past midnight, it starts at 23:45', () => {
      const onDrop = vi.fn()
      render(<Scheduled onDrop={onDrop} />)
      drag(screen.getByTestId('scheduled'), at(14, 0), at(23, 59) + 300)
      expect(onDrop).toHaveBeenCalledWith(expect.objectContaining({ time: '23:45' }))
    })

    it('saves nothing for a press released in place: the click opens the task', () => {
      const onDrop = vi.fn()
      render(<Scheduled onDrop={onDrop} />)
      drag(screen.getByTestId('scheduled'), at(14, 10), at(14, 10))
      expect(onDrop).not.toHaveBeenCalled()
    })

    it('does not move a scheduled block where the page saves nothing, as for a viewer', () => {
      render(<Scheduled />)
      drag(screen.getByTestId('scheduled'), at(14, 0), at(16, 0))
      expect(screen.queryByTestId('scheduled-draft')).toBeNull()
    })

    it('AGENDA-23 still keeps a session out of a day that has not begun', () => {
      const onCommit = vi.fn()
      const onDrop = vi.fn()
      render(<Scheduled onDrop={onDrop} onCommit={onCommit} />)
      drag(screen.getByTestId('block'), at(14, 10), at(16, 10))
      expect(onCommit).not.toHaveBeenCalled()
      expect(onDrop).not.toHaveBeenCalled()
    })
  })
})
