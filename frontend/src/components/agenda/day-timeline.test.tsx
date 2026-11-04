import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { i18n, renderWithProviders } from '@/test/utils'
import type { AgendaSession } from '@/types'
import { DayTimeline } from './day-timeline'

const SP = 'America/Sao_Paulo'
// Wednesday 4 November 2026, 14:07 in São Paulo.
const NOW = new Date('2026-11-04T17:07:00.000Z')

// Tuesday 3 November, 14:00 to 15:00 in São Paulo.
const tuesday: AgendaSession = {
  id: 'a',
  kind: 'task',
  origin: 'focus',
  task_id: 't1',
  task_title: 'Write the report',
  list_id: 'l1',
  list_name: 'Work',
  list_color: 3,
  started_at: '2026-11-03T17:00:00.000Z',
  ended_at: '2026-11-03T18:00:00.000Z',
}

function timeline(day: string, props: Partial<Parameters<typeof DayTimeline>[0]> = {}) {
  const handlers = { onPickDay: vi.fn(), onWeek: vi.fn(), onNew: vi.fn() }
  const result = renderWithProviders(
    <DayTimeline day={day} sessions={[tuesday]} timezone={SP} now={NOW} {...handlers} {...props} />,
  )
  return { ...result, ...handlers }
}

const pills = (name = 'Days of the week') => within(screen.getByRole('group', { name })).getAllByRole('button')

describe('DayTimeline', () => {
  it('shows the pills of the seven days from Monday, Sunday the seventh (AGENDA-36)', () => {
    timeline('2026-11-03')
    const all = pills()
    expect(all).toHaveLength(7)
    expect(all[0]).toHaveTextContent('Mon2')
    expect(all[6]).toHaveTextContent('Sun8')
    expect(all[1]).toHaveAttribute('aria-pressed', 'true')
  })

  it('puts a dot on the pills of the days with sessions only (AGENDA-36)', () => {
    const { container } = timeline('2026-11-03')
    expect([...container.querySelectorAll<HTMLElement>('[data-day-pill]')].filter((pill) => pill.querySelector('[data-has-sessions]')).map((pill) => pill.dataset.dayPill)).toEqual([
      '2026-11-03',
    ])
  })

  it('draws the sessions of the day on one column (AGENDA-36)', () => {
    const { container } = timeline('2026-11-03')
    expect(container.querySelectorAll('[data-agenda-column]')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Write the report, 14:00 – 15:00' })).toBeInTheDocument()
  })

  it('shows the day tapped on a pill (AGENDA-37)', async () => {
    const { user, onPickDay } = timeline('2026-11-03')
    await user.click(pills()[4])
    expect(onPickDay).toHaveBeenCalledWith('2026-11-06')
  })

  it('heads the day with its weekday, date and total (AGENDA-37)', () => {
    timeline('2026-11-03')
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tuesday, November 3, 2026 · 1hr')
  })

  it('heads the day in Portuguese (AGENDA-37)', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      timeline('2026-11-03')
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('terça-feira, 3 de novembro de 2026 · 1h')
      expect(pills('Dias da semana')[6]).toHaveTextContent(/^dom/)
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('moves to the week before or after with the arrows (AGENDA-38)', async () => {
    const { user, onWeek } = timeline('2026-11-03')
    await user.click(screen.getByRole('button', { name: 'Previous week' }))
    expect(onWeek).toHaveBeenLastCalledWith(-1)
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(onWeek).toHaveBeenLastCalledWith(1)
  })

  it('tells a past day without sessions to tap + (AGENDA-42)', () => {
    timeline('2026-11-02')
    expect(screen.getByText('No sessions on this day. Tap + to record one.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Monday, November 2, 2026')
  })

  it('tells a future day that it has not come yet (AGENDA-42)', () => {
    timeline('2026-11-05')
    expect(screen.getByText('This day has not come yet. Sessions show up here when you focus.')).toBeInTheDocument()
    expect(screen.queryByText('No sessions on this day. Tap + to record one.')).toBeNull()
  })

  it('shows no empty message on a day with sessions (AGENDA-42)', () => {
    timeline('2026-11-03')
    expect(screen.queryByText('No sessions on this day. Tap + to record one.')).toBeNull()
  })

  it('opens New session from the + button (AGENDA-43)', async () => {
    const { user, onNew } = timeline('2026-11-02')
    await user.click(screen.getByRole('button', { name: 'New session' }))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it('hides + from a viewer (AGENDA-44)', () => {
    timeline('2026-11-02', { onNew: undefined })
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()
  })
})
