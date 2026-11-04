/** The zoom levels of the agenda: 1x is 48 px per hour, 3x (the default) 144 px. */
export const ZOOMS = [1, 2, 3] as const
export type Zoom = (typeof ZOOMS)[number]
export const DEFAULT_ZOOM: Zoom = 3
/** The height of an hour at 1x. */
const HOUR_PX = 48

export function pxPerMinuteAt(zoom: Zoom): number {
  return (HOUR_PX * zoom) / 60
}
