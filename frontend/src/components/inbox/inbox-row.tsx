import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { Check, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { inbox as inboxApi } from '@/lib/api'
import { inboxAge, inboxOrigin } from '@/lib/inbox/age'
import { sendRefusal } from '@/lib/inbox/errors'
import { useWritableLists } from '@/lib/inbox/use-writable-lists'
import { cn } from '@/lib/utils'
import { DURATION_ERROR_KEY, parseDuration, toDuration } from '@/components/board/estimate'
import { Button } from '@/components/ui/button'
import { DurationInput } from '@/components/ui/duration-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { InboxItem, InboxResponse } from '@/types'

/** A task title holds 255 characters: a longer text needs a name, given in the Processar (QUICK-07). */
const MAX_TITLE = 255

/** Changes one item of Atuais in the cache, before the server answers. */
function patchCurrent(queryClient: QueryClient, id: string, changes: Partial<InboxItem>) {
  queryClient.setQueryData<InboxResponse>(['inbox', 'current'], (data) =>
    data && { ...data, items: data.items.map((item) => (item.id === id ? { ...item, ...changes } : item)) },
  )
}

/** The controls sit above the row's link, so a click on them never opens the Processar (QUICK-08). */
const CONTROL = 'relative z-10'

/**
 * A row of Atuais (QUICK-01): the whole row opens the Processar through the title's link, stretched over the
 * row; the list, the estimate, `Enviar` and the discard sit above it and send the item straight away.
 */
export function InboxRow({ item, timeZone, onDiscard }: { item: InboxItem; timeZone: string | undefined; onDiscard: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const lists = useWritableLists()
  const [estimate, setEstimate] = useState(() => toDuration(item.estimate_minutes))
  const [estimateError, setEstimateError] = useState<string | null>(null)
  const list = lists.find((candidate) => candidate.id === item.list_id)
  const canSend = !!list && item.text.length <= MAX_TITLE

  // The list and the estimate stay on the item (QUICK-02).
  const save = useMutation({
    mutationFn: (changes: { list_id?: string | null; estimate_minutes?: number | null }) => inboxApi.update(item.id, changes),
    onMutate: (changes) => patchCurrent(queryClient, item.id, changes),
    onError: () => {
      toast.error(t('inbox.actionFailed'))
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    },
  })

  // The text is the title and the row's estimate the estimate, at the end of the Backlog (QUICK-04).
  const send = useMutation({
    mutationFn: (listId: string) => inboxApi.send(item.id, { type: 'task', list_id: listId }),
    onSuccess: () => {
      toast.success(t('inbox.sent', { list: list?.name ?? '' }))
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
      void queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
    onError: (error) => {
      const reason = sendRefusal(error)
      toast.error(reason ? t(`inbox.refusal.${reason}`) : t('inbox.actionFailed'))
      // The server cleared the list of the item: the select goes back to empty (QUICK-06).
      if (reason === 'list_archived' || reason === 'list_read_only') patchCurrent(queryClient, item.id, { list_id: null })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
      if (reason !== 'already_processed') void queryClient.invalidateQueries({ queryKey: ['lists'] })
    },
  })

  // An estimate outside HH:MM from 00:01 to 24:00 is marked and not kept (QUICK-05).
  const commitEstimate = () => {
    const parsed = parseDuration(estimate)
    if ('error' in parsed) {
      setEstimateError(t(DURATION_ERROR_KEY[parsed.error]))
      return
    }
    setEstimateError(null)
    if (parsed.minutes !== item.estimate_minutes) save.mutate({ estimate_minutes: parsed.minutes })
  }

  const errorId = `inbox-estimate-error-${item.id}`
  return (
    <li
      data-inbox-row={item.id}
      className={cn(
        'group/row relative flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card py-3 pr-3 pl-4 transition-colors sm:flex-nowrap',
        // QUICK-09: the border and the title light up over the row, and not over its controls.
        'hover:border-primary hover:bg-accent/40',
        'has-[[data-row-control]:hover]:border-border has-[[data-row-control]:hover]:bg-card',
        'has-[a:focus-visible]:outline-2 has-[a:focus-visible]:outline-offset-2 has-[a:focus-visible]:outline-primary',
      )}
    >
      <span aria-hidden className="size-2 shrink-0 rounded-full bg-primary" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="truncate text-[15px] font-medium">
          <Link
            to={{ search: `?process=${item.id}` }}
            title={t('inbox.process')}
            className={cn(
              'text-foreground outline-none decoration-primary underline-offset-[3px]',
              'group-hover/row:underline group-has-[[data-row-control]:hover]/row:no-underline',
              // Stretched over the whole row (QUICK-08).
              'after:absolute after:inset-0 after:cursor-pointer after:rounded-xl',
            )}
          >
            {item.text}
          </Link>
        </p>
        <p className="mt-1 flex gap-2.5 text-xs text-muted-foreground">
          <span>{inboxAge(item.created_at, new Date(), timeZone, t)}</span>
          <span aria-hidden>·</span>
          <span>{inboxOrigin(item, t)}</span>
        </p>
      </div>

      <div data-row-control className={cn(CONTROL, 'w-44')}>
        <Select
          value={list ? list.id : ''}
          onValueChange={(listId) => save.mutate({ list_id: listId })}
        >
          <SelectTrigger size="sm" aria-label={t('inbox.listOf', { text: item.text })} className="w-full bg-background">
            <SelectValue placeholder={t('inbox.listPlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {lists.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                <span aria-hidden className="size-2.5 shrink-0 rounded-[3px]" style={{ backgroundColor: `var(--chart-${option.color})` }} />
                {option.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div data-row-control className={cn(CONTROL, 'flex flex-col')}>
        <DurationInput
          variant="field"
          value={estimate}
          onChange={(value) => {
            setEstimate(value)
            if (estimateError) setEstimateError(null)
          }}
          onBlur={commitEstimate}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitEstimate()
          }}
          placeholder={t('inbox.estimatePlaceholder')}
          aria-label={t('inbox.estimateOf', { text: item.text })}
          aria-invalid={estimateError ? true : undefined}
          aria-describedby={estimateError ? errorId : undefined}
          title={estimateError ?? undefined}
          className="h-8 text-center text-[13px]"
        />
        {estimateError && (
          <span id={errorId} role="alert" className="sr-only">
            {estimateError}
          </span>
        )}
      </div>

      {canSend && (
        <Button
          type="button"
          size="sm"
          data-row-control
          className={cn(CONTROL, 'h-8')}
          aria-label={t('inbox.sendTo', { list: list.name })}
          title={t('inbox.sendTo', { list: list.name })}
          disabled={send.isPending}
          onClick={() => send.mutate(list.id)}
        >
          <Check strokeWidth={2.6} />
          {t('inbox.send')}
        </Button>
      )}

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        data-row-control
        className={CONTROL}
        aria-label={t('inbox.discard', { text: item.text })}
        onClick={onDiscard}
      >
        <Trash2 />
      </Button>
    </li>
  )
}
