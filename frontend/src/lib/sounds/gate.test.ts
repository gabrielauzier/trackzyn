import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import type { TrackzynApi } from '@/lib/platform'
import { shouldPlayHere } from '@/lib/sounds/gate'
import { useFocusSounds } from '@/lib/sounds/use-focus-sounds'

afterEach(() => {
  delete window.trackzyn
})

/** A desktop window (`main` or the `widget`) whose bridge sends the widget state on demand. */
function desktopWindow(role: 'main' | 'widget') {
  let widgetState: ((state: { open: boolean }) => void) | null = null
  window.trackzyn = {
    isDesktop: true,
    platform: 'darwin',
    appVersion: '1.0.0',
    windowRole: role,
    onWidgetState: vi.fn((callback: (state: { open: boolean }) => void) => {
      widgetState = callback
      return () => undefined
    }),
  } as unknown as TrackzynApi
  return { sendWidgetState: (open: boolean) => act(() => widgetState?.({ open })) }
}

describe('shouldPlayHere (SOUND-07)', () => {
  it('plays in the browser, with no desktop bridge', () => {
    expect(window.trackzyn).toBeUndefined()

    expect(shouldPlayHere()).toBe(true)
  })

  it('plays in the main window of the desktop app with no widget', () => {
    desktopWindow('main')

    expect(shouldPlayHere()).toBe(true)
  })
})

describe('shouldPlayHere with the focus widget (WIDGET-23)', () => {
  it('with the widget open, the widget plays and the main window does not', () => {
    const widget = desktopWindow('widget')
    shouldPlayHere()
    widget.sendWidgetState(true)
    expect(shouldPlayHere()).toBe(true)

    const main = desktopWindow('main')
    shouldPlayHere()
    main.sendWidgetState(true)
    expect(shouldPlayHere()).toBe(false)
  })

  it('once the widget closes, the main window plays again', () => {
    const main = desktopWindow('main')
    shouldPlayHere()
    main.sendWidgetState(true)
    expect(shouldPlayHere()).toBe(false)

    main.sendWidgetState(false)
    expect(shouldPlayHere()).toBe(true)
  })

  it('a main window with the focus sounds on screen hears the widget open before any sound', () => {
    const main = desktopWindow('main')
    renderHook(() => useFocusSounds(null, null))
    main.sendWidgetState(true)

    expect(shouldPlayHere()).toBe(false)
  })
})
