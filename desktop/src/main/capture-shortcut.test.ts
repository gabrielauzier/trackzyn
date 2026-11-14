import { describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({ globalShortcut: { register: vi.fn(() => true), unregister: vi.fn() } }))
vi.mock('electron', () => electron)

const { createCaptureShortcut } = await import('./capture-shortcut')
type CaptureShortcutSetting = import('./capture-shortcut').CaptureShortcutSetting

const DEFAULT = { enabled: true, accelerator: 'CommandOrControl+Shift+Space' }

/** A fake OS: `taken` combinations belong to another app, so `register` answers false for them. */
function setup(saved: CaptureShortcutSetting = DEFAULT, { taken = [] as string[] } = {}) {
  const registered = new Set<string>()
  const globalShortcut = {
    register: vi.fn<(accelerator: string, callback: () => void) => boolean>((accelerator) => {
      if (taken.includes(accelerator) || registered.has(accelerator)) return false
      registered.add(accelerator)
      return true
    }),
    unregister: vi.fn((accelerator: string) => void registered.delete(accelerator)),
  }
  let setting = saved
  const store = {
    getCaptureShortcut: () => setting,
    setCaptureShortcut: vi.fn((next: CaptureShortcutSetting) => void (setting = next)),
  }
  const onPress = vi.fn()
  const shortcut = createCaptureShortcut({ globalShortcut, store, onPress })
  return { shortcut, globalShortcut, registered, store, onPress, saved: () => setting }
}

describe('capture shortcut (CAP-06, CAP-07, CAP-08, AD-012)', () => {
  it('registers the saved combination and runs onPress when it is pressed', () => {
    const { shortcut, registered, globalShortcut, onPress } = setup()
    expect(shortcut.apply()).toEqual({ ok: true })
    expect([...registered]).toEqual(['CommandOrControl+Shift+Space'])
    const [, callback] = globalShortcut.register.mock.calls[0]
    callback()
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('does not register anything while the shortcut is off', () => {
    const { shortcut, globalShortcut } = setup({ enabled: false, accelerator: 'CommandOrControl+Shift+Space' })
    expect(shortcut.apply()).toEqual({ ok: true })
    expect(globalShortcut.register).not.toHaveBeenCalled()
  })

  it('changing the combination releases the previous one before registering the new one (CAP-07)', () => {
    const { shortcut, registered, globalShortcut, saved } = setup()
    shortcut.apply()
    expect(shortcut.set({ enabled: true, accelerator: 'Alt+Space' })).toEqual({ ok: true })
    expect([...registered]).toEqual(['Alt+Space'])
    expect(saved()).toEqual({ enabled: true, accelerator: 'Alt+Space' })
    const unregisterOrder = globalShortcut.unregister.mock.invocationCallOrder[0]
    const registerOrder = globalShortcut.register.mock.invocationCallOrder[1]
    expect(globalShortcut.unregister.mock.calls).toEqual([['CommandOrControl+Shift+Space']])
    expect(unregisterOrder).toBeLessThan(registerOrder)
  })

  it('turning it off releases the combination at once and saves it off (CAP-07)', () => {
    const { shortcut, registered, saved } = setup()
    shortcut.apply()
    expect(shortcut.set({ enabled: false, accelerator: 'CommandOrControl+Shift+Space' })).toEqual({ ok: true })
    expect([...registered]).toEqual([])
    expect(saved()).toEqual({ enabled: false, accelerator: 'CommandOrControl+Shift+Space' })
  })

  it('a combination the system refuses is saved off and answers in_use (CAP-08)', () => {
    const { shortcut, registered, saved } = setup(DEFAULT, { taken: ['Alt+Space'] })
    shortcut.apply()
    expect(shortcut.set({ enabled: true, accelerator: 'Alt+Space' })).toEqual({ ok: false, reason: 'in_use' })
    expect(saved()).toEqual({ enabled: false, accelerator: 'Alt+Space' })
    // The previous combination was released all the same: nothing is left registered.
    expect([...registered]).toEqual([])
  })

  it('a saved combination already taken at start is turned off and answers in_use (CAP-08)', () => {
    const { shortcut, saved } = setup(DEFAULT, { taken: ['CommandOrControl+Shift+Space'] })
    expect(shortcut.apply()).toEqual({ ok: false, reason: 'in_use' })
    expect(saved()).toEqual({ enabled: false, accelerator: 'CommandOrControl+Shift+Space' })
  })

  it('a combination register throws on (refused or unsupported) also answers in_use (CAP-08)', () => {
    const { shortcut, globalShortcut, saved } = setup()
    globalShortcut.register.mockImplementationOnce(() => {
      throw new Error('conversion failure')
    })
    expect(shortcut.set({ enabled: true, accelerator: 'Nope+Space' })).toEqual({ ok: false, reason: 'in_use' })
    expect(saved()).toEqual({ enabled: false, accelerator: 'Nope+Space' })
  })

  it('uses Electron globalShortcut when none is passed', () => {
    const store = { getCaptureShortcut: () => DEFAULT, setCaptureShortcut: vi.fn() }
    const onPress = vi.fn()
    expect(createCaptureShortcut({ store, onPress }).apply()).toEqual({ ok: true })
    expect(electron.globalShortcut.register).toHaveBeenCalledWith('CommandOrControl+Shift+Space', onPress)
  })

  it('dispose releases the registered combination', () => {
    const { shortcut, registered } = setup()
    shortcut.apply()
    shortcut.dispose()
    expect([...registered]).toEqual([])
  })
})
