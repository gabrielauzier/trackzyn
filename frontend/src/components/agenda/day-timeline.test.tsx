import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { isHiddenSession } from '@/lib/agenda/hide'
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

describe('DayTimeline with hidden sessions (#22)', () => {
  // Tuesday 14:00-15:00 and 14:20-14:22 in São Paulo; the 2-minute one is under a 5-minute minimum.
  const short: AgendaSession = { ...tuesday, id: 'b', started_at: '2026-11-03T17:20:00.000Z', ended_at: '2026-11-03T17:22:00.000Z' }
  const hidden = (session: AgendaSession) => isHiddenSession(session, 5)

  it('HIDE-11 HIDE-14 draws no block for the hidden session and counts it in the day total', () => {
    const { container } = timeline('2026-11-03', { sessions: [tuesday, short], hidden })
    expect(container.querySelector('[data-session-id="b"]')).toBeNull()
    expect(container.querySelector('[data-session-id="a"]')).not.toBeNull()
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tuesday, November 3, 2026 · 1hr 2min')
  })

  it('HIDE-15 gives the whole width to a block that overlaps only a hidden one', () => {
    const { container } = timeline('2026-11-03', { sessions: [tuesday, short], hidden })
    expect(container.querySelector<HTMLElement>('[data-session-id="a"]')!.style.width).toBe('100%')
  })

  it('shows the total and no block, without the empty-day message, on a day whose sessions are all hidden', () => {
    const { container } = timeline('2026-11-03', { sessions: [short], hidden })
    expect(container.querySelectorAll('[data-session-id]')).toHaveLength(0)
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tuesday, November 3, 2026 · 2min')
    expect(screen.queryByText('No sessions on this day. Tap + to record one.')).toBeNull()
  })
})

describe('DayTimeline with joined sessions (#23)', () => {
  // Tuesday in São Paulo: Produto 10:20-11:01 and 11:05-11:16, and Suporte 10:30-11:00.
  const produto = { ...tuesday, list_name: 'Produto' }
  const a: AgendaSession = { ...produto, id: 'a', started_at: '2026-11-03T13:20:00.000Z', ended_at: '2026-11-03T14:01:00.000Z' }
  const b: AgendaSession = { ...produto, id: 'b', task_title: 'Review', started_at: '2026-11-03T14:05:00.000Z', ended_at: '2026-11-03T14:16:00.000Z' }
  const c: AgendaSession = {
    ...tuesday,
    id: 'c',
    task_title: 'Answer tickets',
    list_id: 'l2',
    list_name: 'Suporte',
    started_at: '2026-11-03T13:30:00.000Z',
    ended_at: '2026-11-03T14:00:00.000Z',
  }

  it('MERGE-11 MERGE-20 MERGE-21 MERGE-23 draws the Produto sessions as one block beside Suporte, and heads the day with the sum of the sessions', () => {
    const { container } = timeline('2026-11-03', { sessions: [a, b, c], joinGap: 5 })
    const joined = screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' })
    expect(joined).toHaveAttribute('data-joined')
    expect(container.querySelector('[data-session-id="b"]')).toBeNull()
    expect([joined.style.left, joined.style.width]).toEqual(['0%', '50%'])
    expect(screen.getByRole('button', { name: 'Answer tickets, 10:30 – 11:00' }).style.width).toBe('50%')
    // 41 + 11 + 30 minutes, without the 4 minutes between the Produto sessions.
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Tuesday, November 3, 2026 · 1hr 22min')
  })

  it('MERGE-21 gives a joined block alone the whole width', () => {
    timeline('2026-11-03', { sessions: [a, b], joinGap: 5 })
    expect(screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' }).style.width).toBe('100%')
  })

  it('MERGE-19 leaves a hidden session out, so it does not bridge the gap', () => {
    // 10:20-11:01, a hidden 2-minute one at 11:03-11:05, and 11:08-11:16: 7 minutes apart without it.
    const short: AgendaSession = { ...produto, id: 'short', started_at: '2026-11-03T14:03:00.000Z', ended_at: '2026-11-03T14:05:00.000Z' }
    const later: AgendaSession = { ...produto, id: 'later', started_at: '2026-11-03T14:08:00.000Z', ended_at: '2026-11-03T14:16:00.000Z' }
    const { container } = timeline('2026-11-03', { sessions: [a, short, later], joinGap: 5, hidden: (s) => isHiddenSession(s, 5) })
    expect(container.querySelector('[data-joined]')).toBeNull()
    expect(container.querySelector('[data-session-id="short"]')).toBeNull()
    expect(container.querySelectorAll('[data-session-id]')).toHaveLength(2)
  })

  it('MERGE-27 MERGE-30 calls onSelectGroup with the sessions in start order on a click, and gives the block no handles', async () => {
    const onSelectGroup = vi.fn()
    const { user, container } = timeline('2026-11-03', { sessions: [b, a], joinGap: 5, onSelectGroup, selectedGroup: ['a', 'b'] })
    const joined = screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' })
    expect(joined).toHaveAttribute('aria-pressed', 'true')
    expect(container.querySelector('[data-handle]')).toBeNull()
    await user.click(joined)
    expect(onSelectGroup).toHaveBeenCalledWith([a, b])
  })

  it('MERGE-29 draws the apart session on its own', () => {
    const { container } = timeline('2026-11-03', { sessions: [a, b], joinGap: 5, apartId: 'b', selectedId: 'b' })
    expect(container.querySelector('[data-joined]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Review, 11:05 – 11:16' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeInTheDocument()
  })
})
