import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { minuteClock } from '@/lib/agenda/format'
import { clockMinutes } from '@/lib/plan/clock'
import { clampBreak, type DropItem } from '@/lib/plan/draft'
import type { PlanListRef } from '@/types'

/** A break's name: 1 to 40 characters (PLAN-16). */
const NAME_MAX = 40
const DEFAULT_MINUTES = 15

type BreakItem = Extract<DropItem, { kind: 'break' }>

interface BreakDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The active lists; the first is the list of the Intervalo unless another is chosen (PLAN-18). */
  lists: PlanListRef[]
  /** The new break, to put in the draft (PLAN-16). */
  onCreate: (item: BreakItem) => void
}

function BreakForm({ lists, onCreate, onCancel }: { lists: PlanListRef[]; onCreate: (item: BreakItem) => void; onCancel: () => void }) {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const [duration, setDuration] = useState(minuteClock(DEFAULT_MINUTES))
  const [listId, setListId] = useState(lists[0]?.id ?? '')
  const [error, setError] = useState<'name' | 'range' | null>(null)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (trimmed.length < 1 || trimmed.length > NAME_MAX) return setError('name')
    const minutes = clockMinutes(duration)
    const checked = minutes === null ? null : clampBreak(minutes)
    if (!checked?.ok) return setError('range')
    const list = lists.find((item) => item.id === listId)
    if (!list) return
    onCreate({ kind: 'break', name: trimmed, minutes: checked.minutes, list })
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit} noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="break-name">{t('plan.breakDialog.name')}</Label>
        <Input
          id="break-name"
          value={name}
          autoFocus
          aria-invalid={error === 'name' || undefined}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="break-duration">{t('plan.breakDialog.duration')}</Label>
          <Input
            id="break-duration"
            type="time"
            value={duration}
            aria-invalid={error === 'range' || undefined}
            onChange={(event) => setDuration(event.target.value)}
            className="tabular-nums"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label id="break-list-label">{t('plan.breakDialog.list')}</Label>
          <Select value={listId} onValueChange={setListId}>
            <SelectTrigger aria-labelledby="break-list-label" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lists.map((list) => (
                <SelectItem key={list.id} value={list.id}>
                  {list.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {error && (
        <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t(error === 'name' ? 'plan.breakDialog.nameRange' : 'plan.breakRange')}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('plan.breakDialog.cancel')}
        </Button>
        <Button type="submit">{t('plan.breakDialog.create')}</Button>
      </DialogFooter>
    </form>
  )
}

/**
 * `Nova pausa` (PLAN-16, PLAN-17, PLAN-18): the name, 1 to 40 characters, the length in `HH:MM`, from 5 min to 2h,
 * and the list of the Intervalo, the first active list unless another is chosen. A name or a length out of range
 * creates nothing; `Cancelar` and Esc close without creating.
 */
export function BreakDialog({ open, onOpenChange, lists, onCreate }: BreakDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('plan.breakDialog.title')}</DialogTitle>
          <DialogDescription>{t('plan.breakDialog.hint')}</DialogDescription>
        </DialogHeader>
        {/* Mounted while open: each opening starts empty. */}
        {open && (
          <BreakForm
            lists={lists}
            onCreate={(item) => {
              onCreate(item)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
