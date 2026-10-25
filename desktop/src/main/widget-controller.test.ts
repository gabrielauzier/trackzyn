import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Bounds } from './config-store'
import { createWidgetController } from './widget-controller'

/**
 * A BrowserWindow: `close()` runs the close listeners and then `closed`; minimize, restore and show
 * emit their events like Electron does.
 */
class FakeWindow extends EventEmitter {
  minimized = false
  destroyed = false
  focused = 0
  shown = 0
  loaded: string[] = []
  sent: Array<[string, ...unknown[]]> = []
  bounds: Bounds
  url: string
  webContents: EventEmitter & { send(channel: string, ...args: unknown[]): void; getURL(): string }

  constructor(bounds: Bounds, url = 'app://trackzyn/') {
    super()
    this.bounds = { ...bounds }
    this.url = url
    const contents = new EventEmitter() as FakeWindow['webContents']
    contents.send = (channel, ...args) => void this.sent.push([channel, ...args])
    contents.getURL = () => this.url
    this.webContents = contents
  }
  isMinimized() {
    return this.minimized
  }
  isDestroyed() {
    return this.destroyed
  }
  minimize() {
    this.minimized = true
    this.emit('minimize')
  }
  restore() {
    this.minimized = false
    this.emit('restore')
  }
  show() {
    this.shown += 1
    this.emit('show')
  }
  focus() {
    this.focused += 1
  }
  close() {
    this.emit('close', { preventDefault() {} })
    this.destroyed = true
    this.emit('closed')
  }
  getBounds() {
    return { ...this.bounds }
  }
  getNormalBounds() {
    return { ...this.bounds }
  }
  setSize(width: number, height: number) {
    this.bounds = { ...this.bounds, width, height }
    this.emit('resize')
  }
  /** The user drags the window. */
  moveTo(x: number, y: number) {
    this.bounds = { ...this.bounds, x, y }
    this.emit('move')
    this.emit('moved')
  }
  /** A navigation inside the page (pushState), as the router does. */
  navigateInPage(url: string) {
    this.url = url
    this.webContents.emit('did-navigate-in-page', {}, url)
  }
  loadURL(url: string) {
    this.loaded.push(url)
    this.url = url
    this.webContents.emit('did-navigate', {}, url)
    return Promise.resolve()
  }
}

const left = { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
const right = { workArea: { x: 1920, y: 0, width: 1440, height: 900 } }
const CORNER = { x: 1604, y: 16, width: 300, height: 64 }

function setup({ saved = null as Bounds | null, url = 'app://trackzyn/focus/list-1' } = {}) {
  const mainWindow = new FakeWindow({ x: 100, y: 100, width: 1280, height: 800 }, 'app://trackzyn/')
  // The page reaches the focus screen through the router, as in the app.
  mainWindow.navigateInPage(url)
  const widgets: FakeWindow[] = []
  const store = { saved, getWidgetBounds: vi.fn(() => store.saved), setWidgetBounds: vi.fn((bounds: Bounds) => void (store.saved = bounds)) }
  const screen = {
    getAllDisplays: () => [left, right],
    getDisplayMatching: vi.fn((rect: Bounds) => (rect.x >= 1920 ? right : left)),
  }
  const createWindow = vi.fn((bounds: Bounds) => {
    const widget = new FakeWindow(bounds, 'app://trackzyn/widget')
    widgets.push(widget)
    return widget
  })
  const controller = createWidgetController({ mainWindow, store, screen, createWindow })
  return { mainWindow, widgets, store, screen, createWindow, controller, widget: () => widgets.at(-1)! }
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('opening the focus widget (WIDGET-01, WIDGET-02, WIDGET-09, WIDGET-10)', () => {
  it('opens the widget at the top right corner of the main window screen and minimizes the main window', () => {
    const { controller, createWindow, mainWindow, widget, screen } = setup()
    expect(controller.isOpen()).toBe(false)
    controller.open()
    expect(createWindow.mock.calls).toEqual([[CORNER]])
    expect(screen.getDisplayMatching).toHaveBeenCalledWith({ x: 100, y: 100, width: 1280, height: 800 })
    expect(controller.isOpen()).toBe(true)
    expect(mainWindow.isMinimized()).toBe(true)
    expect(widget().isDestroyed()).toBe(false)
  })

  it('places the widget on the screen of the main window', () => {
    const { controller, createWindow, mainWindow } = setup()
    mainWindow.bounds = { x: 2000, y: 50, width: 1280, height: 800 }
    controller.open()
    expect(createWindow.mock.calls).toEqual([[{ x: 1920 + 1440 - 300 - 16, y: 16, width: 300, height: 64 }]])
  })

  it('opens at the saved position', () => {
    const { controller, createWindow } = setup({ saved: { x: 300, y: 400, width: 300, height: 64 } })
    controller.open()
    expect(createWindow.mock.calls).toEqual([[{ x: 300, y: 400, width: 300, height: 64 }]])
  })

  it('opening again while open creates no second widget and focuses the one there', () => {
    const { controller, createWindow, widget } = setup()
    controller.open()
    controller.open()
    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(widget().focused).toBe(1)
  })

  it('tells the main window the widget is open, and the widget once its page loads', () => {
    const { controller, mainWindow, widget } = setup()
    controller.open()
    expect(mainWindow.sent).toEqual([['widget:state', { open: true }]])
    widget().webContents.emit('did-finish-load')
    expect(widget().sent).toEqual([['widget:state', { open: true }]])
  })
})

describe('minimizing the main window (WIDGET-03)', () => {
  it('opens the widget when a task is in focus, counting or paused', () => {
    for (const state of [
      { active: true, running: true },
      { active: true, running: false },
    ]) {
      const { controller, mainWindow, createWindow } = setup()
      controller.setFocusState(state)
      mainWindow.minimize()
      expect(createWindow, JSON.stringify(state)).toHaveBeenCalledTimes(1)
      expect(controller.isOpen()).toBe(true)
    }
  })

  it('minimizes normally without a task in focus (edge case)', () => {
    for (const state of [undefined, { active: false, running: false }, null, 'x', { active: 'yes' }]) {
      const { controller, mainWindow, createWindow } = setup()
      if (state !== undefined) controller.setFocusState(state)
      mainWindow.minimize()
      expect(createWindow, JSON.stringify(state)).not.toHaveBeenCalled()
      expect(mainWindow.isMinimized()).toBe(true)
      expect(controller.focusActive()).toBe(false)
    }
  })

  it('stops opening once the focus ends', () => {
    const { controller, mainWindow, createWindow } = setup()
    controller.setFocusState({ active: true, running: true })
    controller.setFocusState({ active: false, running: false })
    mainWindow.minimize()
    expect(createWindow).not.toHaveBeenCalled()
  })
})

describe('closing the widget', () => {
  it('Expandir closes it and brings the main window back in front, on the focus screen (WIDGET-18)', () => {
    const { controller, mainWindow, widget } = setup()
    controller.open()
    controller.close('expand')
    expect(widget().isDestroyed()).toBe(true)
    expect(controller.isOpen()).toBe(false)
    expect(mainWindow.isMinimized()).toBe(false)
    expect(mainWindow.shown).toBe(1)
    expect(mainWindow.focused).toBe(1)
    // Already on the focus screen: the page is not reloaded.
    expect(mainWindow.loaded).toEqual([])
    expect(mainWindow.sent.at(-1)).toEqual(['widget:state', { open: false }])
  })

  it('Expandir goes back to the last focus screen when the main window was left elsewhere (WIDGET-18)', () => {
    const { controller, mainWindow } = setup()
    mainWindow.navigateInPage('app://trackzyn/lists/list-1')
    controller.setFocusState({ active: true, running: true })
    mainWindow.minimize()
    controller.close('expand')
    expect(mainWindow.loaded).toEqual(['app://trackzyn/focus/list-1'])
    expect(mainWindow.focused).toBe(1)
  })

  it('Expandir without any focus screen visited keeps the page', () => {
    const { controller, mainWindow } = setup({ url: 'app://trackzyn/lists/list-1' })
    controller.open()
    controller.close('expand')
    expect(mainWindow.loaded).toEqual([])
    expect(mainWindow.focused).toBe(1)
  })

  it('a task leaving Today closes it and shows the board of the focus list (WIDGET-17)', () => {
    const { controller, mainWindow, widget } = setup()
    controller.open()
    controller.close('task_left')
    expect(widget().isDestroyed()).toBe(true)
    expect(mainWindow.isMinimized()).toBe(false)
    expect(mainWindow.focused).toBe(1)
    expect(mainWindow.loaded).toEqual(['app://trackzyn/lists/list-1'])
  })

  it('a task leaving Today with no focus screen known shows the home page (WIDGET-17)', () => {
    const { controller, mainWindow } = setup({ url: 'app://trackzyn/' })
    controller.open()
    controller.close('task_left')
    expect(mainWindow.loaded).toEqual(['app://trackzyn/'])
  })

  it('restoring the main window from the taskbar or the Dock closes the widget, and nothing else (WIDGET-19)', () => {
    for (const event of ['restore', 'show'] as const) {
      const { controller, mainWindow, widget } = setup()
      controller.open()
      if (event === 'restore') mainWindow.restore()
      else mainWindow.show()
      expect(widget().isDestroyed(), event).toBe(true)
      expect(controller.isOpen(), event).toBe(false)
      expect(mainWindow.focused, event).toBe(0)
      expect(mainWindow.loaded, event).toEqual([])
      expect(mainWindow.sent.at(-1), event).toEqual(['widget:state', { open: false }])
    }
  })

  it('close(restore) does not bring the main window back', () => {
    const { controller, mainWindow } = setup()
    controller.open()
    controller.close('restore')
    expect(controller.isOpen()).toBe(false)
    expect(mainWindow.isMinimized()).toBe(true)
    expect(mainWindow.focused).toBe(0)
  })

  it('closing it through the system (Cmd+W, Alt+F4) does what Expandir does, without ending the session (WIDGET-21)', () => {
    const { controller, mainWindow, widget } = setup()
    controller.open()
    widget().close()
    expect(controller.isOpen()).toBe(false)
    expect(mainWindow.isMinimized()).toBe(false)
    expect(mainWindow.focused).toBe(1)
    expect(mainWindow.loaded).toEqual([])
    // Nothing asks the renderer to pause or stop.
    expect(mainWindow.sent).toEqual([
      ['widget:state', { open: true }],
      ['widget:state', { open: false }],
    ])
  })

  it('a widget renderer that is gone does what Expandir does (WIDGET-21)', () => {
    const { controller, mainWindow, widget } = setup()
    controller.open()
    widget().webContents.emit('render-process-gone', {}, { reason: 'crashed' })
    expect(widget().isDestroyed()).toBe(true)
    expect(controller.isOpen()).toBe(false)
    expect(mainWindow.isMinimized()).toBe(false)
    expect(mainWindow.focused).toBe(1)
  })

  it('closing while closed does nothing', () => {
    const { controller, mainWindow } = setup()
    controller.close('expand')
    expect(mainWindow.focused).toBe(0)
    expect(mainWindow.sent).toEqual([])
  })

  it('the main window closing closes the widget too, so the app can quit', () => {
    const { controller, mainWindow, widget } = setup()
    controller.open()
    mainWindow.close()
    expect(widget().isDestroyed()).toBe(true)
    expect(controller.isOpen()).toBe(false)
  })

  it('opens again after closing', () => {
    const { controller, createWindow } = setup()
    controller.open()
    controller.close('expand')
    controller.open()
    expect(createWindow).toHaveBeenCalledTimes(2)
    expect(controller.isOpen()).toBe(true)
  })
})

describe('the widget position (WIDGET-10)', () => {
  it('saves where it was dragged 500 ms after the move, and opens there next time', () => {
    const { controller, store, widget, createWindow } = setup()
    controller.open()
    widget().moveTo(500, 600)
    vi.advanceTimersByTime(499)
    expect(store.setWidgetBounds).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(store.setWidgetBounds).toHaveBeenLastCalledWith({ x: 500, y: 600, width: 300, height: 64 })

    controller.close('expand')
    controller.open()
    expect(createWindow.mock.calls.at(-1)).toEqual([{ x: 500, y: 600, width: 300, height: 64 }])
  })

  it('saves the position when it closes before the delay is over', () => {
    const { controller, store, widget } = setup()
    controller.open()
    widget().moveTo(700, 20)
    controller.close('expand')
    expect(store.setWidgetBounds).toHaveBeenLastCalledWith({ x: 700, y: 20, width: 300, height: 64 })
    vi.advanceTimersByTime(1000)
    expect(store.setWidgetBounds).toHaveBeenCalledTimes(1)
  })
})

describe('resizing the widget for the notes (WIDGET-14)', () => {
  it('grows to 300x240 for notes and back to 300x64', () => {
    const { controller, widget } = setup()
    controller.open()
    controller.resize('notes')
    expect(widget().getBounds()).toEqual({ ...CORNER, height: 240 })
    controller.resize('compact')
    expect(widget().getBounds()).toEqual(CORNER)
  })

  it('ignores an unknown mode and a closed widget', () => {
    const { controller, widget } = setup()
    expect(() => controller.resize('notes')).not.toThrow()
    controller.open()
    controller.resize('huge')
    expect(widget().getBounds()).toEqual(CORNER)
  })
})

describe('keeping both windows in sync (WIDGET-22, WIDGET-23)', () => {
  it('a focus change in one window reaches only the other one', () => {
    const { controller, mainWindow, widget } = setup()
    controller.open()
    mainWindow.sent = []
    controller.focusChanged(mainWindow.webContents)
    expect(widget().sent).toEqual([['focus:changed']])
    expect(mainWindow.sent).toEqual([])

    controller.focusChanged(widget().webContents)
    expect(mainWindow.sent).toEqual([['focus:changed']])
    expect(widget().sent).toEqual([['focus:changed']])
  })

  it('a focus change in the main window goes nowhere while the widget is closed', () => {
    const { controller, mainWindow } = setup()
    controller.focusChanged(mainWindow.webContents)
    expect(mainWindow.sent).toEqual([])
  })

  it('the widget state reaches the main window on each open and close', () => {
    const { controller, mainWindow } = setup()
    controller.open()
    controller.close('expand')
    controller.open()
    expect(mainWindow.sent).toEqual([
      ['widget:state', { open: true }],
      ['widget:state', { open: false }],
      ['widget:state', { open: true }],
    ])
  })
})
