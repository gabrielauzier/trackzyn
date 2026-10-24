import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { isEnabled, setEnabled } from '@/lib/sounds/prefs'
import type { SoundKind } from '@/lib/sounds/synth'

const KINDS: SoundKind[] = ['complete', 'progress', 'estimate', 'break_end']

/** The settings icon of the focus screen: one switch per sound, kept on this device (SOUND-06). */
export function SoundSettings() {
  const { t } = useTranslation()
  const [enabled, setEnabledState] = useState(() => new Map(KINDS.map((kind) => [kind, isEnabled(kind)])))

  const toggle = (kind: SoundKind, on: boolean) => {
    setEnabled(kind, on)
    setEnabledState((current) => new Map(current).set(kind, on))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('focus.sounds.settings')}>
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <h3 className="mb-3 text-sm font-semibold">{t('focus.sounds.title')}</h3>
        <ul className="space-y-3">
          {KINDS.map((kind) => (
            <li key={kind} className="flex items-center justify-between gap-3">
              <span id={`sound-${kind}`} className="text-sm">
                {t(`focus.sounds.${kind}`)}
              </span>
              <Switch
                aria-labelledby={`sound-${kind}`}
                checked={enabled.get(kind) ?? true}
                onCheckedChange={(on) => toggle(kind, on)}
              />
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}
