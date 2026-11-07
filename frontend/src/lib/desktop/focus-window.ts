import { useSyncExternalStore } from 'react'

import { getDesktopApi, isDesktop, type TrackzynApi } from '@/lib/platform'

export { isDesktop }

/**
 * Which desktop window this page runs in. The browser has only one window, the main one (WIDGET-24).
 */
export function windowRole(): 'main' | 'widget' {
  return isDesktop() ? getDesktopApi().windowRole : 'main'
}

/**
 * What the board asks the focus screen: `Focar agora` sends the focus to the widget once it started
 * (WIDGET-01); the desktop's open-without-starting button opens it with nothing started (#14).
 */
export interface FocusRouteState {
  collapse?: boolean
  start?: false
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

/** Tells the other desktop window that the focus changed here (WIDGET-22); nothing in the browser. */
export function notifyFocusChanged(): void {
  if (isDesktop()) getDesktopApi().notifyFocusChanged()
}

/** Runs `callback` when the other desktop window changed the focus. Returns an unsubscribe. */
export function onFocusChanged(callback: () => void): () => void {
  return isDesktop() ? getDesktopApi().onFocusChanged(callback) : () => undefined
}

/**
 * Runs `callback` each time the desktop says the cursor entered (`true`) or left (`false`) the widget
 * window (#34); the page gets no mouse events over the window's drag region. Returns the unsubscribe, or
 * `null` where nothing reports it: the browser, or a desktop bridge from before the hover existed.
 */
export function onWidgetHover(callback: (hovering: boolean) => void): (() => void) | null {
  if (!isDesktop()) return null
  const api = getDesktopApi()
  if (typeof api.onWidgetHover !== 'function') return null
  return api.onWidgetHover((state) => callback(state.hovering === true))
}

const FOCUS_LIST_KEY = 'trackzyn.focus.list'

/** Keeps the list of the focus screen for the widget, which opens on it with a paused task. */
export function rememberFocusList(listId: string): void {
  try {
    localStorage.setItem(FOCUS_LIST_KEY, listId)
  } catch {
    // Without storage the widget follows the open session only.
  }
}

/** The list of the last focus screen of this app, so the widget shows a paused task of it. */
export function rememberedFocusList(): string | undefined {
  try {
    return localStorage.getItem(FOCUS_LIST_KEY) ?? undefined
  } catch {
    return undefined
  }
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
