import type { CSSProperties } from 'react'

/** The fill and the dashed edge of a scheduled task in its list colour, fainter than a session's (US-5, index.css). */
export function scheduledColors(color: number): CSSProperties {
  const list = `var(--chart-${color})`
  return {
    backgroundColor: `color-mix(in oklab, ${list} var(--scheduled-tint), var(--card))`,
    borderColor: `color-mix(in oklab, ${list} var(--scheduled-edge), transparent)`,
  }
}
