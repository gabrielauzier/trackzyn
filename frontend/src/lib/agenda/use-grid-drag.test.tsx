import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useGridDrag, type Draft, type DragTarget } from './use-grid-drag'

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
})
