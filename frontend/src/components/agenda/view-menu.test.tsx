import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { WeekDay } from '@/lib/agenda/week-days'
import { i18n, renderWithProviders } from '@/test/utils'
import { AgendaViewMenu } from './view-menu'

function menu(props: Partial<Parameters<typeof AgendaViewMenu>[0]> = {}) {
  const handlers = { onDaysChange: vi.fn(), onZoomChange: vi.fn() }
  const result = renderWithProviders(
    <AgendaViewMenu days={[0, 1, 2, 3, 4, 5, 6] as WeekDay[]} showDays zoom={3} {...handlers} {...props} />,
  )
  return { ...result, ...handlers }
}
const open = async (user: ReturnType<typeof renderWithProviders>['user']) => {
  await user.click(screen.getByRole('button', { name: /^View options/ }))
  return screen.findByRole('dialog', { name: 'View options' })
}
const dayBoxes = (panel: HTMLElement) => within(within(panel).getByRole('group', { name: 'Week days' })).getAllByRole('checkbox')

describe('AgendaViewMenu', () => {
  it('DAYS-03 opens below its button on a click and marks the button as expanded', async () => {
    const { user } = menu()
    const button = screen.getByRole('button', { name: 'View options' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    const panel = await open(user)
    expect(panel).toHaveAttribute('data-side', 'bottom')
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('DAYS-04 closes on Esc and on a click outside, giving the focus back to the button', async () => {
    const { user } = menu()
    await open(user)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'View options' })).toHaveFocus()

    await open(user)
    await user.click(document.body)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'View options' })).toHaveFocus()
  })

  it('DAYS-07 lists the seven days from Monday to Sunday, each checked as shown', async () => {
    const { user } = menu({ days: [0, 1, 2, 3, 4] })
    const boxes = dayBoxes(await open(user))
    expect(boxes.map((box) => box.getAttribute('aria-label'))).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ])
    expect(boxes.map((box) => box.getAttribute('aria-checked'))).toEqual(['true', 'true', 'true', 'true', 'true', 'false', 'false'])
  })

  it('DAYS-08 leaves the week days out when they are not asked for, keeping the zoom', async () => {
    const { user } = menu({ showDays: false })
    const panel = await open(user)
    expect(within(panel).queryByRole('group', { name: 'Week days' })).toBeNull()
    expect(within(panel).getByRole('group', { name: 'Zoom' })).toBeInTheDocument()
  })

  it('DAYS-09 DAYS-17 hands over a day unchecked at once, with the menu still open', async () => {
    const { user, onDaysChange } = menu()
    const panel = await open(user)
    await user.click(within(panel).getByRole('checkbox', { name: 'Saturday' }))
    expect(onDaysChange).toHaveBeenCalledWith([0, 1, 2, 3, 4, 6])
    expect(screen.getByRole('dialog', { name: 'View options' })).toBeInTheDocument()
  })

  it('DAYS-11 DAYS-12 hands over Monday to Friday for Mon – Fri and the seven days for All', async () => {
    const { user, onDaysChange } = menu({ days: [2] })
    const panel = await open(user)
    await user.click(within(panel).getByRole('button', { name: 'Mon – Fri' }))
    expect(onDaysChange).toHaveBeenLastCalledWith([0, 1, 2, 3, 4])
    await user.click(within(panel).getByRole('button', { name: 'All' }))
    expect(onDaysChange).toHaveBeenLastCalledWith([0, 1, 2, 3, 4, 5, 6])
  })

  it('DAYS-13 disables the checkbox of the only day shown', async () => {
    const { user } = menu({ days: [3] })
    const boxes = dayBoxes(await open(user))
    expect(boxes[3]).toBeDisabled()
    expect(boxes.filter((box) => box !== boxes[3]).every((box) => !(box as HTMLButtonElement).disabled)).toBe(true)
  })

  it('DAYS-14 marks the button with a dot and N of 7 days while a day is hidden, and not with the seven', () => {
    const { container, unmount } = menu({ days: [0, 1, 2, 3, 4] })
    expect(screen.getByRole('button', { name: 'View options, 5 of 7 days' })).toBeInTheDocument()
    expect(container.querySelector('[data-filter-dot]')).not.toBeNull()
    unmount()

    const seven = menu()
    expect(screen.getByRole('button', { name: 'View options' })).toBeInTheDocument()
    expect(seven.container.querySelector('[data-filter-dot]')).toBeNull()
  })

  it('DAYS-14 leaves the dot off in the day view, where the days are not filtered', () => {
    const { container } = menu({ days: [0, 1, 2, 3, 4], showDays: false })
    expect(screen.getByRole('button', { name: 'View options' })).toBeInTheDocument()
    expect(container.querySelector('[data-filter-dot]')).toBeNull()
  })

  it('DAYS-05 DAYS-18 holds the zoom with 1x, 2x and 3x, one pressed, and hands over a click with the menu open', async () => {
    const { user, onZoomChange } = menu({ zoom: 2 })
    const zoom = within(await open(user)).getByRole('group', { name: 'Zoom' })
    const levels = within(zoom).getAllByRole('button')
    expect(levels.map((level) => [level.textContent, level.getAttribute('aria-pressed')])).toEqual([
      ['1x', 'false'],
      ['2x', 'true'],
      ['3x', 'false'],
    ])
    await user.click(levels[0]!)
    expect(onZoomChange).toHaveBeenCalledWith(1)
    expect(screen.getByRole('dialog', { name: 'View options' })).toBeInTheDocument()
  })

  it('reads Opções de exibição, Dias da semana, Todos, Seg – Sex, Lupa and segunda-feira in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    const { user } = menu({ days: [0, 1, 2, 3, 4] })
    expect(screen.getByRole('button', { name: 'Opções de exibição, 5 de 7 dias' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Opções de exibição/ }))
    const panel = await screen.findByRole('dialog', { name: 'Opções de exibição' })
    expect(within(panel).getByRole('group', { name: 'Dias da semana' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Todos' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Seg – Sex' })).toBeInTheDocument()
    expect(within(panel).getByRole('group', { name: 'Lupa' })).toBeInTheDocument()
    expect(within(panel).getByRole('checkbox', { name: 'Segunda-feira' })).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })
})
