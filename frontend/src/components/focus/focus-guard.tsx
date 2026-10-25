import { matchPath, useLocation } from 'react-router-dom'

import { useDesktopFocusBridge } from '@/lib/focus/use-desktop-bridge'
import { useFocus } from '@/lib/focus/use-focus'
import { useLeaveGuard } from '@/lib/focus/use-leave-guard'

const LIST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The list the current page shows (the board or the focus screen), so the guard shares its state. */
function routeListId(pathname: string): string | undefined {
  const match = matchPath('/lists/:listId', pathname) ?? matchPath('/focus/:listId', pathname)
  const listId = match?.params.listId
  return listId && LIST_ID.test(listId) ? listId : undefined
}

/**
 * Guards closing while a task of this device counts, wherever the user is in the app (SYNC-08,
 * SYNC-09): the desktop app asks before closing and the browser shows its alert and pauses on leaving.
 */
export function FocusGuard() {
  const { pathname } = useLocation()
  const { state, actions } = useFocus(routeListId(pathname))
  useLeaveGuard(state)
  useDesktopFocusBridge(state, actions.pause)
  return null
}
