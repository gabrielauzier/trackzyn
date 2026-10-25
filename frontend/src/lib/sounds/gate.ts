import { isWidgetOpen, windowRole } from '@/lib/desktop/focus-window'

/**
 * Whether this window plays the focus sounds (SOUND-07): each sound plays once, in the visible window
 * (WIDGET-23). The browser always plays. On the desktop, the widget always plays and the main window
 * only while the widget is closed.
 */
export function shouldPlayHere(): boolean {
  return windowRole() === 'widget' || !isWidgetOpen()
}
