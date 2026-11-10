import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DraftBlock } from '@/lib/plan/draft'
import { i18n, renderWithProviders } from '@/test/utils'
import type { PlanTaskRef } from '@/types'
import { PlanBlock, type LaidPlanBlock } from './plan-block'

const DAY = '2026-11-09'

function task(overrides: Partial<PlanTaskRef> = {}): PlanTaskRef {
  return {
    id: 't1',
    title: 'Review the PR',
    list: { id: 'l1', name: 'Work', color: 3 },
    done: false,
    scheduled_on: null,
    estimate_minutes: 90,
    ...overrides,
  }
}

const taskBlock = (overrides: Partial<PlanTaskRef> = {}): DraftBlock => ({ key: 'b1', kind: 'task', start: 540, minutes: 90, task: task(overrides) })
const breakBlock: DraftBlock = { key: 'b2', kind: 'break', start: 720, minutes: 60, name: 'Lunch', list: { id: 'l1', name: 'Work', color: 3 } }

const laid = (block: DraftBlock): LaidPlanBlock => ({ block, start: block.start, end: block.start + block.minutes, lane: 0, lanes: 1 })

function show(block: DraftBlock, props: { onOpen?: () => void; onPointerDown?: () => void } = {}) {
  return renderWithProviders(<PlanBlock piece={laid(block)} day={DAY} pxPerMinute={2} {...props} />)
}

describe('PlanBlock (PLAN-15, PLAN-38, PLAN-39)', () => {
  it('shows the title, HH:MM – HH:MM and the length of a task, with the Agenda 2px dashed edge and faint fill in its list colour', () => {
    show(taskBlock())
    const block = screen.getByRole('button', { name: 'Review the PR, 09:00 – 10:30 · 1hr 30min' })
    expect(block.querySelector('[data-slot="plan-block-title"]')).toHaveTextContent('Review the PR')
    expect(block.querySelector('[data-slot="plan-block-time"]')).toHaveTextContent('09:00 – 10:30 · 1hr 30min')
    expect(block).toHaveClass('border-2', 'border-dashed')
    expect(block).not.toHaveClass('border-l-4')
    // The same fill and edge as a planned or scheduled task on the Agenda.
    expect(block.style.borderColor).toBe('color-mix(in oklab, var(--chart-3) var(--scheduled-edge), transparent)')
    expect(block.style.borderLeftStyle).toBe('')
    expect(block.style.backgroundColor).toBe('color-mix(in oklab, var(--chart-3) var(--scheduled-tint), var(--card))')
    expect([block.style.top, block.style.height]).toEqual(['1080px', '180px'])
  })

  it('draws a break gray and hatched with a dashed edge, with its name and HH:MM – HH:MM, unlike a task', () => {
    show(breakBlock)
    const block = screen.getByRole('button', { name: 'Lunch, 12:00 – 13:00' })
    expect(block).toHaveAttribute('data-kind', 'break')
    expect(block.style.backgroundImage).toBe('repeating-linear-gradient(135deg, var(--muted) 0 6px, var(--border) 6px 8px)')
    expect(block).toHaveClass('border-2', 'border-dashed', 'border-muted-foreground/60')
    expect(block).not.toHaveClass('border-l-4')
    expect(block.style.borderColor).toBe('')
  })

  it('crosses out a done task (PLAN-39)', () => {
    show(taskBlock({ done: true }))
    const block = screen.getByRole('button')
    expect(block).toHaveAttribute('data-done', 'true')
    expect(block.querySelector('[data-slot="plan-block-title"]')).toHaveClass('line-through')
  })

  it('does not cross out a pending task', () => {
    show(taskBlock())
    expect(screen.getByRole('button').querySelector('[data-slot="plan-block-title"]')).not.toHaveClass('line-through')
  })

  it('shows Agendada para <dia> on a task scheduled for another day (PLAN-38)', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show(taskBlock({ scheduled_on: '2026-11-11' }))
      expect(screen.getByRole('button').querySelector('[data-slot="plan-block-elsewhere"]')).toHaveTextContent('Agendada para qua, 11 nov')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('shows no badge on a task scheduled for the day of the plan, or with no day', () => {
    const { unmount } = show(taskBlock({ scheduled_on: DAY }))
    expect(screen.getByRole('button').querySelector('[data-slot="plan-block-elsewhere"]')).toBeNull()
    unmount()
    show(taskBlock())
    expect(screen.getByRole('button').querySelector('[data-slot="plan-block-elsewhere"]')).toBeNull()
  })

  it('opens on a click and on Enter (PLAN-06)', async () => {
    const onOpen = vi.fn()
    const { user } = show(taskBlock(), { onOpen })
    await user.click(screen.getByRole('button'))
    screen.getByRole('button').focus()
    await user.keyboard('{Enter}')
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('PLAN-47 a block that opens or moves, task or break, takes the ring on hover and keeps its dashed edge; one that only shows does not', () => {
    const { unmount } = show(taskBlock(), { onOpen: vi.fn() })
    expect(screen.getByRole('button', { name: /^Review the PR/ })).toHaveClass('border-dashed', 'hover:ring-2', 'hover:ring-primary', 'hover:ring-offset-1', 'hover:z-20')
    unmount()
    const again = show(breakBlock, { onPointerDown: vi.fn() })
    expect(screen.getByRole('button', { name: /^Lunch/ })).toHaveClass('border-dashed', 'hover:ring-2', 'hover:ring-primary', 'hover:ring-offset-1', 'hover:z-20')
    again.unmount()
    show(breakBlock)
    expect(screen.getByRole('button', { name: /^Lunch/ })).not.toHaveClass('hover:ring-2')
  })
})
