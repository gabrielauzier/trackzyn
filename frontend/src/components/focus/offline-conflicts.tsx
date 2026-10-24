import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import type { FocusConflict } from '@/lib/focus/queue'

interface OfflineConflictsProps {
  /** Actions the server refused when they were sent after reconnecting (SYNC-07). */
  conflicts: FocusConflict[]
  /** How many queued actions were dropped for being older than 24h so far (SYNC-06). */
  expired: number
  onRetry: (actionId: string) => void
  onDiscard: (actionId: string) => void
}

/**
 * The refused offline actions, each with the action and the time of its click, `Tentar de novo` and
 * `Descartar` (SYNC-07); and the warning for actions dropped after 24h (SYNC-06).
 */
export function OfflineConflicts({ conflicts, expired, onRetry, onDiscard }: OfflineConflictsProps) {
  const { t, i18n } = useTranslation()
  const warned = useRef(0)

  useEffect(() => {
    if (expired <= warned.current) return
    toast.warning(t('focus.conflicts.expired', { count: expired - warned.current }))
    warned.current = expired
  }, [expired, t])

  if (conflicts.length === 0) return null
  const time = new Intl.DateTimeFormat(i18n.language, { hour: '2-digit', minute: '2-digit' })

  return (
    <section className="space-y-2 rounded-lg border border-destructive/40 p-3">
      <h3 className="text-sm font-semibold">{t('focus.conflicts.title')}</h3>
      <ul className="space-y-2">
        {conflicts.map(({ action_id, action }) => (
          <li key={action_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              {t('focus.conflicts.action', {
                action: t(`focus.conflicts.types.${action.type.replace('/', '_')}`),
                time: time.format(new Date(action.occurred_at)),
              })}
            </span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onRetry(action_id)}>
                {t('focus.conflicts.retry')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDiscard(action_id)}>
                {t('focus.conflicts.discard')}
              </Button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
