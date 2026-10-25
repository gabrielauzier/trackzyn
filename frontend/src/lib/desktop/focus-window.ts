import { useSyncExternalStore } from 'react'

import { getDesktopApi, isDesktop, type TrackzynApi } from '@/lib/platform'

export { isDesktop }

/**
 * Which desktop window this page runs in. The browser has only one window, the main one (WIDGET-24).
 */
export function windowRole(): 'main' | 'widget' {
  return isDesktop() ? getDesktopApi().windowRole : 'main'
}

/** Opens the focus widget and minimizes the main window; nothing in the browser. */
export function collapseFocus(): Promise<void> {
  return isDesktop() ? getDesktopApi().collapseFocus() : Promise.resolve()
}

/** Closes the widget and brings the main window back (to the board with `task_left`); nothing in the browser. */
export function expandFocus(reason?: 'task_left'): Promise<void> {
  return isDesktop() ? getDesktopApi().expandFocus(reason) : Promise.resolve()
}

/** Grows the widget for the notes field or shrinks it back; nothing in the browser. */
export function resizeWidget(mode: 'compact' | 'notes'): Promise<void> {
  return isDesktop() ? getDesktopApi().resizeWidget(mode) : Promise.resolve()
}

// The last widget state the main process sent. Listened to once per bridge and kept, so a screen that
// mounts after the widget opened still knows it is open.
let source: TrackzynApi | null = null
let open = false
const listeners = new Set<() => void>()

function follow(api: TrackzynApi): void {
  if (source === api) return
  source = api
  open = false
  api.onWidgetState((state) => {
    if (source !== api) return
    open = state.open === true
    for (const listener of listeners) listener()
  })
}

function subscribe(listener: () => void): () => void {
  if (isDesktop()) follow(getDesktopApi())
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether the focus widget is open, as far as this window heard; always `false` in the browser. */
export function isWidgetOpen(): boolean {
  if (!isDesktop()) return false
  follow(getDesktopApi())
  return open
}

/** Whether the focus widget is open; always `false` in the browser. */
export function useWidgetOpen(): boolean {
  return useSyncExternalStore(subscribe, isWidgetOpen, () => false)
}
