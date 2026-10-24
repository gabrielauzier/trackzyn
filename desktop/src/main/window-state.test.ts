import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { resolveWindowBounds, trackWindowState, windowOptions } from './window-state'

const screen = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
const saved = { x: 100, y: 80, width: 1000, height: 700 }

describe('window state', () => {
  it('restores saved bounds', () => {
    expect(resolveWindowBounds(saved, [screen])).toEqual({ ...saved, center: false })
    // A second monitor to the right counts as present.
    const right = { x: 2000, y: 100, width: 1100, height: 750 }
    const second = { workArea: { x: 1920, y: 0, width: 1920, height: 1080 } }
    expect(resolveWindowBounds(right, [screen, second])).toEqual({ ...right, center: false })
  })

  it('falls back to centered 1280x800 when the display is gone', () => {
    const gone = { x: 2400, y: 100, width: 1100, height: 750 }
    expect(resolveWindowBounds(gone, [screen])).toEqual({ width: 1280, height: 800, center: true })
    for (const garbage of [null, undefined, 'x', {}, { x: 1, y: 1, width: 'a', height: 5 }, { x: NaN, y: 0, width: 900, height: 700 }]) {
      expect(resolveWindowBounds(garbage, [screen]), String(garbage)).toEqual({ width: 1280, height: 800, center: true })
    }
  })

  it('never opens smaller than 800x600', () => {
    const options = windowOptions({ platform: 'linux', bounds: resolveWindowBounds({ x: 0, y: 0, width: 300, height: 200 }, [screen]) })
    expect(options.minWidth).toBe(800)
    expect(options.minHeight).toBe(600)
    expect(options.width).toBeGreaterThanOrEqual(800)
    expect(options.height).toBeGreaterThanOrEqual(600)
  })

  it('uses hiddenInset on macOS only', () => {
    const bounds = resolveWindowBounds(null, [screen])
    expect(windowOptions({ platform: 'darwin', bounds }).titleBarStyle).toBe('hiddenInset')
    expect(windowOptions({ platform: 'win32', bounds }).titleBarStyle).toBeUndefined()
    expect(windowOptions({ platform: 'linux', bounds }).titleBarStyle).toBeUndefined()
  })

  it('saves the bounds on close and shortly after a move', () => {
    vi.useFakeTimers()
    const win = Object.assign(new EventEmitter(), { getNormalBounds: vi.fn(() => saved) })
    const store = { setBounds: vi.fn() }
    trackWindowState(win, store, 500)

    win.emit('move')
    win.emit('resize')
    expect(store.setBounds).not.toHaveBeenCalled()
    vi.advanceTimersByTime(500)
    expect(store.setBounds).toHaveBeenCalledTimes(1)
    expect(store.setBounds).toHaveBeenCalledWith(saved)

    win.emit('close')
    expect(store.setBounds).toHaveBeenCalledTimes(2)
    vi.useRealTimers()
  })
})
