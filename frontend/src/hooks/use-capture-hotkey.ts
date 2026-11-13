import { useEffect } from 'react'

/**
 * Registers the global Mod+Shift+Space listener that opens the capture overlay (CAP-04): `⌘⇧Space` on macOS,
 * `Ctrl+Shift+Space` on Windows and Linux, wherever the focus is in the app.
 */
export function useCaptureHotkey(open: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey
      if (isMod && e.shiftKey && (e.code === 'Space' || e.key === ' ')) {
        e.preventDefault()
        open()
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])
}
