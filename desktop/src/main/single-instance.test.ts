import { describe, expect, it, vi } from 'vitest'
import { setupSingleInstance } from './single-instance'

function fakeApp(lock: boolean) {
  const listeners: Record<string, () => void> = {}
  return {
    requestSingleInstanceLock: vi.fn(() => lock),
    on: vi.fn((event: string, cb: () => void) => {
      listeners[event] = cb
    }),
    emit: (event: string) => listeners[event]?.(),
  }
}

describe('single instance', () => {
  it('restores a minimized window and focuses it', () => {
    const app = fakeApp(true)
    const win = { isMinimized: vi.fn(() => true), restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    expect(setupSingleInstance(app, () => win)).toBe(true)
    app.emit('second-instance')
    expect(win.restore).toHaveBeenCalledTimes(1)
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('only focuses a window that is not minimized', () => {
    const app = fakeApp(true)
    const win = { isMinimized: vi.fn(() => false), restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
    setupSingleInstance(app, () => win)
    app.emit('second-instance')
    expect(win.restore).not.toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalledTimes(1)
  })

  it('ignores a second instance when there is no window yet', () => {
    const app = fakeApp(true)
    setupSingleInstance(app, () => null)
    expect(() => app.emit('second-instance')).not.toThrow()
  })

  it('reports that this process must quit when the lock is held elsewhere', () => {
    const app = fakeApp(false)
    expect(setupSingleInstance(app, () => null)).toBe(false)
    expect(app.on).not.toHaveBeenCalled()
  })
})
