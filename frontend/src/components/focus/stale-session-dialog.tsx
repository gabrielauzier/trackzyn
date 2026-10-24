import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { FocusState } from '@/types'

interface StaleSessionDialogProps {
  stale: FocusState['stale']
  onRecover: (decision: 'keep' | 'cut') => void
}

/**
 * A session left open with no signal for more than 120 s (SYNC-11): how long it counted since the
 * last signal, and `Manter` or `Cortar no último sinal`. It waits for one of the two.
 */
export function StaleSessionDialog({ stale, onRecover }: StaleSessionDialogProps) {
  const { t, i18n } = useTranslation()
  // Closes on the answer, before the server's state without `stale` comes back.
  const [answered, setAnswered] = useState<string | null>(null)
  const open = stale !== null && stale.session_id !== answered

  const answer = (decision: 'keep' | 'cut') => {
    if (!stale) return
    setAnswered(stale.session_id)
    onRecover(decision)
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-md" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t('focus.stale.title')}</DialogTitle>
          <DialogDescription>
            {t('focus.stale.description', { duration: formatDuration(stale?.seconds ?? 0, i18n.language) })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer('cut')}>
            {t('focus.stale.cut')}
          </Button>
          <Button onClick={() => answer('keep')}>{t('focus.stale.keep')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
