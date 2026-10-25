import { useEffect } from 'react'

import { deviceId } from '@/lib/focus/device-id'
import { getDesktopApi, isDesktop } from '@/lib/platform'
import type { FocusState } from '@/types'

/**
 * Tells the desktop app whether a task counts on this device, so closing the window asks first, and
 * answers its pause request with `pause` (SYNC-08). Off the desktop it does nothing.
 */
export function useDesktopFocusBridge(state: FocusState | null, pause: () => Promise<unknown>): void {
  const active = state !== null
  const running = state?.session?.kind === 'task' && state.session.device_id === deviceId()

  useEffect(() => {
    if (!isDesktop()) return
    getDesktopApi().reportFocusState({ active, running })
  }, [active, running])

  useEffect(() => {
    if (!isDesktop()) return
    return getDesktopApi().onPauseRequest(async () => {
      await pause()
    })
  }, [pause])

  // Leaving the focus page leaves nothing here to answer a pause request.
  useEffect(
    () => () => {
      if (isDesktop()) getDesktopApi().reportFocusState({ active: false, running: false })
    },
    [],
  )
}
