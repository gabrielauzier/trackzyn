import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bounds } from './config-store'
import { WIDGET_HOVER_POLL_MS, trackWidgetHover } from './widget-hover'

class FakeWidget extends EventEmitter {
  destroyed = false
  sent: Array<[string, ...unknown[]]> = []
  bounds: Bounds = { x: 1000, y: 16, width: 300, height: 64 }
  webContents = Object.assign(new EventEmitter(), {
    send: (channel: string, ...args: unknown[]) => void this.sent.push([channel, ...args]),
  })
  getBounds() {
    return { ...this.bounds }
  }
  isDestroyed() {
    return this.destroyed
  }
}

let cursor = { x: 0, y: 0 }
const screen = { getCursorScreenPoint: () => ({ ...cursor }) }

beforeEach(() => {
  vi.useFakeTimers()
  cursor = { x: 0, y: 0 }
})

afterEach(() => {
  vi.useRealTimers()
})

const tick = () => vi.advanceTimersByTime(WIDGET_HOVER_POLL_MS)

describe('trackWidgetHover (#34)', () => {
  it('reports the cursor entering and leaving the widget bounds', () => {
    const win = new FakeWidget()
    trackWidgetHover(win, { screen })

    // Outside at first: told once, and not again while it stays out.
    tick()
    tick()
    expect(win.sent).toEqual([['widget:hover', { hovering: false }]])

    // Over the widget, at its corners included: one `hovering: true`.
    cursor = { x: 1000, y: 16 }
    tick()
    cursor = { x: 1299, y: 79 }
    tick()
    expect(win.sent.slice(1)).toEqual([['widget:hover', { hovering: true }]])

    // Past the right edge and the bottom edge: out again.
    cursor = { x: 1300, y: 40 }
    tick()
    cursor = { x: 1100, y: 80 }
    tick()
    expect(win.sent.slice(2)).toEqual([['widget:hover', { hovering: false }]])

    // A widget dragged under a cursor that did not move is entered too: the bounds are read each time.
    win.bounds = { ...win.bounds, x: 1000, y: 60 }
    tick()
    expect(win.sent.slice(3)).toEqual([['widget:hover', { hovering: true }]])
    // The poll is quick enough for the 150 ms the controls wait before hiding.
    expect(WIDGET_HOVER_POLL_MS).toBeLessThanOrEqual(50)
  })

  it('tells a page that loaded again the current state', () => {
    const win = new FakeWidget()
    cursor = { x: 1100, y: 40 }
    trackWidgetHover(win, { screen })
    tick()
    expect(win.sent).toEqual([['widget:hover', { hovering: true }]])

    win.webContents.emit('did-finish-load')
    tick()
    expect(win.sent).toEqual([
      ['widget:hover', { hovering: true }],
      ['widget:hover', { hovering: true }],
    ])
  })

  it('stops reading the cursor once the widget closes, or when stopped', () => {
    const read = vi.fn(() => ({ x: 0, y: 0 }))
    const win = new FakeWidget()
    trackWidgetHover(win, { screen: { getCursorScreenPoint: read } })
    tick()
    expect(read).toHaveBeenCalledTimes(1)

    win.destroyed = true
    win.emit('closed')
    tick()
    tick()
    expect(read).toHaveBeenCalledTimes(1)

    const other = new FakeWidget()
    const stop = trackWidgetHover(other, { screen: { getCursorScreenPoint: read } })
    tick()
    stop()
    tick()
    expect(read).toHaveBeenCalledTimes(2)
    expect(vi.getTimerCount()).toBe(0)
  })
})
