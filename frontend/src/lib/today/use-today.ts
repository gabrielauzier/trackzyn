import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { useWorkspace } from '@/contexts/workspace-context'
import { today } from '@/lib/api'

/** The day is the user's, in one workspace (HOJE-06). */
export const todayKey = (workspaceId: string | null) => ['today', workspaceId] as const

/** How often the day is read again with the page open (HOJE-71). */
export const TODAY_POLL_MS = 60_000

/**
 * The user's day in the current workspace (`GET /api/today`). It is read again every 60 s and whenever the window
 * gets the focus back (HOJE-71); a failed read keeps the last day it read and exposes `isError` (HOJE-73).
 */
export function useToday() {
  const workspaceId = useWorkspace().current?.id ?? null
  return useQuery({
    queryKey: todayKey(workspaceId),
    queryFn: () => today.get(),
    refetchInterval: TODAY_POLL_MS,
    // The app keeps answers fresh for 5 minutes; the day reads again on every focus of the window.
    staleTime: 0,
    refetchOnWindowFocus: true,
    placeholderData: keepPreviousData,
    retry: false,
  })
}
