import { useEffect } from 'react'

import { getDesktopApi, isDesktop } from '@/lib/platform'

/**
 * Registers the global Mod+Shift+Space listener that opens the capture overlay (CAP-04): `⌘⇧Space` on macOS,
 * `Ctrl+Shift+Space` on Windows and Linux, wherever the focus is in the app. On desktop with the global
 * capture shortcut on, the keys belong to the capture window (CAP-06), so the overlay stays closed; the
 * setting is read on each press, as it can change in the preferences (CAP-07).
 */
export function useCaptureHotkey(open: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.shiftKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault()
        if (!isDesktop()) return open()
        void getDesktopApi()
          .getCaptureShortcut()
          .then((setting) => {
            if (!setting.enabled) open()
          })
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])
}
