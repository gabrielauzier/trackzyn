import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DraftBlock } from '@/lib/plan/draft'
import { usePlanDrag } from '@/lib/plan/use-plan-drag'
import { i18n, renderWithProviders } from '@/test/utils'
import { PlanGrid, type FixedBlock } from './plan-grid'

const DAY = '2026-11-09'
const PX = 1
const list = { id: 'l1', name: 'Work', color: 3 }
const workday = { start: '09:00', end: '18:00' }

const taskBlock = (key: string, start: number, minutes: number): DraftBlock => ({
  key,
  kind: 'task',
  start,
  minutes,
  task: { id: `task-${key}`, title: `Task ${key}`, list, done: false, scheduled_on: null, estimate_minutes: null },
})
const meeting: FixedBlock = { id: 'm1', kind: 'timed', title: 'Meeting', start: 780, minutes: 60, color: 2 }
const session: FixedBlock = { id: 's1', kind: 'session', title: 'Morning work', start: 480, minutes: 30, color: 1 }

function Editable({ blocks, fixed, onMove }: { blocks: DraftBlock[]; fixed: FixedBlock[]; onMove: (key: string, start: number) => void }) {
  const drag = usePlanDrag({ pxPerMinute: PX, onDrop: vi.fn(), onMove, onResize: vi.fn() })
  return <PlanGrid day={DAY} blocks={blocks} fixed={fixed} workday={workday} pxPerMinute={PX} drag={drag} />
}

function show(blocks: DraftBlock[], fixed: FixedBlock[] = []) {
  const onMove = vi.fn()
  return { onMove, ...renderWithProviders(<Editable blocks={blocks} fixed={fixed} onMove={onMove} />) }
}

const blockOf = (key: string) => document.querySelector<HTMLElement>(`[data-plan-block="${key}"]`)!
const fixedOf = (title: string) => screen.getByLabelText(new RegExp(`^${title},`))

beforeEach(() => {
  // jsdom lays nothing out: the plan column starts at the top of the screen.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.hasAttribute('data-plan-column')) return DOMRect.fromRect({ x: 100, y: 0, width: 200, height: 1440 })
    return DOMRect.fromRect({ x: 0, y: 0, width: 0, height: 0 })
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('PlanGrid (PLAN-03)', () => {
  it('draws the hours of the whole day and opens scrolled to the start of the workday', () => {
    show([])
    const scroller = document.querySelector<HTMLElement>('[data-plan-scroll]')!
    expect(scroller.firstElementChild).toHaveStyle({ height: '1440px' })
    expect(scroller.scrollTop).toBe(540)
  })

  it('gives the blocks of the draft a bottom handle and the drag, and the fixed blocks neither', () => {
    show([taskBlock('a', 600, 60)], [meeting, session])
    expect(blockOf('a').querySelector('[data-handle="bottom"]')).not.toBeNull()
    expect(blockOf('a')).toHaveClass('cursor-grab')
    for (const title of ['Meeting', 'Morning work']) {
      expect(fixedOf(title).querySelector('[data-handle]')).toBeNull()
      expect(fixedOf(title)).not.toHaveClass('cursor-grab')
    }
  })

  it('moves a block of the draft, and moves nothing from a fixed block', () => {
    const { onMove } = show([taskBlock('a', 600, 60)], [meeting])
    fireEvent.pointerDown(fixedOf('Meeting'), { clientX: 150, clientY: 790, button: 0 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 850 })
    fireEvent.pointerUp(window, { clientX: 150, clientY: 850 })
    expect(onMove).not.toHaveBeenCalled()

    fireEvent.pointerDown(blockOf('a'), { clientX: 150, clientY: 610, button: 0 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 670 })
    fireEvent.pointerUp(window, { clientX: 150, clientY: 670 })
    expect(onMove).toHaveBeenCalledExactlyOnceWith('a', 660)
  })

  it('marks a timed task as Agendada com hora', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show([], [meeting])
      expect(fixedOf('Meeting')).toHaveTextContent('Agendada com hora')
      expect(fixedOf('Meeting')).toHaveClass('border-dashed')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('without the gestures, gives no block a handle or the drag (PLAN-34)', () => {
    renderWithProviders(<PlanGrid day={DAY} blocks={[taskBlock('a', 600, 60)]} fixed={[]} workday={workday} pxPerMinute={PX} />)
    expect(blockOf('a').querySelector('[data-handle]')).toBeNull()
    expect(blockOf('a')).not.toHaveClass('cursor-grab')
  })
})

describe('PlanGrid lanes and the end of the day (PLAN-44)', () => {
  it('splits the width between overlapping blocks, fixed or not', () => {
    show([taskBlock('a', 600, 60), taskBlock('b', 630, 60)], [meeting])
    expect([blockOf('a').style.left, blockOf('a').style.width]).toEqual(['0%', '50%'])
    expect([blockOf('b').style.left, blockOf('b').style.width]).toEqual(['50%', '50%'])
    // The meeting at 13:00 overlaps nothing: the whole width.
    expect([fixedOf('Meeting').style.left, fixedOf('Meeting').style.width]).toEqual(['0%', '100%'])
  })

  it('ends a block that runs past 24:00 at the edge of the grid, keeping its length', () => {
    show([taskBlock('late', 1380, 120)])
    const block = blockOf('late')
    expect([block.style.top, block.style.height]).toEqual(['1380px', '60px'])
    expect(block).toHaveAccessibleName('Task late, 23:00 – 01:00 · 2hr')
  })
})

describe('PlanGrid workday (PLAN-21)', () => {
  it('marks the start and the end of the workday and shades the hours outside it', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show([])
      const start = document.querySelector<HTMLElement>('[data-workday-edge="start"]')!
      const end = document.querySelector<HTMLElement>('[data-workday-edge="end"]')!
      expect([start.style.top, start.textContent]).toEqual(['540px', 'Início do expediente'])
      expect([end.style.top, end.textContent]).toEqual(['1080px', 'Fim do expediente'])
      const before = document.querySelector<HTMLElement>('[data-off-hours="before"]')!
      const after = document.querySelector<HTMLElement>('[data-off-hours="after"]')!
      expect([before.style.top, before.style.height]).toEqual(['', '540px'])
      expect([after.style.top, after.style.height]).toEqual(['1080px', '360px'])
      expect(before).toHaveClass('bg-muted/60')
    } finally {
      await i18n.changeLanguage('en')
    }
  })
})
