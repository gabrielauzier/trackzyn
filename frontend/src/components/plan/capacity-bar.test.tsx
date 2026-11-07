import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { capacity, type FixedTimed } from '@/lib/plan/capacity'
import type { DraftBlock } from '@/lib/plan/draft'
import { i18n, renderWithProviders } from '@/test/utils'
import { CapacityBar } from './capacity-bar'

const list = { id: 'l1', name: 'Work', color: 1 }
const workday = { start: '09:00', end: '18:00' }
const task = (key: string, start: number, minutes: number): DraftBlock => ({
  key,
  kind: 'task',
  start,
  minutes,
  task: { id: key, title: key, list, done: false, scheduled_on: null, estimate_minutes: null },
})
const lunch: DraftBlock = { key: 'lunch', kind: 'break', start: 720, minutes: 60, name: 'Almoço', list }
// 9h of tasks.
const nineHours = [task('a', 540, 180), task('b', 780, 240), task('c', 1020, 120)]
const meeting: FixedTimed = { id: 'm', scheduled_time: '13:00', estimate_minutes: 60 }

const text = () => document.querySelector('[data-slot="capacity-text"]')!
const overText = () => document.querySelector('[data-slot="capacity-over-text"]')

function show(blocks: DraftBlock[], fixed: FixedTimed[] = [], onEditWorkday?: () => void) {
  return renderWithProviders(<CapacityBar capacity={capacity(blocks, fixed, workday)} workday={workday} onEditWorkday={onEditWorkday} />)
}

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})
afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('CapacityBar (PLAN-19)', () => {
  it('shows the planned time of the free time and the breaks, without the scheduled part when there is none', () => {
    show([task('a', 540, 240), lunch])
    expect(text().textContent).toBe('4h planejadas de 8h livres · 1h em pausas')
    expect(text()).not.toHaveClass('text-destructive')
    expect(overText()).toBeNull()
    expect(screen.getByRole('img', { name: '50% do tempo livre planejado' })).toBeInTheDocument()
    expect(document.querySelector<HTMLElement>('[data-slot="capacity-fill"]')!.style.width).toBe('50%')
  })

  it('adds · <agendadas> agendadas when a timed task has no block', () => {
    show([task('a', 540, 240), lunch], [meeting])
    expect(text().textContent).toBe('4h planejadas de 7h livres · 1h em pausas · 1h agendadas')
  })

  it('shows the workday and opens its editor', async () => {
    const onEditWorkday = vi.fn()
    const { user } = show([], [], onEditWorkday)
    await user.click(screen.getByRole('button', { name: 'Expediente 09:00 – 18:00' }))
    expect(onEditWorkday).toHaveBeenCalledOnce()
  })
})

describe('CapacityBar past the free time (PLAN-20)', () => {
  it('turns red with 1h além do expediente: 9h of tasks and a lunch of 1h', () => {
    show([...nineHours, lunch])
    expect(text().textContent).toBe('9h planejadas de 8h livres · 1h em pausas')
    expect(text()).toHaveClass('text-destructive')
    expect(overText()).toHaveTextContent('1h além do expediente')
    expect(document.querySelector('[data-slot="capacity-fill"]')).toHaveClass('bg-destructive')
    expect(document.querySelector('[data-slot="capacity-over"]')).not.toBeNull()
    expect(screen.getByRole('img', { name: '113% do tempo livre planejado' })).toBeInTheDocument()
  })

  it('shows 2h além do expediente with a meeting of 1h scheduled at 13:00', () => {
    show([...nineHours, lunch], [meeting])
    expect(text().textContent).toBe('9h planejadas de 7h livres · 1h em pausas · 1h agendadas')
    expect(overText()).toHaveTextContent('2h além do expediente')
  })

  it('stays out of red when the planned time is exactly the free time', () => {
    show([task('a', 540, 480), lunch])
    expect(text().textContent).toBe('8h planejadas de 8h livres · 1h em pausas')
    expect(overText()).toBeNull()
    expect(document.querySelector('[data-slot="capacity-fill"]')).not.toHaveClass('bg-destructive')
  })
})
