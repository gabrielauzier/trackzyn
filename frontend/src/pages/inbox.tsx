import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Inbox, Plus, Undo2 } from 'lucide-react'
import { toast } from 'sonner'

import { inbox as inboxApi } from '@/lib/api'
import { todayInTimezone } from '@/lib/date-utils'
import { inboxOrigin } from '@/lib/inbox/age'
import { useCapture } from '@/lib/inbox/use-capture'
import { shortDay } from '@/lib/schedule'
import { InboxRow } from '@/components/inbox/inbox-row'
import { ProcessDialog } from '@/components/inbox/process-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { InboxItem } from '@/types'

type Tab = 'current' | 'trash'

/** The capture field at the top of the inbox (CAP-01, CAP-02, CAP-03). */
function CaptureForm() {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  const { text, change, submit, problem, pending } = useCapture('app')

  return (
    <div className="flex flex-col gap-1.5">
      <form
        className="flex items-center gap-3 rounded-xl border border-border bg-card py-1.5 pr-1.5 pl-4 focus-within:border-primary/60"
        onSubmit={(event) => {
          event.preventDefault()
          submit()
          input.current?.focus()
        }}
      >
        <Plus size={18} aria-hidden className="shrink-0 text-muted-foreground" />
        <input
          ref={input}
          value={text}
          onChange={(event) => change(event.target.value)}
          aria-label={t('inbox.captureLabel')}
          aria-invalid={problem === 'tooLong' || undefined}
          aria-describedby={problem ? 'inbox-capture-problem' : undefined}
          placeholder={t('inbox.capturePlaceholder')}
          className="h-10 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
        />
        <Button type="submit" variant="secondary" size="sm" disabled={pending}>
          {t('inbox.captureSubmit')}
        </Button>
      </form>
      {problem && (
        <p id="inbox-capture-problem" role="alert" className="px-1 text-xs text-destructive">
          {t(problem === 'tooLong' ? 'inbox.tooLong' : 'inbox.captureFailed')}
        </p>
      )}
    </div>
  )
}

function TrashRow({ item, timeZone, onRestore }: { item: InboxItem; timeZone: string | undefined; onRestore: () => void }) {
  const { t, i18n } = useTranslation()
  const discardedDay = item.discarded_at ? todayInTimezone(timeZone, new Date(item.discarded_at)) : null
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-card py-3 pr-3 pl-4">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] text-muted-foreground line-through decoration-muted-foreground/50">{item.text}</p>
        <p className="mt-1 flex gap-2.5 text-xs text-muted-foreground">
          {discardedDay && <span>{t('inbox.discardedOn', { day: shortDay(discardedDay, t, i18n.language) })}</span>}
          <span aria-hidden>·</span>
          <span>{inboxOrigin(item, t)}</span>
        </p>
      </div>
      <Button type="button" variant="outline" size="sm" aria-label={t('inbox.restoreAria', { text: item.text })} onClick={onRestore}>
        <Undo2 />
        {t('inbox.restore')}
      </Button>
    </li>
  )
}

function ListSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-[66px] w-full rounded-xl" />
      ))}
    </div>
  )
}

/** The inbox of the logged-in user in the current workspace: capture, Atuais and Lixeira (INBOX-02, INBOX-04, INBOX-05). */
export default function InboxPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('current')
  // The Processar is part of the URL: `?process=<id>` (QUICK-08).
  const [searchParams, setSearchParams] = useSearchParams()
  const processing = searchParams.get('process')

  const current = useQuery({ queryKey: ['inbox', 'current'], queryFn: () => inboxApi.list('current') })
  const trash = useQuery({ queryKey: ['inbox', 'trash'], queryFn: () => inboxApi.list('trash') })
  const currentItems = current.data?.items ?? []
  const trashItems = trash.data?.items ?? []

  const changed = () => queryClient.invalidateQueries({ queryKey: ['inbox'] })
  const failed = () => toast.error(t('inbox.actionFailed'))
  const processed = currentItems.find((item) => item.id === processing)
  const closeProcess = () =>
    setSearchParams((params) => {
      params.delete('process')
      return params
    })
  /** After an item is decided, the Processar opens the next item of Atuais, or closes on the last one. */
  const processNext = () => {
    const at = currentItems.findIndex((item) => item.id === processing)
    const next = currentItems[at + 1]
    if (next) setSearchParams({ process: next.id })
    else closeProcess()
  }

  const discard = useMutation({ mutationFn: (id: string) => inboxApi.discard(id), onSuccess: changed, onError: failed })
  const restore = useMutation({ mutationFn: (id: string) => inboxApi.restore(id), onSuccess: changed, onError: failed })

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{t('inbox.title')}</h1>
        {current.data && (
          <p className="mt-1 text-sm text-muted-foreground">{t('inbox.waiting', { count: currentItems.length })}</p>
        )}
      </header>

      <CaptureForm />

      <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)}>
        <div className="flex items-center gap-1 border-b border-border">
          <TabsList variant="line">
            <TabsTrigger value="current">{t('inbox.tabCurrent', { count: currentItems.length })}</TabsTrigger>
            <TabsTrigger value="trash">{t('inbox.tabTrash', { count: trashItems.length })}</TabsTrigger>
          </TabsList>
          <span className="flex-1" />
          <span className="text-xs text-muted-foreground">{t('inbox.oldestFirst')}</span>
        </div>

        <TabsContent value="current" className="pt-2">
          {current.isLoading ? (
            <ListSkeleton />
          ) : currentItems.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-border/60 bg-card px-6 py-14 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <Inbox size={20} />
              </span>
              <p className="text-sm font-medium">{t('inbox.empty')}</p>
            </div>
          ) : (
            <ul aria-label={t('inbox.title')} className="flex flex-col gap-2">
              {currentItems.map((item) => (
                <InboxRow key={item.id} item={item} timeZone={current.data?.timezone} onDiscard={() => discard.mutate(item.id)} />
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="trash" className="pt-2">
          {trash.isLoading ? (
            <ListSkeleton />
          ) : trashItems.length === 0 ? (
            <p className="rounded-xl border border-border/60 bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              {t('inbox.trashEmpty')}
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              <ul aria-label={t('inbox.tabTrash', { count: trashItems.length })} className="flex flex-col gap-2">
                {trashItems.map((item) => (
                  <TrashRow key={item.id} item={item} timeZone={trash.data?.timezone} onRestore={() => restore.mutate(item.id)} />
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">{t('inbox.trashHint')}</p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {processed && (
        <ProcessDialog item={processed} timeZone={current.data?.timezone} onClose={closeProcess} onNext={processNext} />
      )}
    </div>
  )
}
