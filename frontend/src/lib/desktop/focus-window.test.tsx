import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { collapseFocus, expandFocus, isDesktop, useWidgetOpen, windowRole } from '@/lib/desktop/focus-window'
import type { TrackzynApi } from '@/lib/platform'

function installDesktopApi(role: 'main' | 'widget' = 'main') {
  let widgetState: ((state: { open: boolean }) => void) | null = null
  const api = {
    isDesktop: true,
    windowRole: role,
    collapseFocus: vi.fn(async () => undefined),
    expandFocus: vi.fn(async () => undefined),
    onWidgetState: vi.fn((callback: (state: { open: boolean }) => void) => {
      widgetState = callback
      return () => undefined
    }),
  }
  Object.defineProperty(window, 'trackzyn', { value: api as unknown as TrackzynApi, configurable: true })
  return { api, sendWidgetState: (open: boolean) => act(() => widgetState!({ open })) }
}

afterEach(() => {
  Reflect.deleteProperty(window, 'trackzyn')
})

describe('focus window hooks in the browser (WIDGET-24)', () => {
  it('without window.trackzyn, is not desktop, runs as the main window and the widget is closed', async () => {
    expect(window.trackzyn).toBeUndefined()

    expect(isDesktop()).toBe(false)
    expect(windowRole()).toBe('main')
    await expect(collapseFocus()).resolves.toBeUndefined()
    await expect(expandFocus()).resolves.toBeUndefined()
    await expect(expandFocus('task_left')).resolves.toBeUndefined()
    const { result } = renderHook(() => useWidgetOpen())
    expect(result.current).toBe(false)
  })
})

describe('focus window hooks on the desktop', () => {
  it('is desktop and reads the window role from the bridge', () => {
    installDesktopApi('widget')
    expect(isDesktop()).toBe(true)
    expect(windowRole()).toBe('widget')

    installDesktopApi('main')
    expect(windowRole()).toBe('main')
  })

  it('collapses through the bridge', async () => {
    const { api } = installDesktopApi()
    await collapseFocus()
    expect(api.collapseFocus).toHaveBeenCalledTimes(1)
  })

  it('expands to the focus screen, or to the board when the task left Today', async () => {
    const { api } = installDesktopApi('widget')
    await expandFocus()
    await expandFocus('task_left')
    expect(api.expandFocus.mock.calls).toEqual([[undefined], ['task_left']])
  })

  it('follows the widget state the main process sends', () => {
    const { sendWidgetState } = installDesktopApi()
    const { result } = renderHook(() => useWidgetOpen())
    expect(result.current).toBe(false)

    sendWidgetState(true)
    expect(result.current).toBe(true)

    sendWidgetState(false)
    expect(result.current).toBe(false)
  })

  it('a hook mounted after the widget opened reads it as open', () => {
    const { sendWidgetState } = installDesktopApi()
    const first = renderHook(() => useWidgetOpen())
    sendWidgetState(true)
    first.unmount()

    const { result } = renderHook(() => useWidgetOpen())
    expect(result.current).toBe(true)
  })
})
