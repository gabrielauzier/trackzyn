import { useEffect } from 'react'
import { matchPath, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { StaleSessionDialog } from '@/components/focus/stale-session-dialog'
import { onFocusChanged } from '@/lib/desktop/focus-window'
import { deviceId } from '@/lib/focus/device-id'
import { useDesktopFocusBridge } from '@/lib/focus/use-desktop-bridge'
import { useFocus } from '@/lib/focus/use-focus'
import { useLeaveGuard } from '@/lib/focus/use-leave-guard'
import type { FocusState } from '@/types'

const LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The list the current page shows (the board or the focus screen), so the guard shares its state. */
function routeListId(pathname: string): string | undefined {
  const match = matchPath('/lists/:listId', pathname) ?? matchPath('/focus/:listId', pathname)
  const listId = match?.params.listId
  return listId && LIST_ID.test(listId) ? listId : undefined
}

/**
 * Whether a task is in focus here: a session of this device (a task or a break), or the focus screen
 * showing a task, counting or paused. Only then minimizing the desktop window opens the widget
 * (WIDGET-03, Edge Case).
 */
function inFocus(state: FocusState | null, pathname: string): boolean {
  if (state === null) return false
  if (state.session !== null && state.session.device_id === deviceId()) return true
  return matchPath('/focus/:listId', pathname) !== null && state.task !== null
}

/**
 * Guards closing while a task of this device counts, wherever the user is in the app (SYNC-08,
 * SYNC-09): the desktop app asks before closing and the browser shows its alert and pauses on leaving.
 * Wherever the app opens, a session left open by a crash asks `Manter` or `Cortar no último sinal`
 * (SYNC-11). On the desktop, a change made in the focus widget reads the focus and the lists again, so
 * the main window shows it without reloading (WIDGET-22).
 */
export function FocusGuard() {
  const { pathname } = useLocation()
  const { state, actions } = useFocus(routeListId(pathname))
  const queryClient = useQueryClient()
  useEffect(
    () =>
      onFocusChanged(() => {
        void queryClient.invalidateQueries({ queryKey: ['focus'] })
        void queryClient.invalidateQueries({ queryKey: ['lists'] })
      }),
    [queryClient],
  )
  useLeaveGuard(state)
  useDesktopFocusBridge(inFocus(state, pathname) ? state : null, actions.pause)
  return <StaleSessionDialog stale={state?.stale ?? null} onRecover={(decision) => void actions.recover(decision)} />
}
