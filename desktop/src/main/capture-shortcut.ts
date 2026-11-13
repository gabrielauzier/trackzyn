import { globalShortcut as electronGlobalShortcut } from 'electron'
import type { CaptureShortcutSetting } from './config-store'

export type { CaptureShortcutSetting }

export type CaptureShortcutResult = { ok: true } | { ok: false; reason: 'in_use' }

interface GlobalShortcutLike {
  register(accelerator: string, callback: () => void): boolean
  unregister(accelerator: string): void
}

interface Deps {
  /** Electron's own unless a test passes a fake: no other file may name it (AD-012). */
  globalShortcut?: GlobalShortcutLike
  store: { getCaptureShortcut(): CaptureShortcutSetting; setCaptureShortcut(setting: CaptureShortcutSetting): void }
  onPress(): void
}

/**
 * The only global shortcut of the app (AD-012): it opens the capture window with another app in front
 * (CAP-06). Every other shortcut, the widget's included, reads only the focused window (WIDGET-05).
 */
export function createCaptureShortcut({ globalShortcut = electronGlobalShortcut, store, onPress }: Deps) {
  let registered: string | null = null

  function release() {
    if (registered === null) return
    globalShortcut.unregister(registered)
    registered = null
  }

  function apply(): CaptureShortcutResult {
    const setting = store.getCaptureShortcut()
    if (!setting.enabled) return { ok: true }
    let accepted = false
    try {
      accepted = globalShortcut.register(setting.accelerator, onPress)
    } catch {
      // A combination Electron cannot parse, or one the platform does not support (Wayland), is refused too.
      accepted = false
    }
    if (!accepted) {
      // CAP-08: refused by the system, so it stays off until the user picks another one.
      store.setCaptureShortcut({ enabled: false, accelerator: setting.accelerator })
      return { ok: false, reason: 'in_use' }
    }
    registered = setting.accelerator
    return { ok: true }
  }

  return {
    apply,
    /** Releases the current combination first, then saves and registers the new setting (CAP-07). */
    set(setting: CaptureShortcutSetting): CaptureShortcutResult {
      release()
      store.setCaptureShortcut({ enabled: setting.enabled, accelerator: setting.accelerator })
      return apply()
    },
    dispose: release,
  }
}
