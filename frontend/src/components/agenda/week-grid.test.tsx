import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { dayLimit, weekDays } from '@/lib/agenda/layout'
import { useGridDrag, type Draft } from '@/lib/agenda/use-grid-drag'
import { renderWithProviders } from '@/test/utils'
import type { AgendaSession } from '@/types'
import { PX_PER_MINUTE, WeekGrid } from './week-grid'

const SP = 'America/Sao_Paulo'
const WEEK = weekDays('2026-11-02')
// Wednesday 4 November 2026, 14:07 in São Paulo.
const NOW = new Date('2026-11-04T17:07:00.000Z')

function session(id: string, startedAt: string, endedAt: string | null, overrides: Partial<AgendaSession> = {}): AgendaSession {
  return {
    id,
    kind: 'task',
    origin: 'focus',
    task_id: `task-${id}`,
    task_title: `Task ${id}`,
    list_id: 'l1',
    list_name: 'Work',
    list_color: 3,
    started_at: startedAt,
    ended_at: endedAt,
    ...overrides,
  }
}

/** The grid as the page wires it, with the drag gestures. */
function Grid({
  sessions,
  onCommit = vi.fn(),
  selectedId = null,
}: {
  sessions: AgendaSession[]
  onCommit?: (draft: Draft) => void
  selectedId?: string | null
}) {
  const drag = useGridDrag({ pxPerMinute: PX_PER_MINUTE, limit: (day) => dayLimit(day, NOW, SP), onCommit })
  return <WeekGrid days={WEEK} sessions={sessions} timezone={SP} now={NOW} drag={drag} selectedId={selectedId} />
}

const header = (container: HTMLElement, day: string) => container.querySelector<HTMLElement>(`[data-day-header="${day}"]`)!
const column = (container: HTMLElement, day: string) => container.querySelector<HTMLElement>(`[data-agenda-column="${day}"]`)!
const y = (hours: number, minutes = 0) => (hours * 60 + minutes) * PX_PER_MINUTE

describe('WeekGrid', () => {
  it('shows 7 columns from Monday to Sunday with the task time of each day (AGENDA-01)', () => {
    const { container } = renderWithProviders(
      <Grid
        sessions={[
          // Monday: 08:00 to 14:00 and 15:00 to 15:15 of tasks, plus a break that does not count.
          session('a', '2026-11-02T11:00:00.000Z', '2026-11-02T17:00:00.000Z'),
          session('b', '2026-11-02T18:00:00.000Z', '2026-11-02T18:15:00.000Z'),
          session('c', '2026-11-02T19:00:00.000Z', '2026-11-02T19:30:00.000Z', { kind: 'break', task_id: null, task_title: null }),
        ]}
      />,
    )
    const headers = [...container.querySelectorAll<HTMLElement>('[data-day-header]')]
    expect(headers.map((cell) => cell.dataset.dayHeader)).toEqual(WEEK)
    expect(headers.map((cell) => cell.textContent?.slice(0, 3))).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
    expect(header(container, '2026-11-02')).toHaveTextContent('2')
    expect(header(container, '2026-11-02')).toHaveTextContent('6hr 15min')
  })

  it('leaves the days without sessions without a total (AGENDA-11)', () => {
    const { container } = renderWithProviders(<Grid sessions={[]} />)
    for (const day of WEEK) expect(header(container, day).textContent).toMatch(/^[A-Za-z]{3}\d{1,2}$/)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('reserves the scrollbar width in the day header as in the scrolling grid, so their columns line up', () => {
    const { container } = renderWithProviders(<Grid sessions={[]} />)
    const headerRow = container.querySelector('[data-agenda-header]')!
    const grid = container.querySelector('[data-agenda-scroll]')!
    for (const element of [headerRow, grid]) expect(element).toHaveClass('[scrollbar-gutter:stable]')
    expect(headerRow).toHaveClass('overflow-y-hidden')
    expect(grid).toHaveClass('overflow-y-auto')
  })

  it('has a line per hour from 00:00 to 24:00 and opens scrolled to 07:00 (AGENDA-01, AGENDA-02)', () => {
    const { container } = renderWithProviders(<Grid sessions={[]} />)
    const scroller = container.querySelector<HTMLElement>('[data-agenda-scroll]')!
    expect(scroller.scrollTop).toBe(y(7))
    expect(within(scroller).getByText('07:00')).toBeInTheDocument()
    expect(within(scroller).getByText('23:00')).toBeInTheDocument()
    expect((scroller.firstElementChild as HTMLElement).style.height).toBe(`${y(24)}px`)
  })

  it('places overlapping sessions side by side (AGENDA-06)', () => {
    renderWithProviders(
      <Grid
        sessions={[
          session('a', '2026-11-02T13:00:00.000Z', '2026-11-02T14:00:00.000Z'),
          session('b', '2026-11-02T13:30:00.000Z', '2026-11-02T14:30:00.000Z'),
        ]}
      />,
    )
    const a = screen.getByRole('button', { name: 'Task a, 10:00 – 11:00' })
    const b = screen.getByRole('button', { name: 'Task b, 10:30 – 11:30' })
    expect([a.style.left, a.style.width]).toEqual(['0%', '50%'])
    expect([b.style.left, b.style.width]).toEqual(['50%', '50%'])
  })

  it('draws a session across midnight on both days (AGENDA-07)', () => {
    const { container } = renderWithProviders(
      <Grid sessions={[session('a', '2026-11-03T02:30:00.000Z', '2026-11-03T03:30:00.000Z')]} />,
    )
    expect(within(column(container, '2026-11-02')).getByRole('button', { name: 'Task a, 23:30 – 00:30' })).toBeInTheDocument()
    expect(within(column(container, '2026-11-03')).getByRole('button', { name: 'Task a, 23:30 – 00:30' })).toBeInTheDocument()
  })

  it('grows the open session up to now and draws the now line on today only (AGENDA-05)', () => {
    const { container } = renderWithProviders(<Grid sessions={[session('a', '2026-11-04T16:00:00.000Z', null)]} />)
    const today = column(container, '2026-11-04')
    const open = within(today).getByRole('button', { name: 'Task a, 13:00 – now' })
    expect(open.style.height).toBe(`${67 * PX_PER_MINUTE}px`)
    expect(container.querySelectorAll('[data-now-line]')).toHaveLength(1)
    expect(today.querySelector<HTMLElement>('[data-now-line]')!.style.top).toBe(`${y(14, 7)}px`)
  })

  it('hatches the time after now: the rest of today and the later days (AGENDA-23)', () => {
    const { container } = renderWithProviders(<Grid sessions={[]} />)
    expect(column(container, '2026-11-03').querySelector('[data-future]')).toBeNull()
    expect(column(container, '2026-11-04').querySelector<HTMLElement>('[data-future]')!.style.top).toBe(`${y(14, 7)}px`)
    expect(column(container, '2026-11-05').querySelector<HTMLElement>('[data-future]')!.style.top).toBe('0px')
  })

  it('draws a draft while dragging over empty time (AGENDA-14)', () => {
    const { container } = renderWithProviders(<Grid sessions={[]} />)
    fireEvent.pointerDown(column(container, '2026-11-03'), { clientY: y(17, 32), button: 0 })
    fireEvent.pointerMove(window, { clientY: y(18, 41) })
    fireEvent.pointerUp(window, { clientY: y(18, 41) })
    expect(column(container, '2026-11-03').querySelector('[data-draft]')).toHaveTextContent('17:30 – 18:45')
  })

  it('creates no draft from a drag over the hatched time (AGENDA-23)', () => {
    const onCommit = vi.fn()
    const { container } = renderWithProviders(<Grid sessions={[]} onCommit={onCommit} />)
    fireEvent.pointerDown(column(container, '2026-11-04'), { clientY: y(15), button: 0 })
    fireEvent.pointerMove(window, { clientY: y(16) })
    fireEvent.pointerUp(window, { clientY: y(16) })
    fireEvent.pointerDown(column(container, '2026-11-05'), { clientY: y(9), button: 0 })
    fireEvent.pointerUp(window, { clientY: y(10) })
    expect(container.querySelector('[data-draft]')).toBeNull()
    expect(onCommit).not.toHaveBeenCalled()
  })

  // Tuesday 14:00 to 15:00 in São Paulo.
  const ended = () => session('a', '2026-11-03T17:00:00.000Z', '2026-11-03T18:00:00.000Z')

  it('puts a handle on the top and the bottom edge of the selected ended block only (AGENDA-28)', () => {
    renderWithProviders(<Grid sessions={[ended(), session('b', '2026-11-03T19:00:00.000Z', '2026-11-03T20:00:00.000Z')]} selectedId="a" />)
    const selected = screen.getByRole('button', { name: 'Task a, 14:00 – 15:00' })
    expect([...selected.querySelectorAll<HTMLElement>('[data-handle]')].map((handle) => handle.dataset.handle)).toEqual(['top', 'bottom'])
    expect(screen.getByRole('button', { name: 'Task b, 16:00 – 17:00' }).querySelector('[data-handle]')).toBeNull()
  })

  it('moves a whole ended block keeping its length, snapped to 15 min (AGENDA-30)', () => {
    const onCommit = vi.fn()
    renderWithProviders(<Grid sessions={[ended()]} onCommit={onCommit} />)
    const block = screen.getByRole('button', { name: 'Task a, 14:00 – 15:00' })
    fireEvent.pointerDown(block, { clientY: y(14, 10), button: 0 })
    fireEvent.pointerMove(window, { clientY: y(15, 17) })
    // The block follows the pointer before it is released.
    expect(screen.getByRole('button', { name: 'Task a, 15:00 – 16:00' })).toBeInTheDocument()
    fireEvent.pointerUp(window, { clientY: y(15, 17) })
    expect(onCommit).toHaveBeenCalledWith({ mode: 'move', day: '2026-11-03', start: 15 * 60, end: 16 * 60, sessionId: 'a' })
  })

  it('pulls the bottom handle of the selected block (AGENDA-29)', () => {
    const onCommit = vi.fn()
    const { container } = renderWithProviders(<Grid sessions={[ended()]} onCommit={onCommit} selectedId="a" />)
    fireEvent.pointerDown(container.querySelector('[data-handle="bottom"]')!, { clientY: y(15), button: 0 })
    fireEvent.pointerMove(window, { clientY: y(15, 32) })
    fireEvent.pointerUp(window, { clientY: y(15, 32) })
    expect(onCommit).toHaveBeenCalledWith({ mode: 'bottom', day: '2026-11-03', start: 14 * 60, end: 15 * 60 + 30, sessionId: 'a' })
  })

  it('gives the running session no handles and does not move it (AGENDA-33)', () => {
    const onCommit = vi.fn()
    const { container } = renderWithProviders(
      <Grid sessions={[session('a', '2026-11-04T16:00:00.000Z', null)]} onCommit={onCommit} selectedId="a" />,
    )
    const open = screen.getByRole('button', { name: 'Task a, 13:00 – now' })
    expect(open.querySelector('[data-handle]')).toBeNull()
    fireEvent.pointerDown(open, { clientY: y(13, 10), button: 0 })
    fireEvent.pointerMove(window, { clientY: y(12, 10) })
    fireEvent.pointerUp(window, { clientY: y(12, 10) })
    expect(onCommit).not.toHaveBeenCalled()
    expect(container.querySelector('[data-draft]')).toBeNull()
    expect(screen.getByRole('button', { name: 'Task a, 13:00 – now' })).toBeInTheDocument()
  })
})
