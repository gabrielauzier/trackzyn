import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { APP_VERSION } from '@/lib/build-info'
import { useLatestRelease } from '@/hooks/use-latest-release'
import { useAutoUpdateCheck } from '@/hooks/use-auto-update-check'
import { isUpdateAvailable } from '@/lib/semver'
import { getDesktopApi, isDesktop } from '@/lib/platform'

interface UpdateAvailableBannerProps {
  onOpen: () => void
}

const bannerClass =
  'flex items-center gap-2 w-full rounded-lg border border-sidebar-border px-3 py-2 text-xs font-medium text-sidebar-foreground hover:bg-sidebar-accent transition-colors text-left'

/** On desktop the app updates itself: the banner restarts into the downloaded version. */
function DesktopUpdateBanner() {
  const { t } = useTranslation()
  const [version, setVersion] = useState<string | null>(null)

  useEffect(() => getDesktopApi().onUpdateAvailable((info) => setVersion(info.version)), [])

  if (!version) return null
  return (
    <div className="px-3 pb-1">
      <button type="button" onClick={() => void getDesktopApi().installUpdate()} className={bannerClass}>
        <Download size={14} className="shrink-0 text-sidebar-muted" />
        <span className="flex-1 truncate">{t('desktop.update.restart', { version })}</span>
        <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
      </button>
    </div>
  )
}

export function UpdateAvailableBanner({ onOpen }: UpdateAvailableBannerProps) {
  return isDesktop() ? <DesktopUpdateBanner /> : <WebUpdateBanner onOpen={onOpen} />
}

function WebUpdateBanner({ onOpen }: UpdateAvailableBannerProps) {
  const { t } = useTranslation()
  const { enabled } = useAutoUpdateCheck()
  const { data } = useLatestRelease()

  if (!enabled) return null
  if (!data) return null
  if (!isUpdateAvailable(APP_VERSION, data.tagName)) return null

  return (
    <div className="px-3 pb-1">
      <button
        type="button"
        onClick={onOpen}
        title={t('app.updateAvailableHint', { version: data.tagName })}
        className={bannerClass}
      >
        <Download size={14} className="shrink-0 text-sidebar-muted" />
        <span className="flex-1 truncate">{t('app.updateAvailable')}</span>
        <span
          aria-hidden="true"
          className="h-2 w-2 shrink-0 rounded-full bg-emerald-500"
        />
      </button>
    </div>
  )
}
