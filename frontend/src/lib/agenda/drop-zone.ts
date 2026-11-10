import type { DropZone } from '@/lib/agenda/use-grid-drag'

const contains = (rect: DOMRect, clientX: number, clientY: number) =>
  rect.width > 0 && clientX >= rect.left && clientX < rect.right && clientY >= rect.top && clientY < rect.bottom

/**
 * What a scheduled task is over while it is dragged (US-6, US-14): a cell of the `Sem hora` row, or a column of the
 * grid within its scrolled area, with the top of the column on the screen; null anywhere else.
 */
export function dropZoneAt(clientX: number, clientY: number): DropZone | null {
  for (const cell of document.querySelectorAll<HTMLElement>('[data-untimed-day]')) {
    if (contains(cell.getBoundingClientRect(), clientX, clientY)) return { day: cell.dataset.untimedDay!, untimed: true }
  }
  const scroller = document.querySelector<HTMLElement>('[data-agenda-scroll]')
  if (!scroller || !contains(scroller.getBoundingClientRect(), clientX, clientY)) return null
  for (const column of document.querySelectorAll<HTMLElement>('[data-agenda-column]')) {
    const rect = column.getBoundingClientRect()
    if (rect.width > 0 && clientX >= rect.left && clientX < rect.right) return { day: column.dataset.agendaColumn!, untimed: false, top: rect.top }
  }
  return null
}
