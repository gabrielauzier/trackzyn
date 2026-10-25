import { isBounds, type Bounds } from './config-store'
import { resolveWindowBounds, type DisplayLike } from './window-state'

/** The widget's two sizes: compact, and grown for the notes field (WIDGET-14). */
export const WIDGET_SIZE = {
  compact: { width: 300, height: 64 },
  notes: { width: 300, height: 240 },
} as const

/** Distance from the screen edges of the first position (WIDGET-09). */
export const WIDGET_MARGIN = 16

/**
 * Where the widget opens, always compact: the saved position while it still lands on a connected
 * screen (WIDGET-10), otherwise the top right corner of the main window's screen (WIDGET-09, -11).
 */
export function widgetBounds(saved: unknown, displays: DisplayLike[], mainDisplay: DisplayLike): Bounds {
  if (isBounds(saved)) {
    const candidate = { x: saved.x, y: saved.y, ...WIDGET_SIZE.compact }
    // The same "still on some screen" check as the main window.
    if (!resolveWindowBounds(candidate, displays).center) return candidate
  }
  const { workArea } = mainDisplay
  return {
    x: workArea.x + workArea.width - WIDGET_SIZE.compact.width - WIDGET_MARGIN,
    y: workArea.y + WIDGET_MARGIN,
    ...WIDGET_SIZE.compact,
  }
}
