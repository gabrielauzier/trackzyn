import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { CaptureField } from '@/components/capture/capture-overlay'
import { getDesktopApi, isDesktop } from '@/lib/platform'

function closeWindow(): void {
  if (isDesktop()) void getDesktopApi().closeCapture().catch(() => undefined)
}

/**
 * `/capture`: the desktop capture window that the global shortcut opens (CAP-06). It is the capture field
 * alone, with the origin `desktop`: keeping the item closes the window, and so does Esc.
 */
export default function CaptureWindowPage() {
  const { t } = useTranslation()

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeWindow()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <main aria-label={t('capture.title')} className="flex h-screen flex-col justify-center overflow-hidden bg-card text-foreground">
      <CaptureField source="desktop" onSaved={closeWindow} />
    </main>
  )
}
