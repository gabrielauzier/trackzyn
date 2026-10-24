/**
 * Whether this window plays the focus sounds (SOUND-07). The browser always does. The desktop app has
 * only its main window in this feature, so it plays too; `widget-desktop` adds the widget and the rule
 * that only one of the two windows plays (WIDGET-23).
 */
export function shouldPlayHere(): boolean {
  return true
}
