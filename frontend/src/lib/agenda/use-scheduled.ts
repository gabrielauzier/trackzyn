import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { agenda } from '@/lib/api'
import type { ScheduledResponse } from '@/types'

/**
 * The key starts with `lists`: every write of the board, the task dialog and the agenda invalidates `['lists']`,
 * so a schedule saved anywhere shows on the agenda without a reload. It stays out of `['agenda']`, whose cached
 * periods hold sessions.
 */
export const scheduledKey = (from: string, to: string) => ['lists', 'scheduled', from, to] as const

/** Before the first answer: nothing scheduled, the same object on every render. */
const NOTHING: ScheduledResponse = { timed: [], untimed: [], projected: [] }

/**
 * The scheduled tasks of the whole workspace in `from`..`to` (US-5, US-14, D9): `timed` for the blocks of the
 * grid, `untimed` for the `Sem hora` row and `projected` for the future occurrences of the series (D14).
 */
export function useScheduled(from: string, to: string) {
  const query = useQuery({
    queryKey: scheduledKey(from, to),
    queryFn: () => agenda.scheduled(from, to),
    placeholderData: keepPreviousData,
    retry: false,
  })
  return { query, ...(query.data ?? NOTHING) }
}
