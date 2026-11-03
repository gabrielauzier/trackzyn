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
  it('exposes exactly twenty-two members, the focus and widget ones included', async () => {
    const api = await loadApi()
    expect(Object.keys(api).sort()).toEqual([
      'appVersion',
      'collapseFocus',
      'expandFocus',
      'getMode',
      'getServerUrl',
      'installUpdate',
      'isDesktop',
      'notifyFocusChanged',
      'onExportState',
      'onFocusChanged',
      'onPauseRequest',
      'onUpdateAvailable',
      'onWidgetState',
      'openExternal',
      'openLogs',
      'platform',
      'reportFocusState',
      'resizeWidget',
      'setServerUrl',
      'startLocal',
      'startSso',
      'windowRole',
    ])
    expect(Object.keys(api)).toHaveLength(22)
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

describe('preload bridge for the focus widget (WIDGET-22, WIDGET-24)', () => {
  async function loadWithArgs(args: string[]): Promise<TrackzynApi> {
    const original = process.argv
    process.argv = [...original, ...args]
    try {
      vi.resetModules()
      bridge.exposed = null
      return await loadApi()
    } finally {
      process.argv = original
    }
  }

  it('windowRole is widget with the widget argument and main without it', async () => {
    expect((await loadWithArgs(['--trackzyn-window-role=widget'])).windowRole).toBe('widget')
    expect((await loadWithArgs([])).windowRole).toBe('main')
    expect((await loadWithArgs(['--trackzyn-window-role=main'])).windowRole).toBe('main')
    expect((await loadWithArgs(['--trackzyn-window-role=widgets'])).windowRole).toBe('main')
  })

  it('collapseFocus, expandFocus and resizeWidget invoke their channels with their arguments', async () => {
    const api = await loadApi()
    await api.collapseFocus()
    await api.expandFocus()
    await api.expandFocus('task_left')
    await api.resizeWidget('notes')
    await api.resizeWidget('compact')
    expect(bridge.invoke.mock.calls).toEqual([
      ['focus:collapse'],
      ['focus:expand', undefined],
      ['focus:expand', 'task_left'],
      ['widget:resize', 'notes'],
      ['widget:resize', 'compact'],
    ])
  })

  it('notifyFocusChanged sends on focus:changed and swallows a failure', async () => {
    const api = await loadApi()
    bridge.invoke.mockRejectedValueOnce(new Error('closed'))
    expect(api.notifyFocusChanged()).toBeUndefined()
    expect(bridge.invoke.mock.calls).toEqual([['focus:changed']])
  })

  it('onFocusChanged runs the callback on focus:changed until unsubscribed', async () => {
    const api = await loadApi()
    const callback = vi.fn()
    const unsubscribe = api.onFocusChanged(callback)
    bridge.emit('focus:changed')
    expect(callback).toHaveBeenCalledTimes(1)
    unsubscribe()
    bridge.emit('focus:changed')
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('onWidgetState passes the open state from widget:state until unsubscribed', async () => {
    const api = await loadApi()
    const callback = vi.fn()
    const unsubscribe = api.onWidgetState(callback)
    bridge.emit('widget:state', { open: true })
    bridge.emit('widget:state', { open: false })
    expect(callback.mock.calls).toEqual([[{ open: true }], [{ open: false }]])
    unsubscribe()
    bridge.emit('widget:state', { open: true })
    expect(callback).toHaveBeenCalledTimes(2)
  })
})
