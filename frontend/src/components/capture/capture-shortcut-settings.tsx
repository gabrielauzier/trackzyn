import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Keyboard, Monitor } from 'lucide-react'

import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { acceleratorFromKey, formatAccelerator } from '@/lib/desktop/accelerator'
import { getDesktopApi, isDesktop, type CaptureShortcutSetting } from '@/lib/platform'

/**
 * The `Neste computador` card of the workspace settings, in the desktop app only: the global capture
 * shortcut, its switch and the field that records a new combination (CAP-07). A combination the system
 * refuses shows `Esse atalho já está em uso` and leaves the shortcut off (CAP-08).
 */
export function CaptureShortcutSettings() {
  if (!isDesktop()) return null
  return <CaptureShortcutCard />
}

function CaptureShortcutCard() {
  const { t } = useTranslation()
  // Read once: the bridge does not change while the page is open.
  const [api] = useState(getDesktopApi)
  const [setting, setSetting] = useState<CaptureShortcutSetting | null>(null)
  const [inUse, setInUse] = useState(false)
  const [recording, setRecording] = useState(false)

  useEffect(() => {
    let alive = true
    void api
      .getCaptureShortcut()
      .then((saved) => {
        if (alive) setSetting(saved)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [api])

  const apply = (next: CaptureShortcutSetting) => {
    setSetting(next)
    setInUse(false)
    void api
      .setCaptureShortcut(next)
      .then((result) => {
        if (result.ok) return
        setSetting({ ...next, enabled: false })
        setInUse(true)
      })
      .catch(() => undefined)
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!recording || !setting) return
    if (event.key === 'Tab') return
    event.preventDefault()
    if (event.key === 'Escape') {
      setRecording(false)
      return
    }
    const accelerator = acceleratorFromKey(event, api.platform)
    if (!accelerator) return
    setRecording(false)
    apply({ enabled: true, accelerator })
  }

  return (
    <section className="space-y-4 rounded-xl border bg-card p-6">
      <div className="flex items-center gap-2">
        <Monitor className="h-4 w-4 text-muted-foreground" aria-hidden />
        <h2 className="text-base font-semibold">{t('capture.computer.title')}</h2>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Switch
          id="capture-shortcut"
          aria-labelledby="capture-shortcut-label"
          checked={setting?.enabled ?? false}
          onCheckedChange={(checked) => {
            if (setting) apply({ ...setting, enabled: checked })
          }}
          disabled={!setting}
        />
        <Label id="capture-shortcut-label" htmlFor="capture-shortcut" className="text-[13px]">
          {t('capture.computer.shortcut')}
        </Label>
        <button
          type="button"
          aria-label={t('capture.computer.combination')}
          aria-describedby={inUse ? 'capture-shortcut-in-use' : 'capture-shortcut-hint'}
          disabled={!setting}
          onClick={() => setRecording(true)}
          onBlur={() => setRecording(false)}
          onKeyDown={onKeyDown}
          className="inline-flex h-9 min-w-32 items-center gap-2 rounded-lg border bg-background px-3 font-mono text-[13px] text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[invalid=true]:border-destructive disabled:opacity-50"
          aria-invalid={inUse || undefined}
        >
          <Keyboard className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          {recording ? t('capture.computer.recording') : setting ? formatAccelerator(setting.accelerator, api.platform) : ''}
        </button>
      </div>
      {inUse ? (
        <p id="capture-shortcut-in-use" role="alert" className="text-[11px] text-destructive">
          {t('capture.computer.inUse')}
        </p>
      ) : (
        <p id="capture-shortcut-hint" className="text-[11px] text-muted-foreground leading-relaxed">
          {t('capture.computer.hint')}
        </p>
      )}
    </section>
  )
}
