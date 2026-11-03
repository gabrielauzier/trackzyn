import { useEffect } from 'react'

import { authHeaders } from '@/lib/api'
import { serverNow } from '@/lib/focus/clock'
import { deviceId } from '@/lib/focus/device-id'
import { uuid } from '@/lib/focus/uuid'
import { isDesktop } from '@/lib/platform'
import type { FocusState } from '@/types'

/**
 * Closing the browser tab with a task counting on this device (SYNC-09): `beforeunload` makes the
 * browser ask first and, if the user leaves, `pagehide` asks the pause at the time of closing with a
 * request that outlives the page. The desktop app asks in its own close dialog instead (SYNC-08).
 */
export function useLeaveGuard(state: FocusState | null): void {
  const counting = state?.session?.kind === 'task' && state.session.device_id === deviceId()

  useEffect(() => {
    if (!counting || isDesktop()) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      // Older browsers ask only when returnValue is set.
      event.returnValue = ''
    }
    const pageHide = () => {
      void fetch('/api/focus/pause', {
        method: 'POST',
        keepalive: true,
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action_id: uuid(), occurred_at: new Date(serverNow()).toISOString(), device_id: deviceId() }),
      })
    }
    window.addEventListener('beforeunload', beforeUnload)
    window.addEventListener('pagehide', pageHide)
    return () => {
      window.removeEventListener('beforeunload', beforeUnload)
      window.removeEventListener('pagehide', pageHide)
    }
  }, [counting])
}
