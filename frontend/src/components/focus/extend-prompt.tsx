import { useTranslation } from 'react-i18next'
import { Check, TimerReset } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface ExtendPromptProps {
  onExtend: () => void
  onComplete: () => void
  disabled?: boolean
}

/** The estimate is used up: the timer stays at `00:00:00` until `Estender` or `Concluir` (FOCUS-10, FOCUS-12). */
export function ExtendPrompt({ onExtend, onComplete, disabled }: ExtendPromptProps) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="text-sm text-muted-foreground">{t('focus.extend.reached')}</p>
      <span className="font-mono text-2xl font-bold tabular-nums">00:00:00</span>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onExtend} disabled={disabled}>
          <TimerReset /> {t('focus.extend.extend')}
        </Button>
        <Button onClick={onComplete} disabled={disabled}>
          <Check /> {t('focus.controls.complete')}
        </Button>
      </div>
    </div>
  )
}
