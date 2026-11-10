import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { longDay } from '@/lib/schedule'
import { cn } from '@/lib/utils'
import type { SeriesScope } from '@/types'

type SeriesScopeDialogProps = {
  open: boolean
  /** `move`: the day or the time of an occurrence changes; `delete`: the occurrence is deleted (US-12). */
  variant: 'move' | 'delete'
  /** The title of the task, named by the delete variant. */
  title?: string
  /** The day the next occurrence is created for when only this one is deleted; null when this is the last one. */
  nextOn?: string | null
  isPending?: boolean
  /** Cancel, Esc or the close button: nothing is saved. */
  onCancel: () => void
  onChoose: (scope: SeriesScope) => void
}

/**
 * The question of a change to an occurrence of a series (US-12, D16): `Só esta ocorrência` or `Esta e as
 * próximas`, each with what it does; for a delete, `Excluir só esta` with the day of the next occurrence or
 * `Excluir esta e encerrar a série`, and the reminder of `Pular esta ocorrência`, which keeps the time spent (D18).
 */
export function SeriesScopeDialog({ open, variant, title = '', nextOn = null, isPending = false, onCancel, onChoose }: SeriesScopeDialogProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const deleting = variant === 'delete'
  const options: { scope: SeriesScope; label: string; hint: string }[] = deleting
    ? [
        {
          scope: 'occurrence',
          label: t('schedule.scope.deleteOne'),
          hint: nextOn === null ? t('schedule.scope.deleteOneLast') : t('schedule.scope.deleteOneHint', { day: longDay(nextOn, t, language) }),
        },
        { scope: 'series', label: t('schedule.scope.deleteSeries'), hint: t('schedule.scope.deleteSeriesHint') },
      ]
    : [
        { scope: 'occurrence', label: t('schedule.scope.occurrence'), hint: t('schedule.scope.occurrenceHint') },
        { scope: 'series', label: t('schedule.scope.series'), hint: t('schedule.scope.seriesHint') },
      ]

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !isPending) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-md" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>{deleting ? t('schedule.scope.deleteTitle') : t('schedule.scope.moveTitle')}</DialogTitle>
          <DialogDescription>
            {deleting ? t('schedule.scope.deleteDescription', { title }) : t('schedule.scope.moveDescription')}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {options.map((option) => (
            <Button
              key={option.scope}
              type="button"
              variant="outline"
              disabled={isPending}
              className={cn('h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal', deleting && 'text-destructive')}
              onClick={() => onChoose(option.scope)}
            >
              <span className="font-medium">{option.label}</span>
              <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>
            </Button>
          ))}
        </div>
        {deleting && <p className="text-xs text-muted-foreground">{t('schedule.scope.skipHint')}</p>}
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={isPending}>
            {t('common.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
