import { afterEach, describe, expect, it, vi } from 'vitest'

import { dropZoneAt } from './drop-zone'

/** An element whose box on the screen is `rect`, as a browser lays it out. */
function box(attributes: Record<string, string>, rect: { x: number; y: number; width: number; height: number }) {
  const element = document.createElement('div')
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value)
  element.getBoundingClientRect = () => DOMRect.fromRect(rect)
  document.body.append(element)
  return element
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('dropZoneAt (US-6, AGENDA-02)', () => {
  it('finds the column under the pointer below the pinned headers, and nothing under them', () => {
    // The page scrolled: the body starts above the window, and the pinned headers cover its top 200 px.
    box({ 'data-agenda-sticky': '' }, { x: 0, y: 0, width: 700, height: 200 })
    box({ 'data-agenda-body': '' }, { x: 0, y: -800, width: 700, height: 3000 })
    box({ 'data-agenda-column': '2026-11-05' }, { x: 100, y: -800, width: 100, height: 3000 })

    expect(dropZoneAt(150, 400)).toEqual({ day: '2026-11-05', untimed: false, top: -800 })
    expect(dropZoneAt(150, 150)).toBeNull()
  })

  it('a cell of the Sem hora row, inside the pinned headers, still takes the drop', () => {
    box({ 'data-agenda-sticky': '' }, { x: 0, y: 0, width: 700, height: 200 })
    box({ 'data-untimed-day': '2026-11-05' }, { x: 100, y: 150, width: 100, height: 40 })
    box({ 'data-agenda-body': '' }, { x: 0, y: -800, width: 700, height: 3000 })

    expect(dropZoneAt(150, 170)).toEqual({ day: '2026-11-05', untimed: true })
  })
})
