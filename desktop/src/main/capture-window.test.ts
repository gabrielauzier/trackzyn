import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: { preventDefault(): void }, url: string) => void

const electron = vi.hoisted(() => {
  class FakeBrowserWindow {
    static created: FakeBrowserWindow[] = []
    calls: Array<[string, ...unknown[]]> = []
    listeners = new Map<string, Listener[]>()
    webContents = {
      setWindowOpenHandler: () => undefined,
      on: (event: string, listener: Listener) => {
        this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener])
      },
    }
    constructor(public options: Record<string, unknown>) {
      FakeBrowserWindow.created.push(this)
    }
    on() {}
    setAlwaysOnTop(...args: unknown[]) {
      this.calls.push(['setAlwaysOnTop', ...args])
    }
    setVisibleOnAllWorkspaces(...args: unknown[]) {
      this.calls.push(['setVisibleOnAllWorkspaces', ...args])
    }
    loadURL(url: string) {
      this.calls.push(['loadURL', url])
      return Promise.resolve()
    }
  }
  return { FakeBrowserWindow }
})

vi.mock('electron', () => ({
  BrowserWindow: electron.FakeBrowserWindow,
  screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] },
  shell: { openExternal: vi.fn(async () => undefined) },
}))

const { createCaptureController, createCaptureWindow, parseCaptureShortcut } = await import('./capture-window')
const { createMainWindow } = await import('./window')

beforeEach(() => {
  electron.FakeBrowserWindow.created = []
})

const created = () => electron.FakeBrowserWindow.created.at(-1)!

describe('capture window (CAP-06)', () => {
  it('is a small frameless window on top, centered, off the taskbar, with the capture role', () => {
    createCaptureWindow({ appVersion: '1.2.3', platform: 'linux' })
    const { webPreferences, ...options } = created().options
    expect(options).toMatchObject({
      center: true,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      fullscreenable: false,
    })
    expect(webPreferences).toEqual({
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      additionalArguments: ['--trackzyn-app-version=1.2.3', '--trackzyn-window-role=capture'],
    })
  })

  it('uses the main window web preferences plus the capture role', () => {
    createMainWindow('1.2.3', { getBounds: () => null } as never)
    const main = created().options.webPreferences as Record<string, unknown>
    createCaptureWindow({ appVersion: '1.2.3', platform: 'linux' })
    const capture = created().options.webPreferences as Record<string, unknown>
    expect({ ...capture, additionalArguments: undefined }).toEqual({ ...main, additionalArguments: undefined })
    expect(capture.additionalArguments).toEqual([...(main.additionalArguments as string[]), '--trackzyn-window-role=capture'])
  })

  it('floats above other windows and loads app://trackzyn/capture', () => {
    createCaptureWindow({ appVersion: '1.2.3', platform: 'win32' })
    expect(created().calls).toEqual([
      ['setAlwaysOnTop', true, 'floating'],
      ['loadURL', 'app://trackzyn/capture'],
    ])
  })

  it('on macOS also shows over full-screen apps', () => {
    createCaptureWindow({ appVersion: '1.2.3', platform: 'darwin' })
    expect(created().calls).toEqual([
      ['setAlwaysOnTop', true, 'floating'],
      ['setVisibleOnAllWorkspaces', true, { visibleOnFullScreen: true }],
      ['loadURL', 'app://trackzyn/capture'],
    ])
  })

  it('blocks navigation off app://trackzyn', () => {
    createCaptureWindow({ appVersion: '1.2.3', platform: 'linux' })
    const [listener] = created().listeners.get('will-navigate')!
    const blocked = { preventDefault: vi.fn() }
    listener(blocked, 'https://evil.example/')
    expect(blocked.preventDefault).toHaveBeenCalledTimes(1)
  })
})

function fakeWindow() {
  const listeners = new Map<string, Array<() => void>>()
  const win = {
    on: vi.fn((event: string, listener: () => void) => void listeners.set(event, [...(listeners.get(event) ?? []), listener])),
    focus: vi.fn(),
    close: vi.fn(() => emit('closed')),
  }
  const emit = (event: string) => {
    for (const listener of listeners.get(event) ?? []) listener()
  }
  return { win, emit }
}

function setupController() {
  const windows: Array<ReturnType<typeof fakeWindow>> = []
  const focusApp = vi.fn()
  const controller = createCaptureController({
    createWindow: () => {
      const made = fakeWindow()
      windows.push(made)
      return made.win
    },
    focusApp,
  })
  return { controller, windows, focusApp }
}

describe('capture window controller (CAP-06)', () => {
  it('the shortcut opens the window and gives it the focus, even with another app in front', () => {
    const { controller, windows, focusApp } = setupController()
    controller.open()
    expect(windows).toHaveLength(1)
    expect(focusApp).toHaveBeenCalledTimes(1)
    expect(windows[0].win.focus).toHaveBeenCalledTimes(1)
    expect(controller.isOpen()).toBe(true)
  })

  it('a second press only focuses the open window', () => {
    const { controller, windows } = setupController()
    controller.open()
    controller.open()
    expect(windows).toHaveLength(1)
    expect(windows[0].win.focus).toHaveBeenCalledTimes(2)
  })

  it('losing the focus closes it', () => {
    const { controller, windows } = setupController()
    controller.open()
    windows[0].emit('blur')
    expect(windows[0].win.close).toHaveBeenCalledTimes(1)
    expect(controller.isOpen()).toBe(false)
  })

  it('close (after saving) closes it, and the next press opens a new one', () => {
    const { controller, windows } = setupController()
    controller.open()
    controller.close()
    expect(windows[0].win.close).toHaveBeenCalledTimes(1)
    expect(controller.isOpen()).toBe(false)
    controller.open()
    expect(windows).toHaveLength(2)
  })

  it('close without a window does nothing', () => {
    const { controller } = setupController()
    expect(() => controller.close()).not.toThrow()
    expect(controller.isOpen()).toBe(false)
  })
})

describe('capture shortcut from the renderer', () => {
  it('accepts an on or off switch with a combination', () => {
    expect(parseCaptureShortcut({ enabled: true, accelerator: 'Alt+Space' })).toEqual({ enabled: true, accelerator: 'Alt+Space' })
    expect(parseCaptureShortcut({ enabled: false, accelerator: 'CommandOrControl+Shift+Space', extra: 1 })).toEqual({
      enabled: false,
      accelerator: 'CommandOrControl+Shift+Space',
    })
  })

  it('refuses anything else', () => {
    for (const value of [null, undefined, 'Alt+Space', { enabled: 'yes', accelerator: 'Alt+Space' }, { enabled: true }, { enabled: true, accelerator: '' }, { enabled: true, accelerator: 'x'.repeat(101) }]) {
      expect(() => parseCaptureShortcut(value), JSON.stringify(value)).toThrow(TypeError)
    }
  })
})
