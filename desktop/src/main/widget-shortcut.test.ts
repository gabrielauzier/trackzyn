import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { bindWidgetShortcut } from './widget-shortcut'

interface Input {
  type: 'keyDown' | 'keyUp'
  key: string
  control: boolean
  meta: boolean
  shift: boolean
  alt: boolean
  isAutoRepeat: boolean
}

type Listener = (event: { preventDefault(): void }, input: Input) => void

function setup(platform: string, { open = false, active = true } = {}) {
  const listeners = new Map<string, Listener[]>()
  const webContents = {
    on: vi.fn((event: string, listener: Listener) => void listeners.set(event, [...(listeners.get(event) ?? []), listener])),
  }
  const state = { open, active }
  const controller = {
    isOpen: () => state.open,
    focusActive: () => state.active,
    open: vi.fn(() => void (state.open = true)),
    close: vi.fn(() => void (state.open = false)),
  }
  bindWidgetShortcut(webContents, controller, platform)
  const press = (keys: Partial<Input>) => {
    const event = { preventDefault: vi.fn() }
    const input: Input = { type: 'keyDown', key: 'F', control: false, meta: false, shift: true, alt: false, isAutoRepeat: false, ...keys }
    for (const listener of listeners.get('before-input-event') ?? []) listener(event, input)
    return event.preventDefault
  }
  return { webContents, controller, press, state }
}

const CTRL = { control: true }
const CMD = { meta: true }

describe('focus widget shortcut (WIDGET-04, WIDGET-05, WIDGET-20)', () => {
  it('Ctrl+Shift+F on Windows and Linux opens the widget from the main window with a focus active', () => {
    for (const platform of ['win32', 'linux']) {
      const { press, controller } = setup(platform)
      const preventDefault = press(CTRL)
      expect(controller.open, platform).toHaveBeenCalledTimes(1)
      expect(controller.close, platform).not.toHaveBeenCalled()
      expect(preventDefault, platform).toHaveBeenCalledTimes(1)
    }
  })

  it('Cmd+Shift+F on macOS opens the widget with a focus active', () => {
    const { press, controller } = setup('darwin')
    expect(press(CMD)).toHaveBeenCalledTimes(1)
    expect(controller.open).toHaveBeenCalledTimes(1)
  })

  it('the key matches with or without caps (f or F)', () => {
    const { press, controller } = setup('linux')
    press({ ...CTRL, key: 'f' })
    expect(controller.open).toHaveBeenCalledTimes(1)
  })

  it('from the widget, the same shortcut does what Expandir does (WIDGET-20)', () => {
    for (const [platform, modifier] of [['linux', CTRL], ['darwin', CMD]] as const) {
      const { press, controller } = setup(platform, { open: true })
      expect(press(modifier), platform).toHaveBeenCalledTimes(1)
      expect(controller.close.mock.calls, platform).toEqual([['expand']])
      expect(controller.open, platform).not.toHaveBeenCalled()
    }
  })

  it('toggles: open, then expand, then open again', () => {
    const { press, controller } = setup('linux')
    press(CTRL)
    press(CTRL)
    press(CTRL)
    expect(controller.open).toHaveBeenCalledTimes(2)
    expect(controller.close).toHaveBeenCalledTimes(1)
  })

  it('without a focus active, does not open and lets the keys through', () => {
    const { press, controller } = setup('linux', { active: false })
    expect(press(CTRL)).not.toHaveBeenCalled()
    expect(controller.open).not.toHaveBeenCalled()
    expect(controller.close).not.toHaveBeenCalled()
  })

  it('lets every other combination through without preventDefault', () => {
    const others: Array<[string, Partial<Input>]> = [
      ['linux', { ...CMD }], // the macOS modifier off macOS
      ['darwin', { ...CTRL }], // the Windows/Linux modifier on macOS
      ['linux', { ...CTRL, meta: true }],
      ['darwin', { ...CMD, control: true }],
      ['linux', { ...CTRL, shift: false }],
      ['linux', { ...CTRL, alt: true }],
      ['linux', { ...CTRL, key: 'G' }],
      ['linux', { ...CTRL, type: 'keyUp' }],
      ['linux', { ...CTRL, isAutoRepeat: true }],
      ['linux', { key: 'F', shift: true }],
      ['linux', { key: 'a', shift: false }],
    ]
    for (const [platform, keys] of others) {
      const { press, controller } = setup(platform)
      expect(press(keys), `${platform} ${JSON.stringify(keys)}`).not.toHaveBeenCalled()
      expect(controller.open).not.toHaveBeenCalled()
      expect(controller.close).not.toHaveBeenCalled()
    }
  })

  it('listens only to the window input, never as a global shortcut (WIDGET-05)', () => {
    const { webContents } = setup('linux')
    expect(webContents.on.mock.calls.map(([event]) => event)).toEqual(['before-input-event'])
    const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    const files = readdirSync(__dirname).filter((name) => name.endsWith('.ts') && !name.includes('.test.'))
    expect(files).toContain('widget-shortcut.ts')
    for (const name of files) expect(strip(readFileSync(path.join(__dirname, name), 'utf8')), name).not.toMatch(/globalShortcut/)
  })
})
