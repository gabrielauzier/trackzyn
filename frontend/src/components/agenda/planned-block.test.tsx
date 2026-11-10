import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { i18n, renderWithProviders } from '@/test/utils'
import type { PlannedBlock as Planned } from '@/types'
import { PlannedBlock } from './planned-block'

const TODAY = '2026-11-09'
const list = { id: 'l1', name: 'Work', color: 3 }

const coffee: Planned = { id: 'p1', day: TODAY, kind: 'break', start: '10:30', minutes: 15, name: 'Café', list }
const task = (estimate: number | null): Extract<Planned, { kind: 'task' }> => ({
  id: 'p2',
  day: TODAY,
  kind: 'task',
  start: '10:45',
  minutes: 75,
  task: { id: 't1', title: 'Escrever a spec', list, done: false, scheduled_on: TODAY, estimate_minutes: estimate },
})

const piece = (planned: Planned, start: number) => ({ planned, start, end: start + planned.minutes, lane: 0, lanes: 1 })

beforeEach(async () => {
  await i18n.changeLanguage('pt-BR')
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('PlannedBlock (PLAN-24, PLAN-28, PLAN-46, PLAN-47)', () => {
  it('PLAN-28 a break of today has no Começar on the Agenda, and a click opens it', async () => {
    const onOpen = vi.fn()
    const { user } = renderWithProviders(<PlannedBlock piece={piece(coffee, 630)} pxPerMinute={1} onOpen={onOpen} />)

    expect(screen.queryByRole('button', { name: 'Começar' })).toBeNull()
    await user.click(screen.getByRole('button', { name: /^Café, 10:30 – 10:45/ }))
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(coffee)
  })

  it('PLAN-24 draws a break gray and hatched, and a task dashed in the colour of its list that opens on a click', async () => {
    const { user, unmount } = renderWithProviders(<PlannedBlock piece={piece(coffee, 630)} pxPerMinute={1} />)
    expect(screen.getByRole('button', { name: /^Café/ }).style.backgroundImage).toContain('repeating-linear-gradient')
    unmount()

    const onOpen = vi.fn()
    renderWithProviders(<PlannedBlock piece={piece(task(75), 645)} pxPerMinute={1} onOpen={onOpen} />)
    const block = screen.getByRole('button', { name: /^Escrever a spec, 10:45 – 12:00/ })
    expect(block).toHaveClass('border-dashed')
    expect(block.style.borderColor).toContain('var(--chart-3)')
    expect(block.style.backgroundColor).toContain('var(--chart-3)')

    await user.click(block)
    expect(onOpen).toHaveBeenCalledExactlyOnceWith(task(75))
  })

  it('PLAN-46 hovering a planned task shows the title, estimate, planned time, list and what a click does', async () => {
    const { user } = renderWithProviders(<PlannedBlock piece={piece(task(75), 645)} pxPerMinute={1} />)
    await user.hover(screen.getByRole('button', { name: /^Escrever a spec/ }))

    expect((await screen.findByRole('tooltip')).textContent).toBe(
      'Escrever a specEst. 1h 15minPlanejada · 10:45 – 12:00 · 1h 15minWorkClique para abrir o plano do dia',
    )
  })

  it('PLAN-46 a planned task without an estimate says Sem estimativa, and focusing it shows the tooltip too', async () => {
    const { user } = renderWithProviders(<PlannedBlock piece={piece(task(null), 645)} pxPerMinute={1} />)
    await user.tab()

    expect((await screen.findByRole('tooltip')).textContent).toBe('Escrever a specSem estimativaPlanejada · 10:45 – 12:00 · 1h 15minWorkClique para abrir o plano do dia')
  })

  it('PLAN-47 a planned task turns its dashed edge solid and rises above its neighbours on hover; a break does not', () => {
    const { unmount } = renderWithProviders(<PlannedBlock piece={piece(task(75), 645)} pxPerMinute={1} />)
    expect(screen.getByRole('button', { name: /^Escrever a spec/ })).toHaveClass('hover:border-solid', 'hover:z-20')
    unmount()

    renderWithProviders(<PlannedBlock piece={piece(coffee, 630)} pxPerMinute={1} />)
    expect(screen.getByRole('button', { name: /^Café/ })).not.toHaveClass('hover:border-solid')
  })

  it('PLAN-24 a planned task shows no text, only the plan icon in the corner, as a scheduled task shows its clock', () => {
    renderWithProviders(<PlannedBlock piece={piece(task(75), 645)} pxPerMinute={1} />)
    const block = screen.getByRole('button', { name: /^Escrever a spec/ })

    expect(block.textContent).toBe('')
    expect(block.querySelector('[data-slot="plan-icon"]')).not.toBeNull()
  })

  it('PLAN-39 a done planned task fades, and its tooltip crosses out the title and says Concluída', async () => {
    const done: Planned = { ...task(75), task: { ...task(75).task, done: true } }
    const { user } = renderWithProviders(<PlannedBlock piece={piece(done, 645)} pxPerMinute={1} />)
    const block = screen.getByRole('button', { name: /^Escrever a spec/ })
    expect(block).toHaveClass('opacity-50')

    await user.hover(block)
    const tooltip = await screen.findByRole('tooltip')
    expect(tooltip.textContent).toContain('Concluída')
    expect(screen.getAllByText('Escrever a spec').some((title) => title.classList.contains('line-through'))).toBe(true)
  })

  it('PLAN-46 the tooltip of a planned task scheduled for another day says Agendada para that day', async () => {
    const later: Planned = { ...task(75), task: { ...task(75).task, scheduled_on: '2026-11-12' } }
    const { user } = renderWithProviders(<PlannedBlock piece={piece(later, 645)} pxPerMinute={1} />)
    await user.hover(screen.getByRole('button', { name: /^Escrever a spec/ }))

    expect((await screen.findByRole('tooltip')).textContent).toMatch(/Agendada para .+/)
    expect(screen.getByRole('button', { name: /^Escrever a spec/ })).not.toHaveClass('opacity-50')
  })
})
