import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { weekDays } from '@/lib/agenda/layout'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ScheduledTask } from '@/types'
import { UntimedRow } from './untimed-row'

const WEEK = weekDays('2026-11-02')

function task(id: string, overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id,
    title: `Task ${id}`,
    list: { id: 'l1', name: 'Work', color: 4 },
    column: 'this_week',
    position: 0,
    estimate_minutes: null,
    scheduled_on: '2026-11-04',
    scheduled_time: null,
    series: null,
    ...overrides,
  }
}

function show(untimed: ScheduledTask[]) {
  const onOpenTask = vi.fn()
  const onShowDay = vi.fn()
  const result = renderWithProviders(<UntimedRow days={WEEK} untimed={untimed} onOpenTask={onOpenTask} onShowDay={onShowDay} />)
  return { ...result, onOpenTask, onShowDay }
}

const cell = (container: HTMLElement, day: string) => container.querySelector<HTMLElement>(`[data-untimed-day="${day}"]`)!
const titles = (container: HTMLElement, day: string) =>
  [...cell(container, day).querySelectorAll('[data-untimed-task]')].map((item) => item.querySelector('.truncate')!.textContent)

describe('UntimedRow (US-14, D20)', () => {
  it('shows the crossed-out clock over the hour column with the label and tooltip Agendadas sem hora definida', async () => {
    const { user } = show([])
    const icon = screen.getByRole('img', { name: 'Scheduled without a set time' })
    await user.hover(icon)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Scheduled without a set time')
  })

  it('in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show([])
      expect(screen.getByRole('img', { name: 'Agendadas sem hora definida' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('has a cell per day, aligned to the columns', () => {
    const { container } = show([])
    expect([...container.querySelectorAll('[data-untimed-day]')].map((day) => day.getAttribute('data-untimed-day'))).toEqual(WEEK)
  })

  it('lists the tasks of each day in the order of the board: Today, This week, Backlog, then position', () => {
    const { container } = show([
      task('backlog', { column: 'backlog', position: 0 }),
      task('week-2', { column: 'this_week', position: 2 }),
      task('today', { column: 'today', position: 5 }),
      task('week-1', { column: 'this_week', position: 1 }),
      task('thursday', { scheduled_on: '2026-11-05' }),
    ])
    expect(titles(container, '2026-11-04')).toEqual(['Task today', 'Task week-1', 'Task week-2'])
    expect(titles(container, '2026-11-05')).toEqual(['Task thursday'])
  })

  it('draws each task in the style of a scheduled block, with its title in one line and its estimate on the right', () => {
    const { container } = show([task('a', { title: 'A very long title that does not fit in the cell', estimate_minutes: 90 })])
    const item = cell(container, '2026-11-04').querySelector<HTMLElement>('[data-untimed-task="a"]')!
    expect(item).toHaveClass('h-[26px]', 'border-2', 'border-dotted')
    expect(item.style.backgroundColor).toBe('color-mix(in oklab, var(--chart-4) var(--scheduled-tint), var(--card))')
    expect(item.style.borderColor).toBe('color-mix(in oklab, var(--chart-4) var(--scheduled-edge), transparent)')
    expect(within(item).getByText('A very long title that does not fit in the cell')).toHaveClass('truncate')
    expect(item.lastElementChild).toHaveTextContent('1hr 30min')
  })

  it('shows up to 3 tasks and +X for the rest, labelled with the whole count and the day', async () => {
    const { container, user, onShowDay } = show(['a', 'b', 'c', 'd', 'e'].map((id, position) => task(id, { position })))
    expect(titles(container, '2026-11-04')).toEqual(['Task a', 'Task b', 'Task c'])
    const more = screen.getByRole('button', { name: 'See all 5 tasks scheduled on Wed, Nov 4' })
    expect(more).toHaveTextContent(/^\+2$/)
    await user.click(more)
    expect(onShowDay).toHaveBeenCalledExactlyOnceWith('2026-11-04')
  })

  it('shows no +X with 3 tasks or fewer', () => {
    show(['a', 'b', 'c'].map((id, position) => task(id, { position })))
    expect(screen.queryByRole('button', { name: /^See all/ })).not.toBeInTheDocument()
  })

  it('keeps the same height on every day, empty ones included', () => {
    const { container } = show(['a', 'b', 'c', 'd'].map((id, position) => task(id, { position })))
    const heights = WEEK.map((day) => cell(container, day).style.height)
    expect(new Set(heights)).toEqual(new Set(['112px']))
    expect(cell(container, '2026-11-02').children).toHaveLength(0)
  })

  it('shows the open occurrence of a series without a time with the repeat icon', () => {
    const { container } = show([task('a', { series: { id: 'series-1', rule: { freq: 'daily', interval: 1, weekdays: null, month_day: null, until: null, count: null } } })])
    const item = cell(container, '2026-11-04').querySelector<HTMLElement>('[data-untimed-task="a"]')!
    expect(within(item).getByRole('img', { name: 'Repeats' })).toBeInTheDocument()
  })

  it('opens the task dialog on a click', async () => {
    const { user, onOpenTask } = show([task('a')])
    await user.click(screen.getByRole('button', { name: 'Task a' }))
    expect(onOpenTask).toHaveBeenCalledExactlyOnceWith('a')
  })
})
