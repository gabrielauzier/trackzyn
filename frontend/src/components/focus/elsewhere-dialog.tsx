import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ElsewhereDialogProps {
  /** The task whose start was refused because a session is open on another device; null keeps it closed. */
  taskId: string | null
  /** `Assumir`: start again with `takeover` (SYNC-03, SYNC-04). */
  onTakeOver: (taskId: string, takeover: true) => void
  onClose: () => void
}

/** "Você já está focando em outro dispositivo." with `Assumir` and `Cancelar` (SYNC-02). */
export function ElsewhereDialog({ taskId, onTakeOver, onClose }: ElsewhereDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={taskId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{t('focus.elsewhere.title')}</DialogTitle>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={() => {
              if (taskId !== null) onTakeOver(taskId, true)
              onClose()
            }}
          >
            {t('focus.elsewhere.takeOver')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
