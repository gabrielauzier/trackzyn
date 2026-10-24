import { useCallback, useEffect, useRef } from 'react'

import { serverNow } from '@/lib/focus/clock'
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
 * Plays the focus sounds as the timer moves (SOUND-01 to SOUND-04), in the window that plays them
 * (SOUND-07) and only the ones turned on on this device (SOUND-06). The first frame plays nothing, so
 * opening the app on a state already settled does not replay what happened while it was closed.
 *
 * `playComplete()` is for completing outside the focus actions, like the board's check (SOUND-01). The
 * completion that later reaches the focus state is not played again.
 */
export function useFocusSounds(state: FocusState | null, display: Display | null) {
  const previous = useRef<SoundFrame | null>(null)
  const completesPlayed = useRef(0)
  const frame = state && display ? frameOf(state, display, serverNow()) : null

  useEffect(() => {
    const before = previous.current
    previous.current = frame
    if (!before || !frame) return
    for (const kind of soundsFor(before, frame)) {
      if (kind === 'complete' && completesPlayed.current > 0) {
        completesPlayed.current -= 1
        continue
      }
      emit(kind)
    }
  })

  const playComplete = useCallback(() => {
    completesPlayed.current += 1
    emit('complete')
  }, [])

  return { playComplete }
}
