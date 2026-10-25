import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { focus } from '@/lib/api'
import { serverNow, updateOffset } from '@/lib/focus/clock'
import { deviceId } from '@/lib/focus/device-id'
import { type Display, deriveDisplay } from '@/lib/focus/display'
import { type FocusAction, type FocusActionPayload, FocusRefusal, applyOptimistic } from '@/lib/focus/optimistic'
import * as queue from '@/lib/focus/queue'
import type { FocusState } from '@/types'

/** Other devices' changes arrive by polling (AD-003). */
export const POLL_MS = 15_000
/** The signal of an open app (SYNC-10). */
export const HEARTBEAT_MS = 60_000

export const focusQueryKey = (listId: string | undefined) => ['focus', listId ?? null] as const

const answered = (state: FocusState) => {
  updateOffset(state.server_now)
  return state
}

// The query keys whose heartbeat already runs: two hooks on the same list (the page and the app's guard)
// share one state and send one heartbeat.
const beating = new Set<string>()

// One flush at a time, so the queued actions reach the server in the order of their clicks.
let flushing: Promise<unknown> = Promise.resolve()
function flushInOrder(): Promise<queue.FlushResult> {
  const run = flushing.then(() => queue.flush((entry) => focus.send(entry).then(answered)))
  flushing = run.catch(() => undefined)
  return run
}

/**
 * The focus of the list `listId` (design, `lib/focus`): the server's state, polled every 15 s and when
 * the window gets focus; what the timer shows, every second; and the actions, applied on screen at
 * once and sent through the offline queue (SYNC-05). Every answer corrects the clock (FOCUS-03), and
 * while the open session is this device's, a heartbeat goes out every 60 s (SYNC-10). Without `listId`
 * it follows the list of the open session, wherever the user is in the app.
 */
export function useFocus(listId?: string) {
  const queryClient = useQueryClient()
  const key = useMemo(() => focusQueryKey(listId), [listId])
  const [conflicts, setConflicts] = useState(() => queue.conflicts())
  const [expired, setExpired] = useState(0)

  const sendQueued = useCallback(async () => {
    const result = await flushInOrder()
    setConflicts(queue.conflicts())
    if (result.expired.length > 0) setExpired((count) => count + result.expired.length)
    const last = result.states.at(-1)
    // The server's answer replaces the optimistic state once nothing is left to send.
    if (last && queue.pending().length === 0) queryClient.setQueryData(key, last)
    return result
  }, [queryClient, key])

  // Each poll first sends what is still queued (after a reload or while the network was down), so the
  // state it reads already has those actions.
  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      await sendQueued()
      return answered(await focus.get(listId))
    },
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  })
  const state = query.data ?? null

  // Re-render every second: the timer is read from the corrected clock at each render.
  const [, setTick] = useState(0)
  useEffect(() => {
    const timer = setInterval(() => setTick((tick) => tick + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // Send what waited for the network as soon as it comes back.
  useEffect(() => {
    const online = () => void sendQueued()
    window.addEventListener('online', online)
    return () => window.removeEventListener('online', online)
  }, [sendQueued])

  const ownSession = state?.session !== null && state?.session !== undefined && state.session.device_id === deviceId()
  useEffect(() => {
    const id = JSON.stringify(key)
    if (!ownSession || beating.has(id)) return
    beating.add(id)
    const timer = setInterval(() => {
      focus
        .heartbeat(deviceId())
        .then((next) => queryClient.setQueryData(key, answered(next)))
        .catch(() => undefined)
    }, HEARTBEAT_MS)
    return () => {
      clearInterval(timer)
      beating.delete(id)
    }
  }, [ownSession, queryClient, key])

  const act = useCallback(
    (payload: FocusActionPayload) => {
      const now = serverNow()
      const current = queryClient.getQueryData<FocusState>(key)
      const list = listId ?? current?.session?.list_id ?? ''
      const action = { ...payload, occurred_at: new Date(now).toISOString(), device_id: deviceId(), list_id: list } as FocusAction
      if (current) {
        try {
          queryClient.setQueryData(key, applyOptimistic(current, action, now))
        } catch (error) {
          // The server decides; a refusal it confirms comes back as a conflict.
          if (!(error instanceof FocusRefusal)) throw error
        }
      }
      queue.enqueue(action)
      return sendQueued()
    },
    [queryClient, key, listId, sendQueued],
  )

  const actions = useMemo(
    () => ({
      start: (taskId: string, takeover = false) => act({ type: 'start', task_id: taskId, takeover }),
      pause: () => act({ type: 'pause' }),
      skip: (taskId: string) => act({ type: 'skip', task_id: taskId }),
      complete: (taskId: string) => act({ type: 'complete', task_id: taskId }),
      extend: (taskId: string) => act({ type: 'extend', task_id: taskId }),
      takeBreak: (minutes: number) => act({ type: 'break', minutes, list_id: listId ?? '' }),
      endBreak: () => act({ type: 'break/end' }),
      recover: (decision: 'keep' | 'cut') => act({ type: 'recover', decision }),
      retry: (actionId: string) => {
        queue.retry(actionId)
        setConflicts(queue.conflicts())
        return sendQueued()
      },
      discard: (actionId: string) => {
        queue.discard(actionId)
        setConflicts(queue.conflicts())
      },
    }),
    [act, listId, sendQueued],
  )

  const display: Display | null = state ? deriveDisplay(state, serverNow()) : null
  return { state, display, actions, conflicts, expired, isLoading: query.isLoading }
}
