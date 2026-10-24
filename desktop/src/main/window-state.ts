import { isBounds, type Bounds } from './config-store'

export interface DisplayLike {
  workArea: Bounds
}

export type ResolvedBounds = { x: number; y: number; width: number; height: number; center: false } | { width: number; height: number; center: true }

export const DEFAULT_SIZE = { width: 1280, height: 800 }
export const MIN_SIZE = { width: 800, height: 600 }

function intersects(a: Bounds, b: Bounds): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

/**
 * The saved bounds when they still land on a connected display, otherwise a
 * centered default (the monitor they were on is gone).
 */
export function resolveWindowBounds(saved: unknown, displays: DisplayLike[]): ResolvedBounds {
  if (isBounds(saved) && displays.some((display) => intersects(saved, display.workArea))) {
    return {
      x: saved.x,
      y: saved.y,
      width: Math.max(saved.width, MIN_SIZE.width),
      height: Math.max(saved.height, MIN_SIZE.height),
      center: false,
    }
  }
  return { ...DEFAULT_SIZE, center: true }
}

export function windowOptions({ platform, bounds }: { platform: string; bounds: ResolvedBounds }) {
  return {
    ...bounds,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    // macOS keeps the traffic lights over the app's own header.
    ...(platform === 'darwin' ? { titleBarStyle: 'hiddenInset' as const } : {}),
  }
}

interface TrackableWindow {
  getNormalBounds(): Bounds
  on(event: 'move' | 'resize' | 'close', listener: () => void): unknown
}

/** Persists the window rectangle on close and shortly after each move or resize. */
export function trackWindowState(win: TrackableWindow, store: { setBounds(bounds: Bounds): void }, delayMs = 500) {
  let timer: ReturnType<typeof setTimeout> | null = null
  const save = () => {
    if (timer) clearTimeout(timer)
    timer = null
    store.setBounds(win.getNormalBounds())
  }
  const schedule = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(save, delayMs)
  }
  win.on('move', schedule)
  win.on('resize', schedule)
  win.on('close', save)
}
