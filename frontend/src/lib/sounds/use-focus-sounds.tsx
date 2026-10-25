import { useCallback, useEffect, useRef } from 'react'

import { serverNow } from '@/lib/focus/clock'
import { deviceId } from '@/lib/focus/device-id'
import type { Display } from '@/lib/focus/display'
import { shouldPlayHere } from '@/lib/sounds/gate'
import { isEnabled } from '@/lib/sounds/prefs'
import { type SoundKind, play } from '@/lib/sounds/synth'
import { type SoundFrame, frameOf, soundsFor } from '@/lib/sounds/triggers'
import type { FocusState } from '@/types'

function emit(kind: SoundKind): void {
  if (shouldPlayHere() && isEnabled(kind)) play(kind)
}

/**
 * Plays the focus sounds as the timer moves (SOUND-02 to SOUND-04), only on the device that holds the
 * session, in the window that plays them (SOUND-07) and only the ones turned on on this device
 * (SOUND-06). The first frame plays nothing, so opening the app on a state already settled does not
 * replay what happened while it was closed.
 *
 * `playComplete()` is called by the local action that completes a task: `Concluir` on the focus screen
 * or the widget, the check or a drag to Concluídas on the board (SOUND-01). A completion seen through
 * polling plays nothing.
 */
export function useFocusSounds(state: FocusState | null, display: Display | null) {
  const previous = useRef<SoundFrame | null>(null)
  const frame = state && display ? frameOf(state, display, serverNow(), deviceId()) : null

  useEffect(() => {
    const before = previous.current
    previous.current = frame
    if (!before || !frame) return
    for (const kind of soundsFor(before, frame)) emit(kind)
  })

  const playComplete = useCallback(() => emit('complete'), [])

  return { playComplete }
}
