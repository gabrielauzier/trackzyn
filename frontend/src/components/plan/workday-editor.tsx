import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clockMinutes } from '@/lib/plan/clock'
import type { Workday } from '@/types'

/** How the page saves the workday: `saveWorkday` of `usePlan`, which updates the plan and so the bar (PLAN-22). */
export type SaveWorkday = (next: Workday, callbacks: { onSuccess: () => void; onError: () => void }) => void

interface WorkdayEditorProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  workday: Workday
  onSave: SaveWorkday
}

function WorkdayForm({ workday, onSave, onClose }: { workday: Workday; onSave: SaveWorkday; onClose: () => void }) {
  const { t } = useTranslation()
  const [start, setStart] = useState(workday.start)
  const [end, setEnd] = useState(workday.end)
  const [error, setError] = useState<'order' | 'failed' | null>(null)
  const [saving, setSaving] = useState(false)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const from = clockMinutes(start)
    const to = clockMinutes(end)
    if (from === null || to === null || to <= from) return setError('order')
    setError(null)
    setSaving(true)
    onSave(
      { start, end },
      {
        onSuccess: onClose,
        onError: () => {
          setSaving(false)
          setError('failed')
        },
      },
    )
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workday-start">{t('plan.workday.start')}</Label>
          <Input id="workday-start" type="time" value={start} className="tabular-nums" onChange={(event) => setStart(event.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workday-end">{t('plan.workday.end')}</Label>
          <Input
            id="workday-end"
            type="time"
            value={end}
            aria-invalid={error === 'order' || undefined}
            className="tabular-nums"
            onChange={(event) => setEnd(event.target.value)}
          />
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error === 'order' ? 'plan.workday.order' : 'plan.workday.failed')}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('plan.workday.cancel')}
        </Button>
        <Button type="submit" disabled={saving}>
          {t('plan.workday.save')}
        </Button>
      </DialogFooter>
    </form>
  )
}

/**
 * `Seu expediente` (PLAN-22, PLAN-23): the start and the end of the workday in `HH:MM`, kept in the user's
 * preferences. An end not after the start shows `O fim precisa ser depois do início` and saves nothing; Esc and
 * `Cancelar` close without saving.
 */
export function WorkdayEditor({ open, onOpenChange, workday, onSave }: WorkdayEditorProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('plan.workday.title')}</DialogTitle>
          <DialogDescription>{t('plan.workday.hint')}</DialogDescription>
        </DialogHeader>
        {/* Mounted while open: each opening starts from the saved workday. */}
        {open && <WorkdayForm workday={workday} onSave={onSave} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}
