import { describe, expect, it } from 'vitest'

import { acceleratorFromKey, formatAccelerator } from '@/lib/desktop/accelerator'

const key = (code: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({
  code,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
})

describe('formatAccelerator (CAP-07)', () => {
  it('shows the default as ⌘⇧Space on macOS and Ctrl+Shift+Space elsewhere', () => {
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'darwin')).toBe('⌘⇧Space')
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'win32')).toBe('Ctrl+Shift+Space')
    expect(formatAccelerator('CommandOrControl+Shift+Space', 'linux')).toBe('Ctrl+Shift+Space')
  })

  it('shows every modifier with its symbol on macOS', () => {
    expect(formatAccelerator('Control+Alt+Shift+K', 'darwin')).toBe('⌃⌥⇧K')
    expect(formatAccelerator('Control+Alt+K', 'linux')).toBe('Ctrl+Alt+K')
  })
})

describe('acceleratorFromKey (CAP-07)', () => {
  it('turns the pressed combination into an Electron accelerator, the main modifier as CommandOrControl', () => {
    expect(acceleratorFromKey(key('Space', { metaKey: true, shiftKey: true }), 'darwin')).toBe('CommandOrControl+Shift+Space')
    expect(acceleratorFromKey(key('Space', { ctrlKey: true, shiftKey: true }), 'linux')).toBe('CommandOrControl+Shift+Space')
    expect(acceleratorFromKey(key('KeyK', { ctrlKey: true, altKey: true }), 'win32')).toBe('CommandOrControl+Alt+K')
    expect(acceleratorFromKey(key('Digit5', { altKey: true }), 'linux')).toBe('Alt+5')
    expect(acceleratorFromKey(key('F9', { ctrlKey: true }), 'linux')).toBe('CommandOrControl+F9')
  })

  it('keeps Control apart from Command on macOS', () => {
    expect(acceleratorFromKey(key('KeyK', { ctrlKey: true, shiftKey: true }), 'darwin')).toBe('Control+Shift+K')
  })

  it('is null while only modifiers are down, without a modifier other than Shift, or for an unknown key', () => {
    expect(acceleratorFromKey(key('ShiftLeft', { shiftKey: true }), 'linux')).toBeNull()
    expect(acceleratorFromKey(key('ControlLeft', { ctrlKey: true }), 'linux')).toBeNull()
    expect(acceleratorFromKey(key('KeyK'), 'linux')).toBeNull()
    expect(acceleratorFromKey(key('KeyK', { shiftKey: true }), 'linux')).toBeNull()
    expect(acceleratorFromKey(key('IntlBackslash', { ctrlKey: true }), 'linux')).toBeNull()
  })
})
