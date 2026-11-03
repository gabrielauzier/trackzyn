import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getDesktopApi } from '@/lib/platform'
import { setWritesBlocked } from '@/lib/write-lock'

/**
 * Desktop, local mode: while the main process exports the data this modal covers the app, the
 * client stops sending writes and nothing under it can be clicked.
 */
export function ExportModal() {
  const { t } = useTranslation()
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    const unsubscribe = getDesktopApi().onExportState((state) => {
      setWritesBlocked(state.exporting)
      setExporting(state.exporting)
    })
    return () => {
      unsubscribe()
      setWritesBlocked(false)
    }
  }, [])

  if (!exporting) return null
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-label={t('desktop.transfer.exporting')} className="w-full max-w-sm rounded-lg border bg-card p-6 text-center shadow-lg">
        <div role="progressbar" aria-label={t('desktop.transfer.exporting')} className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-b-2 border-primary" />
        <p className="font-medium">{t('desktop.transfer.exporting')}</p>
        <p className="mt-1 text-sm text-muted-foreground">{t('desktop.transfer.exportingHint')}</p>
      </div>
    </div>
  )
}
