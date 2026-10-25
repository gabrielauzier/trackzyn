import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TrackzynApi } from '../shared/ipc'

type Listener = (event: unknown, ...args: unknown[]) => void

const bridge = vi.hoisted(() => {
  const listeners = new Map<string, Set<Listener>>()
  return {
    exposed: null as { key: string; api: unknown } | null,
    listeners,
    invoke: vi.fn<(...args: unknown[]) => Promise<undefined>>(async () => undefined),
    emit: (channel: string, ...args: unknown[]) => {
      for (const listener of listeners.get(channel) ?? []) listener({}, ...args)
    },
  }
})

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, api: unknown) => {
      bridge.exposed = { key, api }
    },
  },
  ipcRenderer: {
    invoke: bridge.invoke,
    on: (channel: string, listener: Listener) => {
      if (!bridge.listeners.has(channel)) bridge.listeners.set(channel, new Set())
      bridge.listeners.get(channel)!.add(listener)
    },
    removeListener: (channel: string, listener: Listener) => {
      bridge.listeners.get(channel)?.delete(listener)
    },
  },
}))

async function loadApi(): Promise<TrackzynApi> {
  await import('./index')
  expect(bridge.exposed?.key).toBe('trackzyn')
  return bridge.exposed!.api as TrackzynApi
}

beforeEach(() => {
  bridge.invoke.mockClear()
})

describe('preload bridge (SYNC-08)', () => {
  it('exposes exactly fifteen members, the two focus ones included', async () => {
    const api = await loadApi()
    expect(Object.keys(api).sort()).toEqual([
      'appVersion',
      'getMode',
      'getServerUrl',
      'installUpdate',
      'isDesktop',
      'onExportState',
      'onPauseRequest',
      'onUpdateAvailable',
      'openExternal',
      'openLogs',
      'platform',
      'reportFocusState',
      'setServerUrl',
      'startLocal',
      'startSso',
    ])
    expect(Object.keys(api)).toHaveLength(15)
  })

  it('reportFocusState sends the state on focus:state', async () => {
    const api = await loadApi()
    api.reportFocusState({ active: true, running: true })
    api.reportFocusState({ active: true, running: false })
    expect(bridge.invoke.mock.calls).toEqual([
      ['focus:state', { active: true, running: true }],
      ['focus:state', { active: true, running: false }],
    ])
  })

  it('onPauseRequest runs the callback on focus:pause-request and answers there once it resolves', async () => {
    const api = await loadApi()
    let resolvePause!: () => void
    const callback = vi.fn(() => new Promise<void>((resolve) => (resolvePause = resolve)))
    const unsubscribe = api.onPauseRequest(callback)

    bridge.emit('focus:pause-request')
    expect(callback).toHaveBeenCalledTimes(1)
    await Promise.resolve()
    expect(bridge.invoke).not.toHaveBeenCalled()

    resolvePause()
    await vi.waitFor(() => expect(bridge.invoke.mock.calls).toEqual([['focus:pause-request']]))

    unsubscribe()
    bridge.emit('focus:pause-request')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('answers the pause request even when the callback fails', async () => {
    const api = await loadApi()
    const unsubscribe = api.onPauseRequest(() => Promise.reject(new Error('offline')))
    bridge.emit('focus:pause-request')
    await vi.waitFor(() => expect(bridge.invoke.mock.calls).toEqual([['focus:pause-request']]))
    unsubscribe()
  })
})
