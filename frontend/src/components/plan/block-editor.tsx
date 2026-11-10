import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'

import { formatDuration } from '@/components/board/format-duration'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { minuteClock } from '@/lib/agenda/format'
import { clockMinutes } from '@/lib/plan/clock'
import type { DraftBlock, DraftError } from '@/lib/plan/draft'
import type { PlanListRef } from '@/types'

/** A change to the open block, as the `edit` action of the draft takes it. */
export interface BlockChange {
  start?: number
  minutes?: number
  list?: PlanListRef
}

interface BlockEditorProps {
  /** The open block; null, the editor is closed. */
  block: DraftBlock | null
  /** The active lists, for the list of a break's Intervalo (PLAN-18). */
  lists: PlanListRef[]
  /** The last change the draft refused: a break out of 5 min to 2h (PLAN-17). */
  error: DraftError | null
  /** A past day: the fields only show (PLAN-34). */
  readOnly?: boolean
  /** Changes the block in the draft only (PLAN-06). */
  onEdit: (change: BlockChange) => void
  /** `Tirar do plano`: takes the block out of the draft (PLAN-06). */
  onRemove: () => void
  onClose: () => void
}

/**
 * The editor of a block (PLAN-06, PLAN-17, PLAN-18): the start and the length in `HH:MM`, which change only the block,
 * never the task's estimate, as the text says; for a break, the list of its Intervalo. `Tirar do plano` takes the
 * block out of the draft; `Pronto` and Esc close.
 */
export function BlockEditor({ block, lists, error, readOnly = false, onEdit, onRemove, onClose }: BlockEditorProps) {
  const { t, i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const estimate = block?.kind === 'task' ? block.task.estimate_minutes : null
  const duration = (minutes: number) => formatDuration(minutes * 60, language)

  return (
    <Dialog open={block !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {block && (
          <>
            <DialogHeader>
              <DialogTitle>{block.kind === 'task' ? block.task.title : block.name}</DialogTitle>
              <DialogDescription className="flex items-center gap-1.5">
                {block.kind === 'task' && (
                  <>
                    <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: `var(--chart-${block.task.list.color})` }} />
                    {`${block.task.list.name} · ${estimate === null ? t('plan.editor.noEstimate') : t('plan.editor.estimate', { duration: duration(estimate) })}`}
                  </>
                )}
                {block.kind === 'break' && t('plan.editor.breakHint')}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="block-start">{t('plan.editor.start')}</Label>
                <Input
                  id="block-start"
                  type="time"
                  value={minuteClock(block.start)}
                  disabled={readOnly}
                  className="tabular-nums"
                  onChange={(event) => {
                    const start = clockMinutes(event.target.value)
                    if (start !== null) onEdit({ start })
                  }}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="block-duration">{t('plan.editor.duration')}</Label>
                <Input
                  id="block-duration"
                  type="time"
                  // SPEC_DEVIATION: an HH:MM field holds up to 23:59; a task block of 24 h is reached by pulling its edge.
                  // Reason: the field is the `schedule-picker` time input (D34), which stops at 23:59.
                  value={minuteClock(block.minutes % (24 * 60))}
                  disabled={readOnly}
                  aria-invalid={error === 'break_range' || undefined}
                  className="tabular-nums"
                  onChange={(event) => {
                    const minutes = clockMinutes(event.target.value)
                    if (minutes !== null) onEdit({ minutes })
                  }}
                />
              </div>
            </div>
            {block.kind === 'break' && (
              <div className="flex flex-col gap-1.5">
                <Label id="block-list-label">{t('plan.breakDialog.list')}</Label>
                <Select
                  value={block.list.id}
                  disabled={readOnly}
                  onValueChange={(id) => {
                    const list = lists.find((item) => item.id === id)
                    if (list) onEdit({ list })
                  }}
                >
                  <SelectTrigger aria-labelledby="block-list-label" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {/* The saved list stays in the choices even when it is no longer active. */}
                    {[block.list, ...lists.filter((list) => list.id !== block.list.id)].map((list) => (
                      <SelectItem key={list.id} value={list.id}>
                        {list.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {block.kind === 'task' && (
              <p data-slot="keeps-estimate" className="text-xs text-muted-foreground">
                {estimate === null ? t('plan.editor.keepsNoEstimate') : t('plan.editor.keepsEstimate', { duration: duration(estimate) })}
              </p>
            )}
            {error === 'break_range' && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {t('plan.breakRange')}
              </p>
            )}
            <DialogFooter className="sm:justify-between">
              {readOnly ? (
                <span />
              ) : (
                <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={onRemove}>
                  <Trash2 aria-hidden size={15} />
                  {t('plan.editor.remove')}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={onClose}>
                {t('plan.editor.done')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
