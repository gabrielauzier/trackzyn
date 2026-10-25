import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Listener = (event: { preventDefault(): void }, url: string) => void

const electron = vi.hoisted(() => {
  class FakeBrowserWindow {
    static created: FakeBrowserWindow[] = []
    calls: Array<[string, ...unknown[]]> = []
    listeners = new Map<string, Listener[]>()
    openHandler: ((details: { url: string }) => { action: 'deny' }) | null = null
    webContents = {
      setWindowOpenHandler: (handler: (details: { url: string }) => { action: 'deny' }) => {
        this.openHandler = handler
      },
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
  return { FakeBrowserWindow, openExternal: vi.fn(async () => undefined) }
})

vi.mock('electron', () => ({
  BrowserWindow: electron.FakeBrowserWindow,
  screen: { getAllDisplays: () => [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }] },
  shell: { openExternal: electron.openExternal },
}))

const { createWidgetWindow } = await import('./widget-window')
const { createMainWindow } = await import('./window')

beforeEach(() => {
  electron.FakeBrowserWindow.created = []
})

const bounds = { x: 1604, y: 16, width: 300, height: 64 }

function created() {
  return electron.FakeBrowserWindow.created.at(-1)!
}

describe('focus widget window (WIDGET-06)', () => {
  it('is frameless, on top, fixed at 300x64, off the taskbar, at the given position', () => {
    createWidgetWindow({ x: 40, y: 50, width: 300, height: 240 }, { appVersion: '1.2.3', platform: 'linux' })
    const { webPreferences, ...options } = created().options
    expect(options).toEqual({
      x: 40,
      y: 50,
      width: 300,
      height: 64,
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
      additionalArguments: ['--trackzyn-app-version=1.2.3', '--trackzyn-window-role=widget'],
    })
  })

  it('uses the same preload and web preferences as the main window, plus the widget role', () => {
    createMainWindow('1.2.3', { getBounds: () => null } as never)
    const main = created().options.webPreferences as Record<string, unknown>
    createWidgetWindow(bounds, { appVersion: '1.2.3', platform: 'linux' })
    const widget = created().options.webPreferences as Record<string, unknown>
    expect({ ...widget, additionalArguments: undefined }).toEqual({ ...main, additionalArguments: undefined })
    expect(widget.additionalArguments).toEqual([...(main.additionalArguments as string[]), '--trackzyn-window-role=widget'])
  })

  it('floats above other windows and loads app://trackzyn/widget', () => {
    createWidgetWindow(bounds, { appVersion: '1.2.3', platform: 'win32' })
    expect(created().calls).toEqual([
      ['setAlwaysOnTop', true, 'floating'],
      ['loadURL', 'app://trackzyn/widget'],
    ])
  })

  it('on macOS also stays visible on every workspace and over full-screen apps', () => {
    createWidgetWindow(bounds, { appVersion: '1.2.3', platform: 'darwin' })
    expect(created().calls).toEqual([
      ['setAlwaysOnTop', true, 'floating'],
      ['setVisibleOnAllWorkspaces', true, { visibleOnFullScreen: true }],
      ['loadURL', 'app://trackzyn/widget'],
    ])
  })

  it('defaults to the running platform', () => {
    createWidgetWindow(bounds, { appVersion: '1.2.3' })
    const onAllWorkspaces = created().calls.some(([name]) => name === 'setVisibleOnAllWorkspaces')
    expect(onAllWorkspaces).toBe(process.platform === 'darwin')
  })

  it('hardens its web contents: navigation off app://trackzyn is blocked and window.open is denied', () => {
    const win = createWidgetWindow(bounds, { appVersion: '1.2.3', platform: 'linux' }) as unknown as InstanceType<typeof electron.FakeBrowserWindow>
    for (const event of ['will-navigate', 'will-redirect', 'will-frame-navigate'] as const) {
      const [listener] = win.listeners.get(event)!
      const blocked = { preventDefault: vi.fn() }
      listener(blocked, 'https://evil.example/')
      expect(blocked.preventDefault, event).toHaveBeenCalledTimes(1)
      const allowed = { preventDefault: vi.fn() }
      listener(allowed, 'app://trackzyn/focus')
      expect(allowed.preventDefault, event).not.toHaveBeenCalled()
    }
    expect(win.openHandler!({ url: 'https://docs.example/' })).toEqual({ action: 'deny' })
    expect(electron.openExternal).toHaveBeenCalledWith('https://docs.example/')
  })
})
