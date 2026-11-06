/** The zoom levels of the agenda: 1x is 48 px per hour, 3x (the default) 144 px. */
export const ZOOMS = [1, 2, 3] as const
export type Zoom = (typeof ZOOMS)[number]
export const DEFAULT_ZOOM: Zoom = 3
/** The height of an hour at 1x. */
const HOUR_PX = 48

export function pxPerMinuteAt(zoom: Zoom): number {
  return (HOUR_PX * zoom) / 60
}

/** Where this device remembers the last zoom picked. */
export const ZOOM_STORAGE_KEY = 'agenda.zoom'

/** The zoom this device last picked, or the default when none is stored, the value is unknown or storage is off. */
export function readZoom(): Zoom {
  try {
    const stored = Number(localStorage.getItem(ZOOM_STORAGE_KEY))
    return ZOOMS.find((zoom) => zoom === stored) ?? DEFAULT_ZOOM
  } catch {
    return DEFAULT_ZOOM
  }
}

/** Remembers `zoom` on this device; without storage, the zoom only lasts the visit. */
export function saveZoom(zoom: Zoom): void {
  try {
    localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom))
  } catch {
    // Storage is off (private window, blocked site data): nothing to remember.
  }
}
