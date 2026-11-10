import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import type { DropItem } from './draft'
import { usePlanDrag, type PlanDragTarget } from './use-plan-drag'

const at = (hours: number, minutes = 0) => hours * 60 + minutes
const list = { id: 'l1', name: 'Work', color: 3 }
const taskItem: DropItem = { kind: 'task', task: { id: 't1', title: 'Write', list, done: false, scheduled_on: null, estimate_minutes: null } }
const coffee: DropItem = { kind: 'break', name: 'Café', minutes: 15, list }
const block: PlanDragTarget = { key: 'b1', start: at(10), minutes: 60 }

/** The side list at x 0..99 and the plan column at x 100..299 from the top of the screen, `px` per minute. */
function Plan({ px, onDrop, onMove, onResize }: { px: number; onDrop: () => void; onMove: () => void; onResize: () => void }) {
  const drag = usePlanDrag({ pxPerMinute: px, onDrop, onMove, onResize })
  const preview = drag.preview
  return (
    <div>
      <div data-testid="task" onPointerDown={(event) => drag.startDrop(event, taskItem)} />
      <div data-testid="coffee" onPointerDown={(event) => drag.startDrop(event, coffee)} />
      <div data-plan-column data-testid="column" style={{ height: 1440 * px }}>
        <div data-testid="block" onPointerDown={(event) => drag.startMove(event, block)}>
          <div data-testid="bottom" onPointerDown={(event) => drag.startResize(event, block)} />
        </div>
      </div>
      {preview && <output data-testid="preview">{preview.mode === 'drop' ? `${preview.start}` : `${preview.start}+${preview.minutes}`}</output>}
    </div>
  )
}

function setup(px = 1) {
  const handlers = { onDrop: vi.fn(), onMove: vi.fn(), onResize: vi.fn() }
  render(<Plan px={px} {...handlers} />)
  return handlers
}

beforeEach(() => {
  // jsdom lays nothing out: the plan column is 200 px wide from x 100, its top at the top of the screen.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-plan-column')) return DOMRect.fromRect({ x: 100, y: 0, width: 200, height: 1440 * 10 })
    return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const press = (element: HTMLElement, clientX: number, clientY: number) => fireEvent.pointerDown(element, { clientX, clientY, button: 0 })
const moveTo = (clientX: number, clientY: number) => fireEvent.pointerMove(window, { clientX, clientY })
const release = (clientX: number, clientY: number) => fireEvent.pointerUp(window, { clientX, clientY })

describe('usePlanDrag dropping from the side list (PLAN-04, PLAN-15)', () => {
  it('creates the block at 10:30 when the pointer is released at 10:37', () => {
    const { onDrop } = setup()
    press(screen.getByTestId('task'), 10, 10)
    moveTo(150, at(10, 37))
    expect(screen.getByTestId('preview')).toHaveTextContent(`${at(10, 30)}`)
    release(150, at(10, 37))

    expect(onDrop).toHaveBeenCalledExactlyOnceWith(taskItem, at(10, 30))
  })

  it('drops a break the same way, at the scale of the agenda', () => {
    const { onDrop } = setup(PX_PER_MINUTE)
    press(screen.getByTestId('coffee'), 10, 10)
    moveTo(150, at(12, 8) * PX_PER_MINUTE)
    release(150, at(12, 8) * PX_PER_MINUTE)

    expect(onDrop).toHaveBeenCalledExactlyOnceWith(coffee, at(12))
  })

  it('creates nothing when released off the grid', () => {
    const { onDrop } = setup()
    press(screen.getByTestId('task'), 10, 10)
    moveTo(150, at(10))
    moveTo(50, at(10))
    release(50, at(10))

    expect(onDrop).not.toHaveBeenCalled()
    expect(screen.queryByTestId('preview')).toBeNull()
  })

  it('cancels with Esc: the release then creates nothing', () => {
    const { onDrop } = setup()
    press(screen.getByTestId('task'), 10, 10)
    moveTo(150, at(10))
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    expect(screen.queryByTestId('preview')).toBeNull()
    release(150, at(10))

    expect(onDrop).not.toHaveBeenCalled()
  })
})

describe('usePlanDrag moving and pulling a block (PLAN-05)', () => {
  it('moves a block dragged 50 px at the scale of the agenda by one step of 15 min', () => {
    const { onMove } = setup(PX_PER_MINUTE)
    press(screen.getByTestId('block'), 150, at(10, 20) * PX_PER_MINUTE)
    moveTo(150, at(10, 20) * PX_PER_MINUTE + 50)
    release(150, at(10, 20) * PX_PER_MINUTE + 50)

    // 50 px are 20.8 min at 2.4 px per minute: the nearest step is 10:15.
    expect(onMove).toHaveBeenCalledExactlyOnceWith('b1', at(10, 15))
  })

  it('moves a block dragged 50 px at 1 px per minute to 10:45', () => {
    const { onMove } = setup()
    press(screen.getByTestId('block'), 150, at(10, 20))
    moveTo(150, at(10, 20) + 50)
    release(150, at(10, 20) + 50)

    expect(onMove).toHaveBeenCalledExactlyOnceWith('b1', at(10, 45))
  })

  it('pulls the bottom edge to the nearest quarter', () => {
    const { onResize, onMove } = setup()
    press(screen.getByTestId('bottom'), 150, at(11))
    moveTo(150, at(11, 32))
    release(150, at(11, 32))

    expect(onResize).toHaveBeenCalledExactlyOnceWith('b1', 90)
    expect(onMove).not.toHaveBeenCalled()
  })

  it('keeps a pulled block at least one step long', () => {
    const { onResize } = setup()
    press(screen.getByTestId('bottom'), 150, at(11))
    moveTo(150, at(9))
    release(150, at(9))

    expect(onResize).toHaveBeenCalledExactlyOnceWith('b1', 15)
  })

  it('cancels a move with Esc', () => {
    const { onMove } = setup()
    press(screen.getByTestId('block'), 150, at(10, 20))
    moveTo(150, at(12))
    act(() => {
      fireEvent.keyDown(window, { key: 'Escape' })
    })
    release(150, at(12))

    expect(onMove).not.toHaveBeenCalled()
  })

  it('takes a press without a move as a click, changing nothing', () => {
    const { onMove } = setup()
    press(screen.getByTestId('block'), 150, at(10, 20))
    release(150, at(10, 20))

    expect(onMove).not.toHaveBeenCalled()
  })
})
