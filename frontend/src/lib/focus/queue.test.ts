import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { FocusAction } from '@/lib/focus/optimistic'
import { conflicts, discard, enqueue, flush, pending, retry, type QueuedAction } from '@/lib/focus/queue'
import type { FocusState } from '@/types'

const NOW = Date.parse('2026-10-25T13:00:00.000Z')
const MIN = 60_000

const pause = (msAgo: number): FocusAction => ({
  type: 'pause',
  occurred_at: new Date(NOW - msAgo).toISOString(),
  device_id: 'device-a',
  list_id: 'list-1',
})

const answered = { server_now: new Date(NOW).toISOString() } as FocusState
const refusal = (status: number, code?: string) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data: { detail: 'refused', code } } })
type Send = (entry: QueuedAction) => Promise<FocusState>
const offline = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' })

describe('the offline focus queue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('SYNC-05 keeps each action with an action_id and the click time, and sends them in order', async () => {
    const first = enqueue(pause(3 * MIN))
    const second = enqueue(pause(2 * MIN))
    const send = vi.fn<Send>(async () => answered)

    expect(first.action_id).toMatch(/^[0-9a-f-]{36}$/)
    expect(first.action.occurred_at).toBe(new Date(NOW - 3 * MIN).toISOString())
    expect(pending().map((entry) => entry.action_id)).toEqual([first.action_id, second.action_id])

    const result = await flush(send, NOW)

    expect(send.mock.calls.map(([entry]) => entry.action_id)).toEqual([first.action_id, second.action_id])
    expect(result.states).toEqual([answered, answered])
    expect(pending()).toEqual([])
  })

  it('SYNC-06 drops an action made 24h01 ago without sending it and reports it; 23h59 is still sent', async () => {
    const stale = enqueue(pause((24 * 60 + 1) * MIN))
    const recent = enqueue(pause((23 * 60 + 59) * MIN))
    const send = vi.fn<Send>(async () => answered)

    const result = await flush(send, NOW)

    expect(result.expired.map((entry) => entry.action_id)).toEqual([stale.action_id])
    expect(send.mock.calls.map(([entry]) => entry.action_id)).toEqual([recent.action_id])
    expect(pending()).toEqual([])
    expect(conflicts()).toEqual([])
  })

  it.each([
    [409, 'invalid_transition'],
    [422, 'invalid_time'],
  ])('SYNC-07 an action refused with %i becomes a conflict, which retry sends again', async (status, code) => {
    const refused = enqueue(pause(MIN))
    await flush(async () => Promise.reject(refusal(status, code)), NOW)

    expect(pending()).toEqual([])
    expect(conflicts()).toEqual([{ ...refused, status, code }])

    retry(refused.action_id)
    expect(conflicts()).toEqual([])
    expect(pending()).toEqual([refused])

    const send = vi.fn<Send>(async () => answered)
    await flush(send, NOW)
    expect(send).toHaveBeenCalledWith(refused)
    expect(pending()).toEqual([])
  })

  it('SYNC-07 discard drops a conflict without sending it', async () => {
    const refused = enqueue(pause(MIN))
    await flush(async () => Promise.reject(refusal(409, 'invalid_transition')), NOW)

    discard(refused.action_id)

    expect(conflicts()).toEqual([])
    expect(pending()).toEqual([])
  })

  it('SYNC-05 a network error keeps the action and the ones after it, in order, and sends nothing more', async () => {
    const actions = [enqueue(pause(3 * MIN)), enqueue(pause(2 * MIN)), enqueue(pause(MIN))]
    const send = vi.fn<Send>(async () => Promise.reject(offline()))

    const result = await flush(send, NOW)

    expect(send).toHaveBeenCalledTimes(1)
    expect(result.offline).toBe(true)
    expect(pending()).toEqual(actions)
    expect(conflicts()).toEqual([])

    const back = vi.fn<Send>(async () => answered)
    await flush(back, NOW)
    expect(back.mock.calls.map(([entry]) => entry)).toEqual(actions)
  })

  it('SYNC-05 the queue and its conflicts survive a page reload', async () => {
    const refused = enqueue(pause(2 * MIN))
    const kept = enqueue(pause(MIN))
    await flush(
      async (entry) => (entry.action_id === refused.action_id ? Promise.reject(refusal(409, 'invalid_transition')) : Promise.reject(offline())),
      NOW,
    )
    expect(localStorage.getItem('trackzyn.focus.queue')).not.toBeNull()

    vi.resetModules()
    const reloaded = await import('@/lib/focus/queue')

    expect(reloaded.pending()).toEqual([kept])
    expect(reloaded.conflicts()).toEqual([{ ...refused, status: 409, code: 'invalid_transition' }])
  })
})
