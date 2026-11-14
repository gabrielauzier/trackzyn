import { useTranslation } from 'react-i18next'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Settings } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { cardFields } from '@/lib/api'
import { extractApiError } from '@/lib/api-errors'
import { CARD_FIELDS, cardFieldsKey, useCardFields } from '@/lib/board/card-fields'
import type { CardField } from '@/types'

/**
 * The gear of the board bar: `Campos do card`, one switch per new field, kept on the server for this user and
 * this list (FIELDS-02..04). A switch shows at once on the cards; a failed save puts it back.
 */
export function CardFieldsSettings({ listId }: { listId: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const key = cardFieldsKey(listId)
  const { fields, hidden } = useCardFields(listId)

  const save = useMutation({
    mutationFn: (next: CardField[]) => cardFields.set(listId, next),
    onMutate: (next) => {
      const previous = queryClient.getQueryData<{ hidden: CardField[] }>(key)
      queryClient.setQueryData(key, { hidden: next })
      return { previous }
    },
    onError: (e, _, context) => {
      queryClient.setQueryData(key, context?.previous)
      toast.error(extractApiError(e, t('common.error')))
    },
  })

  const toggle = (field: CardField, on: boolean) => {
    const current = hidden ?? []
    save.mutate(CARD_FIELDS.filter((other) => (other === field ? !on : current.includes(other))))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('board.cardFields.title')}>
          <Settings />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <h3 className="mb-3 text-sm font-semibold">{t('board.cardFields.title')}</h3>
        <ul className="space-y-3">
          {CARD_FIELDS.map((field) => (
            <li key={field} className="flex items-center justify-between gap-3">
              <span id={`card-field-${field}`} className="text-sm">
                {t(`board.cardFields.${field}`)}
              </span>
              <Switch
                aria-labelledby={`card-field-${field}`}
                checked={fields[field]}
                disabled={hidden === undefined}
                onCheckedChange={(on) => toggle(field, on)}
              />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">{t('board.cardFields.always')}</p>
      </PopoverContent>
    </Popover>
  )
}
