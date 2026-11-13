import type { TFunction } from 'i18next'

import { todayInTimezone } from '@/lib/date-utils'
import { clockIn } from '@/lib/schedule'
import type { InboxItem } from '@/types'

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * How old an item is, told by the day of the workspace (INBOX-02, AD-004): `hoje, 09:12` for an item of
 * today, `ontem` for yesterday, `há 3 dias` before that.
 */
export function inboxAge(createdAt: string, now: Date, timeZone: string | null | undefined, t: TFunction): string {
  const created = new Date(createdAt)
  const days = Math.round((Date.parse(todayInTimezone(timeZone, now)) - Date.parse(todayInTimezone(timeZone, created))) / DAY_MS)
  if (days <= 0) return t('inbox.ageToday', { time: clockIn(timeZone, created) })
  if (days === 1) return t('inbox.ageYesterday')
  return t('inbox.ageDays', { count: days })
}

/** Where an item came from, as `via <origem>`: the app, the desktop, the MCP, or the token that captured it. */
export function inboxOrigin(item: Pick<InboxItem, 'source' | 'created_via'>, t: TFunction): string {
  const name = item.source === 'api' ? (item.created_via ?? t('inbox.sourceApi')) : t(`inbox.source_${item.source}`)
  return t('board.createdVia', { name })
}
