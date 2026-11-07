import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { isHiddenSession } from '@/lib/agenda/hide'
import { dayLimit, weekDays } from '@/lib/agenda/layout'
import { useGridDrag, type Draft } from '@/lib/agenda/use-grid-drag'
import { renderWithProviders } from '@/test/utils'
import type { AgendaSession, ProjectedOccurrence, ScheduledTask } from '@/types'
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
  hidden,
  joinGap,
  apartId,
  onSelectGroup,
  selectedGroup,
}: {
  sessions: AgendaSession[]
  onCommit?: (draft: Draft) => void
  selectedId?: string | null
  hidden?: (session: AgendaSession) => boolean
  joinGap?: number | null
  apartId?: string | null
  onSelectGroup?: (members: AgendaSession[]) => void
  selectedGroup?: string[] | null
}) {
  const drag = useGridDrag({ pxPerMinute: PX_PER_MINUTE, limit: (day) => dayLimit(day, NOW, SP), onCommit })
  return (
    <WeekGrid
      days={WEEK}
      sessions={sessions}
      timezone={SP}
      now={NOW}
      drag={drag}
      selectedId={selectedId}
      hidden={hidden}
      joinGap={joinGap}
      apartId={apartId}
      onSelectGroup={onSelectGroup}
      selectedGroup={selectedGroup}
    />
  )
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

  it('ADJ-17 heads the week days with their weekday and day number, never the whole date', () => {
    const { container } = renderWithProviders(<Grid sessions={[]} />)
    expect(container.querySelector('[data-long-date]')).toBeNull()
    expect(header(container, '2026-11-04').textContent).toBe('Wed4')
  })

  it('leaves the days without sessions without a total (AGENDA-11)', () => {
    const { container } = renderWithProviders(<Grid sessions={[]} />)
    for (const day of WEEK) expect(header(container, day).textContent).toMatch(/^[A-Za-z]{3}\d{1,2}$/)
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })

  it('DAYS-01 draws the corner control in the header, before the first day', () => {
    const { container } = renderWithProviders(
      <WeekGrid days={WEEK} sessions={[]} timezone={SP} now={NOW} corner={<button type="button">View options</button>} />,
    )
    const headerRow = container.querySelector('[data-agenda-header]')!
    const corner = within(headerRow as HTMLElement).getByRole('button', { name: 'View options' })
    expect(corner.compareDocumentPosition(header(container, WEEK[0]!)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('DAYS-09 draws five headers and five columns for five days', () => {
    const { container } = renderWithProviders(<WeekGrid days={WEEK.slice(0, 5)} sessions={[]} timezone={SP} now={NOW} />)
    expect(container.querySelectorAll('[data-day-header]')).toHaveLength(5)
    expect(container.querySelectorAll('[data-agenda-column]')).toHaveLength(5)
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

  describe('hidden sessions (#22)', () => {
    // Monday 10:00-11:00 and 10:20-10:22 in São Paulo; the 2-minute one is under a 5-minute minimum.
    const long = session('long', '2026-11-02T13:00:00.000Z', '2026-11-02T14:00:00.000Z')
    const short = session('short', '2026-11-02T13:20:00.000Z', '2026-11-02T13:22:00.000Z')
    const hidden = (item: AgendaSession) => isHiddenSession(item, 5)

    it('HIDE-11 HIDE-12 draws no block for the hidden session and keeps the visible one of the same day', () => {
      const { container } = renderWithProviders(<Grid sessions={[long, short]} hidden={hidden} />)
      expect(container.querySelector('[data-session-id="short"]')).toBeNull()
      expect(container.querySelector('[data-session-id="long"]')).not.toBeNull()
    })

    it('HIDE-14 counts the hidden session in the day total of the header', () => {
      const { container } = renderWithProviders(<Grid sessions={[long, short]} hidden={hidden} />)
      expect(header(container, '2026-11-02')).toHaveTextContent('1hr 2min')
    })

    it('HIDE-15 gives the whole column width to a block that overlaps only a hidden one', () => {
      const { container } = renderWithProviders(<Grid sessions={[long, short]} hidden={hidden} />)
      expect(container.querySelector<HTMLElement>('[data-session-id="long"]')!.style.width).toBe('100%')
    })

    it('HIDE-16 draws every session without a hidden rule, side by side', () => {
      const { container } = renderWithProviders(<Grid sessions={[long, short]} />)
      expect(container.querySelector<HTMLElement>('[data-session-id="short"]')).not.toBeNull()
      expect(container.querySelector<HTMLElement>('[data-session-id="long"]')!.style.width).toBe('50%')
    })

    it('keeps the block of a session being dragged shorter than the minimum until it is saved', () => {
      const { container } = renderWithProviders(<Grid sessions={[long]} hidden={hidden} selectedId="long" />)
      const handle = container.querySelector<HTMLElement>('[data-handle="bottom"]')!
      fireEvent.pointerDown(handle, { clientY: y(11), button: 0 })
      fireEvent.pointerMove(window, { clientY: y(10, 15) })
      expect(container.querySelector<HTMLElement>('[data-session-id="long"]')!.style.height).toBe(`${15 * PX_PER_MINUTE}px`)
    })
  })

  describe('joined sessions (#23)', () => {
    // Monday in São Paulo: Produto 10:20-11:01 and 11:05-11:16, and Suporte 10:30-11:00.
    const produto = { list_name: 'Produto' }
    const suporte = { list_id: 'l2', list_name: 'Suporte' }
    const a = session('a', '2026-11-02T13:20:00.000Z', '2026-11-02T14:01:00.000Z', produto)
    const b = session('b', '2026-11-02T14:05:00.000Z', '2026-11-02T14:16:00.000Z', produto)
    const c = session('c', '2026-11-02T13:30:00.000Z', '2026-11-02T14:00:00.000Z', suporte)

    it('MERGE-11 MERGE-21 draws the two Produto sessions as one block, side by side with Suporte at the same time', () => {
      const { container } = renderWithProviders(<Grid sessions={[a, b, c]} joinGap={5} />)
      const joined = screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' })
      expect(joined).toHaveAttribute('data-joined')
      expect(container.querySelector('[data-session-id="b"]')).toBeNull()
      expect(joined.style.top).toBe(`${y(10, 20)}px`)
      expect(joined.style.height).toBe(`${56 * PX_PER_MINUTE}px`)
      const other = screen.getByRole('button', { name: 'Task c, 10:30 – 11:00' })
      expect([joined.style.left, joined.style.width]).toEqual(['0%', '50%'])
      expect([other.style.left, other.style.width]).toEqual(['50%', '50%'])
    })

    it('MERGE-21 gives a joined block alone in its column the whole width', () => {
      renderWithProviders(<Grid sessions={[a, b]} joinGap={5} />)
      expect(screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' }).style.width).toBe('100%')
    })

    it('MERGE-20 counts in the day total each session of the block, not the gap between them', () => {
      const { container } = renderWithProviders(<Grid sessions={[a, b]} joinGap={5} />)
      expect(header(container, '2026-11-02')).toHaveTextContent('52min')
    })

    it('MERGE-19 leaves a hidden session out, so it neither bridges a gap nor shows in a block', () => {
      // 10:00-10:30, a hidden 2-minute one at 10:31-10:33, and 10:37-11:00: only the hidden one is near both.
      const first = session('first', '2026-11-02T13:00:00.000Z', '2026-11-02T13:30:00.000Z', produto)
      const short = session('short', '2026-11-02T13:31:00.000Z', '2026-11-02T13:33:00.000Z', produto)
      const last = session('last', '2026-11-02T13:37:00.000Z', '2026-11-02T14:00:00.000Z', produto)
      const { container } = renderWithProviders(
        <Grid sessions={[first, short, last]} joinGap={5} hidden={(item) => isHiddenSession(item, 5)} />,
      )
      expect(screen.getByRole('button', { name: 'Task first, 10:00 – 10:30' })).not.toHaveAttribute('data-joined')
      expect(screen.getByRole('button', { name: 'Task last, 10:37 – 11:00' })).not.toHaveAttribute('data-joined')
      expect(container.querySelector('[data-joined]')).toBeNull()
      expect(container.querySelector('[data-session-id="short"]')).toBeNull()
    })

    it('MERGE-30 neither moves nor resizes a joined block when it is dragged, and gives it no handles', () => {
      const onCommit = vi.fn()
      const { container } = renderWithProviders(
        <Grid sessions={[a, b]} joinGap={5} onCommit={onCommit} selectedGroup={['a', 'b']} />,
      )
      const joined = screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' })
      expect(container.querySelector('[data-handle]')).toBeNull()
      fireEvent.pointerDown(joined, { clientY: y(10, 30), button: 0 })
      fireEvent.pointerMove(window, { clientY: y(12, 30) })
      fireEvent.pointerUp(window, { clientY: y(12, 30) })
      expect(onCommit).not.toHaveBeenCalled()
      expect(container.querySelector('[data-draft]')).toBeNull()
      expect(screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' })).toBeInTheDocument()
    })

    it('MERGE-27 calls onSelectGroup with the sessions in start order on a click, and selects the block while one is in the group', () => {
      const onSelectGroup = vi.fn()
      const { rerender } = renderWithProviders(<Grid sessions={[b, a]} joinGap={5} onSelectGroup={onSelectGroup} />)
      const joined = screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' })
      expect(joined).toHaveAttribute('aria-pressed', 'false')
      fireEvent.click(joined)
      expect(onSelectGroup).toHaveBeenCalledWith([a, b])

      rerender(<Grid sessions={[b, a]} joinGap={5} onSelectGroup={onSelectGroup} selectedGroup={['a', 'b']} />)
      expect(screen.getByRole('button', { name: 'Produto, 2 sessions, 10:20 – 11:16' })).toHaveAttribute('aria-pressed', 'true')
    })

    it('MERGE-29 draws the apart session alone, with its handles when selected, and the rest of the group without it', () => {
      const d = session('d', '2026-11-02T14:18:00.000Z', '2026-11-02T14:30:00.000Z', produto)
      renderWithProviders(<Grid sessions={[a, b, d]} joinGap={5} apartId="a" selectedId="a" selectedGroup={['a', 'b', 'd']} />)
      const apart = screen.getByRole('button', { name: 'Task a, 10:20 – 11:01' })
      expect(apart).not.toHaveAttribute('data-joined')
      expect([...apart.querySelectorAll<HTMLElement>('[data-handle]')].map((handle) => handle.dataset.handle)).toEqual(['top', 'bottom'])
      expect(screen.getByRole('button', { name: 'Produto, 2 sessions, 11:05 – 11:30' })).toHaveAttribute('data-joined')
    })

    it('AGENDA-30 keeps a block being moved on its own while it passes near a session of its list', () => {
      // Produto 10:00-10:30 and 10:45-11:05: 15 min apart, then the second moved up by 15 min, right after the first.
      const first = session('first', '2026-11-02T13:00:00.000Z', '2026-11-02T13:30:00.000Z', produto)
      const moved = session('moved', '2026-11-02T13:45:00.000Z', '2026-11-02T14:05:00.000Z', produto)
      renderWithProviders(<Grid sessions={[first, moved]} joinGap={5} />)
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Task moved, 10:45 – 11:05' }), { clientY: y(10, 50), button: 0 })
      fireEvent.pointerMove(window, { clientY: y(10, 35) })
      expect(screen.getByRole('button', { name: 'Task moved, 10:30 – 10:50' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Task first, 10:00 – 10:30' })).toBeInTheDocument()
    })
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

  it('D10 draws the time after now like the time before: no hatching on the rest of today or the later days', () => {
    const { container } = renderWithProviders(<Grid sessions={[]} />)
    expect(column(container, '2026-11-03').querySelector('[data-future]')).toBeNull()
    expect(column(container, '2026-11-04').querySelector('[data-future]')).toBeNull()
    expect(column(container, '2026-11-05').querySelector('[data-future]')).toBeNull()
    expect(column(container, '2026-11-04').querySelector('[data-now-line]')).not.toBeNull()
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
  describe('moving the new session and the hand pointer (#29)', () => {
    const clickAt = (element: HTMLElement, minuteY: number) => {
      fireEvent.pointerDown(element, { clientY: minuteY, button: 0 })
      fireEvent.pointerUp(window, { clientY: minuteY })
    }

    it('ADJ-12 ADJ-13 moves the draft by its middle, without starting a second one', () => {
      const onCommit = vi.fn()
      const { container } = renderWithProviders(<Grid sessions={[]} onCommit={onCommit} />)
      clickAt(column(container, '2026-11-03'), y(10, 5))
      const draft = container.querySelector<HTMLElement>('[data-draft]')!
      expect(draft).toHaveTextContent('10:00 – 11:00')

      fireEvent.pointerDown(draft, { clientY: y(10, 30), button: 0 })
      fireEvent.pointerMove(window, { clientY: y(11, 30) })
      fireEvent.pointerUp(window, { clientY: y(11, 30) })
      expect(container.querySelectorAll('[data-draft]')).toHaveLength(1)
      expect(container.querySelector('[data-draft]')).toHaveTextContent('11:00 – 12:00')
      expect(onCommit).toHaveBeenLastCalledWith({ mode: 'move', day: '2026-11-03', start: 11 * 60, end: 12 * 60, sessionId: null })
    })

    it('ADJ-14 gives the open hand to the draft and a block that moves, not to the running nor a joined block, and resize to the edges', () => {
      const { container } = renderWithProviders(
        <Grid
          sessions={[
            ended(),
            session('r', '2026-11-04T16:00:00.000Z', null),
            // Monday 09:00 – 09:30 and 09:35 – 10:00, joined 5 minutes apart.
            session('j1', '2026-11-02T12:00:00.000Z', '2026-11-02T12:30:00.000Z'),
            session('j2', '2026-11-02T12:35:00.000Z', '2026-11-02T13:00:00.000Z'),
          ]}
          selectedId="a"
          joinGap={10}
        />,
      )
      const block = screen.getByRole('button', { name: 'Task a, 14:00 – 15:00' })
      expect(block).toHaveClass('cursor-grab')
      expect(screen.getByRole('button', { name: 'Task r, 13:00 – now' })).not.toHaveClass('cursor-grab')
      expect(container.querySelector('[data-joined]')).not.toHaveClass('cursor-grab')
      for (const handle of block.querySelectorAll('[data-handle]')) expect(handle).toHaveClass('cursor-ns-resize')

      clickAt(column(container, '2026-11-03'), y(9, 5))
      const draft = container.querySelector<HTMLElement>('[data-draft]')!
      expect(draft).toHaveClass('cursor-grab')
      for (const handle of draft.querySelectorAll('[data-handle]')) expect(handle).toHaveClass('cursor-ns-resize')
      // The draft carries its times and nothing else.
      expect(draft.textContent).toBe('09:00 – 10:00')
    })

    it('ADJ-14 keeps the closed hand off while an edge is pulled', () => {
      const { container } = renderWithProviders(<Grid sessions={[ended()]} selectedId="a" />)
      const root = container.firstElementChild as HTMLElement
      fireEvent.pointerDown(container.querySelector('[data-handle="bottom"]')!, { clientY: y(15), button: 0 })
      fireEvent.pointerMove(window, { clientY: y(15, 30) })
      expect(root).not.toHaveAttribute('data-grabbing')
      expect(root).not.toHaveClass('cursor-grabbing')
      fireEvent.pointerUp(window, { clientY: y(15, 30) })
    })

    it('ADJ-14 shows the closed hand on the grid while a block moves, and not after', () => {
      const { container } = renderWithProviders(<Grid sessions={[ended()]} />)
      const root = container.firstElementChild as HTMLElement
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Task a, 14:00 – 15:00' }), { clientY: y(14, 10), button: 0 })
      fireEvent.pointerMove(window, { clientY: y(15, 10) })
      expect(root).toHaveAttribute('data-grabbing')
      expect(root).toHaveClass('cursor-grabbing')
      fireEvent.pointerUp(window, { clientY: y(15, 10) })
      expect(root).not.toHaveAttribute('data-grabbing')
    })
  })
})

describe('WeekGrid: the scheduled tasks (US-5, US-11)', () => {
  const scheduled = (id: string, day: string, time: string, estimate: number | null = 90): ScheduledTask => ({
    id,
    title: `Scheduled ${id}`,
    list: { id: 'l1', name: 'Work', color: 3 },
    column: 'this_week',
    position: 0,
    estimate_minutes: estimate,
    scheduled_on: day,
    scheduled_time: time,
    series: null,
  })
  const projection: ProjectedOccurrence = {
    series_id: 'series-1',
    task_id: 'open-1',
    title: 'Weekly review',
    list: { id: 'l1', name: 'Work', color: 3 },
    on: '2026-11-06',
    time: '09:00',
    estimate_minutes: 30,
    rule: { freq: 'weekly', interval: 1, weekdays: [5], month_day: null, until: null, count: null },
  }
  const grid = (props: Partial<Parameters<typeof WeekGrid>[0]>) =>
    renderWithProviders(<WeekGrid days={WEEK} sessions={[]} timezone={SP} now={NOW} {...props} />)

  it('draws a task with a time as a block in its day at its time, for its estimate, in the past and in the future', () => {
    const { container } = grid({ timed: [scheduled('a', '2026-11-05', '10:00'), scheduled('b', '2026-11-02', '08:00', null)] })
    const future = within(column(container, '2026-11-05')).getByRole('button', { name: 'Scheduled a, Scheduled · 10:00 – 11:30' })
    expect([future.style.top, future.style.height]).toEqual([`${y(10)}px`, `${90 * PX_PER_MINUTE}px`])
    const past = within(column(container, '2026-11-02')).getByRole('button', { name: 'Scheduled b, Scheduled · 08:00 – 09:00 (1h)' })
    expect(past.style.height).toBe(`${60 * PX_PER_MINUTE}px`)
  })

  it('puts a scheduled block and a session that overlap side by side', () => {
    const { container } = grid({
      sessions: [session('s', '2026-11-03T13:00:00.000Z', '2026-11-03T14:00:00.000Z')],
      timed: [scheduled('a', '2026-11-03', '10:30')],
    })
    const day = within(column(container, '2026-11-03'))
    const block = day.getByRole('button', { name: /^Scheduled a/ })
    const work = day.getByRole('button', { name: 'Task s, 10:00 – 11:00' })
    expect([work.style.left, work.style.width, block.style.left, block.style.width]).toEqual(['0%', '50%', '50%', '50%'])
  })

  it('draws the projections of a series fainter, on their day', () => {
    const { container } = grid({ projected: [projection] })
    const block = within(column(container, '2026-11-06')).getByRole('button', { name: /^Weekly review, Next occurrence/ })
    expect(block).toHaveAttribute('data-projected', 'true')
    expect(block).toHaveClass('opacity-50')
  })

  it('opens the task of a block on a click, and the open occurrence of a projection', async () => {
    const onOpenTask = vi.fn()
    const { user } = grid({ timed: [scheduled('a', '2026-11-05', '10:00')], projected: [projection], onOpenTask })
    await user.click(screen.getByRole('button', { name: /^Scheduled a/ }))
    await user.click(screen.getByRole('button', { name: /^Weekly review/ }))
    expect(onOpenTask.mock.calls).toEqual([['a'], ['open-1']])
  })

  it('says the drag in the tooltip only where the grid has the gestures: not to a viewer', async () => {
    const { user } = grid({ timed: [scheduled('a', '2026-11-05', '10:00')] })
    await user.hover(screen.getByRole('button', { name: /^Scheduled a/ }))
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/Work · This weekClick to open$/)
  })

  it('US-14 puts the Sem hora row between the day headers and the timeline, with the untimed tasks of each day', () => {
    const { container } = grid({ untimed: [{ ...scheduled('u', '2026-11-05', '10:00'), scheduled_time: null }] })
    const row = container.querySelector<HTMLElement>('[data-untimed-row]')!
    expect(container.querySelector('[data-agenda-header]')!.nextElementSibling).toBe(row)
    expect(row.nextElementSibling).toBe(container.querySelector('[data-agenda-scroll]'))
    expect(within(row.querySelector<HTMLElement>('[data-untimed-day="2026-11-05"]')!).getByRole('button', { name: /^Scheduled u/ })).toBeInTheDocument()
    // Without a time it is not a block on the grid.
    expect(within(column(container, '2026-11-05')).queryByRole('button', { name: /^Scheduled u/ })).toBeNull()
  })

  it('starts no draft from a press on a block', () => {
    function WithDrag() {
      const drag = useGridDrag({ pxPerMinute: PX_PER_MINUTE, limit: (day) => dayLimit(day, NOW, SP), onCommit: vi.fn() })
      return <WeekGrid days={WEEK} sessions={[]} timezone={SP} now={NOW} drag={drag} timed={[scheduled('a', '2026-11-03', '10:00')]} />
    }
    const { container } = renderWithProviders(<WithDrag />)
    const block = screen.getByRole('button', { name: /^Scheduled a/ })
    fireEvent.pointerDown(block, { clientY: y(10, 15), button: 0 })
    fireEvent.pointerMove(window, { clientY: y(11) })
    fireEvent.pointerUp(window, { clientY: y(11) })
    expect(container.querySelector('[data-draft]')).toBeNull()
  })

  describe('dragging a scheduled block (US-6)', () => {
    function Draggable({ onDrop = vi.fn(), timed, projected }: { onDrop?: () => void; timed: ScheduledTask[]; projected?: ProjectedOccurrence[] }) {
      const drag = useGridDrag({ pxPerMinute: PX_PER_MINUTE, limit: (day) => dayLimit(day, NOW, SP), onCommit: vi.fn(), onScheduledDrop: onDrop })
      return <WeekGrid days={WEEK} sessions={[]} timezone={SP} now={NOW} drag={drag} timed={timed} projected={projected} />
    }

    it('lets the open occurrence be dragged, with the open hand on hover, but never a projection', () => {
      renderWithProviders(<Draggable timed={[scheduled('a', '2026-11-05', '10:00')]} projected={[projection]} />)
      const block = screen.getByRole('button', { name: /^Scheduled a/ })
      expect(block).toHaveAttribute('data-draggable', 'true')
      expect(block).toHaveClass('cursor-grab', 'hover:border-solid')
      expect(screen.getByRole('button', { name: /^Weekly review/ })).not.toHaveAttribute('data-draggable')
    })

    it('does not let a viewer drag a block', () => {
      grid({ timed: [scheduled('a', '2026-11-05', '10:00')] })
      expect(screen.getByRole('button', { name: /^Scheduled a/ })).not.toHaveAttribute('data-draggable')
    })

    it('fades the block, draws the draft with its day and times and a copy that follows the pointer, and saves on release', () => {
      const onDrop = vi.fn()
      const { container } = renderWithProviders(<Draggable onDrop={onDrop} timed={[scheduled('a', '2026-11-05', '10:00')]} />)
      const block = screen.getByRole('button', { name: /^Scheduled a/ })
      fireEvent.pointerDown(block, { clientX: 10, clientY: y(10, 10), button: 0 })
      fireEvent.pointerMove(window, { clientX: 40, clientY: y(16, 10) })
      expect(block).toHaveAttribute('data-dragging', 'true')
      expect(block).toHaveClass('opacity-30')
      const draft = column(container, '2026-11-05').querySelector<HTMLElement>('[data-scheduled-draft]')!
      expect(draft).toHaveTextContent('Thu, Nov 5 · 16:00 – 17:30')
      expect([draft.style.top, draft.style.height]).toEqual([`${y(16)}px`, `${90 * PX_PER_MINUTE}px`])
      const ghost = container.querySelector<HTMLElement>('[data-drag-ghost]')!
      expect(ghost).toHaveTextContent('Scheduled a')
      expect([ghost.style.left, ghost.style.top]).toEqual(['48px', `${y(16, 10) + 8}px`])

      fireEvent.pointerUp(window, { clientX: 40, clientY: y(16, 10) })
      expect(onDrop).toHaveBeenCalledWith({ taskId: 'a', day: '2026-11-05', time: '16:00', from: { day: '2026-11-05', time: '10:00' } })
      expect(container.querySelector('[data-drag-ghost]')).toBeNull()
      expect(container.querySelector('[data-scheduled-draft]')).toBeNull()
    })
  })
})
