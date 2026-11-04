import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { lists, sessions } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { AgendaSession, ListCard } from '@/types'
import AgendaPage from './agenda'

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), board: vi.fn() },
  sessions: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), tasks: vi.fn() },
}))

vi.mock('sonner', async (importOriginal) => ({
  ...(await importOriginal<typeof import('sonner')>()),
  toast: { success: vi.fn(), error: vi.fn() },
}))

const workspace = vi.hoisted(() => ({ canWrite: true }))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ current: { id: 'ws', name: 'Synthetic workspace', timezone: null }, canWrite: workspace.canWrite }),
}))

const SP = 'America/Sao_Paulo'
const WORK = '22222222-2222-4222-8222-222222222222'

const card: ListCard = {
  id: WORK,
  workspace_id: 'ws',
  name: 'Work',
  color: 3,
  position: 1,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-01T00:00:00.000Z',
  pending_count: 0,
  preview: [],
}

const monday: AgendaSession = {
  id: 's1',
  kind: 'task',
  origin: 'focus',
  task_id: 't1',
  task_title: 'Write the report',
  list_id: WORK,
  list_name: 'Work',
  list_color: 3,
  started_at: '2026-11-02T13:00:00.000Z',
  ended_at: '2026-11-02T14:00:00.000Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  workspace.canWrite = true
  // Wednesday 4 November 2026, 14:07 in São Paulo.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-04T17:07:00.000Z'))
  vi.mocked(lists.list).mockResolvedValue({ timezone: SP, lists: [card] })
  vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday] })
  vi.mocked(sessions.tasks).mockResolvedValue({
    tasks: [{ id: 't1', title: 'Write the report', list_id: WORK, list_name: 'Work', list_color: 3, column: 'today' }],
  })
})

afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

const weekHeading = () => screen.findByRole('heading', { level: 2 })

describe('AgendaPage', () => {
  it('opens on the current week and moves to the next one (AGENDA-08)', async () => {
    const { user } = renderWithProviders(<AgendaPage />)
    expect(await weekHeading()).toHaveTextContent('November 2 – 8, 2026')
    expect(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
    expect(sessions.list).toHaveBeenCalledWith({ from: '2026-11-02', to: '2026-11-08' })

    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(await weekHeading()).toHaveTextContent('November 9 – 15, 2026')
    await waitFor(() => expect(sessions.list).toHaveBeenCalledWith({ from: '2026-11-09', to: '2026-11-15' }))
  })

  it('reads the week in Portuguese, across months too (AGENDA-08)', async () => {
    await i18n.changeLanguage('pt-BR')
    const { user } = renderWithProviders(<AgendaPage />)
    expect(await weekHeading()).toHaveTextContent('2 – 8 de novembro de 2026')
    await user.click(screen.getByRole('button', { name: 'Próxima semana' }))
    expect(await weekHeading()).toHaveTextContent('9 – 15 de novembro de 2026')
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }))
    await user.click(screen.getByRole('button', { name: 'Semana anterior' }))
    expect(await weekHeading()).toHaveTextContent('26 de outubro – 1 de novembro de 2026')
  })

  it('reads only the sessions of the list chosen in the filter (AGENDA-09)', async () => {
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('combobox', { name: 'List' }))
    await user.click(await screen.findByRole('option', { name: 'Work' }))
    await waitFor(() => expect(sessions.list).toHaveBeenCalledWith({ from: '2026-11-02', to: '2026-11-08', list_id: WORK }))
  })

  it('warns about an overlap with a session of another list while the filter is on (AGENDA-19)', async () => {
    // Wednesday 13:50 to 14:03 in São Paulo, on the list Home.
    const sink: AgendaSession = {
      ...monday,
      id: 's9',
      task_id: 't9',
      task_title: 'Fix the sink',
      list_id: 'home',
      list_name: 'Home',
      list_color: 5,
      started_at: '2026-11-04T16:50:00.000Z',
      ended_at: '2026-11-04T17:03:00.000Z',
    }
    vi.mocked(sessions.list).mockImplementation(async (query) => ({ sessions: query.list_id ? [monday] : [monday, sink] }))
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('combobox', { name: 'List' }))
    await user.click(await screen.findByRole('option', { name: 'Work' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Fix the sink, 13:50 – 14:03' })).toBeNull())

    await user.click(screen.getByRole('button', { name: 'New session' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Overlaps Fix the sink (13:50 – 14:03). The time in common counts in both.')
  })

  it('shows the load error in place of the grid and tries again (AGENDA-12)', async () => {
    vi.mocked(sessions.list).mockRejectedValueOnce(new Error('offline'))
    const { user, container } = renderWithProviders(<AgendaPage />)
    expect(await screen.findByText('Could not load the agenda.')).toBeInTheDocument()
    expect(container.querySelector('[data-agenda-column]')).toBeNull()

    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
    expect(sessions.list).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('Could not load the agenda.')).toBeNull()
  })

  it('opens New session on today, from the hour before to now rounded down (AGENDA-15)', async () => {
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('button', { name: 'New session' }))
    expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-04')
    expect(screen.getByLabelText('Start')).toHaveValue('14:00')
    expect(screen.getByLabelText('End')).toHaveValue('14:05')
  })

  it('closes the open panel without recording when the week changes (AGENDA-47)', async () => {
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('button', { name: 'New session' }))
    expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Next week' }))
    expect(screen.queryByRole('heading', { name: 'New session' })).toBeNull()
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('hides New session and takes no drag from a viewer (AGENDA-44)', async () => {
    workspace.canWrite = false
    const { container } = renderWithProviders(<AgendaPage />)
    expect(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'New session' })).toBeNull()

    const tuesday = container.querySelector<HTMLElement>('[data-agenda-column="2026-11-03"]')!
    fireEvent.pointerDown(tuesday, { clientY: 600 * PX_PER_MINUTE, button: 0 })
    fireEvent.pointerUp(window, { clientY: 660 * PX_PER_MINUTE })
    expect(container.querySelector('[data-draft]')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'New session' })).toBeNull()
  })
  it('opens the details of a block and deletes it once confirmed, taking the block off the grid (AGENDA-27, AGENDA-32)', async () => {
    // Once deleted, the server no longer has the session.
    vi.mocked(sessions.remove).mockImplementation(async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [] })
    })
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' }))
    expect(screen.getByRole('heading', { name: 'Write the report' })).toBeInTheDocument()
    expect(screen.getByText('recorded by the focus')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
    expect(sessions.remove).toHaveBeenCalledWith('s1')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeNull())
    expect(screen.queryByRole('heading', { name: 'Write the report' })).toBeNull()
  })

  it('saves the edited times of a session (AGENDA-31)', async () => {
    const saved = { ...monday, ended_at: '2026-11-02T14:30:00.000Z' }
    vi.mocked(sessions.update).mockImplementation(async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [saved] })
      return saved
    })
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(await screen.findByRole('heading', { name: 'Edit session' })).toBeInTheDocument()
    expect(screen.getByLabelText('Start')).toHaveValue('10:00')
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '11:30' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(sessions.update).toHaveBeenCalledWith('s1', {
      started_at: '2026-11-02T13:00:00.000Z',
      ended_at: '2026-11-02T14:30:00.000Z',
      task_id: 't1',
    })
    expect(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:30' })).toBeInTheDocument()
  })

  it('shows a refused edit once, in the panel, without a toast (AGENDA-31)', async () => {
    vi.mocked(sessions.update).mockRejectedValue({ response: { status: 404, data: { detail: 'Task not found' } } })
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' }))
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    fireEvent.change(await screen.findByLabelText('End'), { target: { value: '11:30' } })
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Task not found')
    expect(toast.error).not.toHaveBeenCalled()
  })

  it('shows the details to a viewer without Edit nor Delete (AGENDA-44)', async () => {
    workspace.canWrite = false
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' }))
    expect(screen.getByRole('heading', { name: 'Write the report' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
  describe('a new session from the grid (AGENDA-14, AGENDA-17, AGENDA-18, AGENDA-20)', () => {
    const y = (hours: number, minutes = 0) => (hours * 60 + minutes) * PX_PER_MINUTE
    const tuesdayColumn = (container: HTMLElement) => container.querySelector<HTMLElement>('[data-agenda-column="2026-11-03"]')!

    /** Drags on Tuesday from 17:32 to 18:41, once the week is in. */
    async function dragOnTuesday(container: HTMLElement) {
      await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })
      fireEvent.pointerDown(tuesdayColumn(container), { clientY: y(17, 32), button: 0 })
      fireEvent.pointerMove(window, { clientY: y(18, 41) })
      fireEvent.pointerUp(window, { clientY: y(18, 41) })
    }

    function pull(handle: HTMLElement, from: number, to: number) {
      fireEvent.pointerDown(handle, { clientY: from, button: 0 })
      fireEvent.pointerMove(window, { clientY: to })
      fireEvent.pointerUp(window, { clientY: to })
    }

    it('opens New session with the day and both times of the drag (AGENDA-14)', async () => {
      const { container } = renderWithProviders(<AgendaPage />)
      await dragOnTuesday(container)
      expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
      expect(screen.getByLabelText('Date')).toHaveValue('2026-11-03')
      expect(screen.getByLabelText('Start')).toHaveValue('17:30')
      expect(screen.getByLabelText('End')).toHaveValue('18:45')
      expect(tuesdayColumn(container).querySelector('[data-draft]')).toHaveTextContent('17:30 – 18:45')
    })

    it('moves the edge of the draft when a time changes in the panel (AGENDA-17)', async () => {
      const { container } = renderWithProviders(<AgendaPage />)
      await dragOnTuesday(container)
      fireEvent.change(await screen.findByLabelText('End'), { target: { value: '19:00' } })
      expect(tuesdayColumn(container).querySelector('[data-draft]')).toHaveTextContent('17:30 – 19:00')
      fireEvent.change(screen.getByLabelText('Start'), { target: { value: '17:00' } })
      const draft = tuesdayColumn(container).querySelector<HTMLElement>('[data-draft]')!
      expect(draft).toHaveTextContent('17:00 – 19:00')
      expect(draft.style.top).toBe(`${y(17)}px`)
      expect(draft.style.height).toBe(`${y(2)}px`)
      expect(screen.getByText('2hr')).toBeInTheDocument()
    })

    it('changes the panel fields in steps of 15 min when a draft handle is pulled (AGENDA-18)', async () => {
      const { container } = renderWithProviders(<AgendaPage />)
      await dragOnTuesday(container)
      await screen.findByRole('heading', { name: 'New session' })
      pull(container.querySelector<HTMLElement>('[data-draft] [data-handle="bottom"]')!, y(18, 45), y(19, 22))
      expect(screen.getByLabelText('End')).toHaveValue('19:15')
      pull(container.querySelector<HTMLElement>('[data-draft] [data-handle="top"]')!, y(17, 30), y(17, 8))
      expect(screen.getByLabelText('Start')).toHaveValue('17:15')
      expect(screen.getByLabelText('End')).toHaveValue('19:15')
      expect(tuesdayColumn(container).querySelector('[data-draft]')).toHaveTextContent('17:15 – 19:15')
    })

    it('shows the saved session in the list color, without the draft handles (AGENDA-20)', async () => {
      // 17:30 to 18:45 on Tuesday in São Paulo.
      const saved: AgendaSession = { ...monday, id: 's3', origin: 'manual', started_at: '2026-11-03T20:30:00.000Z', ended_at: '2026-11-03T21:45:00.000Z' }
      vi.mocked(sessions.create).mockImplementation(async () => {
        vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, saved] })
        return saved
      })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await dragOnTuesday(container)
      await user.click(await screen.findByRole('combobox', { name: 'Task' }))
      await user.click(await screen.findByRole('option', { name: 'Write the report' }))
      await user.click(screen.getByRole('button', { name: 'Save' }))

      expect(sessions.create).toHaveBeenCalledWith({
        kind: 'task',
        task_id: 't1',
        started_at: '2026-11-03T20:30:00.000Z',
        ended_at: '2026-11-03T21:45:00.000Z',
      })
      const block = await screen.findByRole('button', { name: 'Write the report, 17:30 – 18:45' })
      expect(block.style.borderLeftColor).toBe('var(--chart-3)')
      expect(container.querySelector('[data-draft]')).toBeNull()
      expect(block.querySelector('[data-handle]')).toBeNull()
      expect(screen.queryByRole('heading', { name: 'New session' })).toBeNull()
    })
  })

  describe('adjusting a block (AGENDA-29, AGENDA-35)', () => {
    // Tuesday 14:00 to 15:00 in São Paulo.
    const tuesday: AgendaSession = { ...monday, id: 's2', started_at: '2026-11-03T17:00:00.000Z', ended_at: '2026-11-03T18:00:00.000Z' }
    const block = (range: string) => screen.findByRole('button', { name: `Write the report, ${range}` })

    async function pullEndTo1530(user: ReturnType<typeof renderWithProviders>['user'], container: HTMLElement) {
      await user.click(await block('14:00 – 15:00'))
      fireEvent.pointerDown(container.querySelector('[data-handle="bottom"]')!, { clientY: 15 * 60 * PX_PER_MINUTE, button: 0 })
      fireEvent.pointerMove(window, { clientY: (15 * 60 + 30) * PX_PER_MINUTE })
      fireEvent.pointerUp(window, { clientY: (15 * 60 + 30) * PX_PER_MINUTE })
    }

    beforeEach(() => vi.mocked(sessions.list).mockResolvedValue({ sessions: [tuesday] }))

    it('saves the end pulled from 15:00 to 15:30', async () => {
      const saved = { ...tuesday, ended_at: '2026-11-03T18:30:00.000Z' }
      vi.mocked(sessions.update).mockImplementation(async () => {
        vi.mocked(sessions.list).mockResolvedValue({ sessions: [saved] })
        return saved
      })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await pullEndTo1530(user, container)
      await waitFor(() => expect(sessions.update).toHaveBeenCalledWith('s2', { ended_at: '2026-11-03T18:30:00.000Z' }))
      expect(await block('14:00 – 15:30')).toBeInTheDocument()
    })

    describe('across days', () => {
      // Each column is 100 px wide, Monday at x = 0, and starts at the top of the screen.
      beforeEach(() => {
        const real = HTMLElement.prototype.getBoundingClientRect
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
          const day = this.dataset.agendaColumn
          if (!day) return real.call(this)
          const left = (Number(day.slice(8)) - 2) * 100
          return DOMRect.fromRect({ x: left, y: 0, width: 100, height: 24 * 60 * PX_PER_MINUTE })
        })
      })
      afterEach(() => vi.restoreAllMocks())

      it('saves a block moved from Tuesday to Monday with the same hour (AGENDA-30)', async () => {
        vi.mocked(sessions.update).mockResolvedValue({ ...tuesday, started_at: '2026-11-02T17:00:00.000Z', ended_at: '2026-11-02T18:00:00.000Z' })
        renderWithProviders(<AgendaPage />)
        const moved = await block('14:00 – 15:00')
        fireEvent.pointerDown(moved, { clientX: 150, clientY: (14 * 60 + 10) * PX_PER_MINUTE, button: 0 })
        fireEvent.pointerMove(window, { clientX: 50, clientY: (14 * 60 + 10) * PX_PER_MINUTE })
        fireEvent.pointerUp(window, { clientX: 50, clientY: (14 * 60 + 10) * PX_PER_MINUTE })
        await waitFor(() =>
          expect(sessions.update).toHaveBeenCalledWith('s2', {
            started_at: '2026-11-02T17:00:00.000Z',
            ended_at: '2026-11-02T18:00:00.000Z',
          }),
        )
      })
    })

    it('puts the block back at 14:00 – 15:00 when the save fails', async () => {
      vi.mocked(sessions.update).mockRejectedValue({ response: { status: 404, data: { detail: 'Session not found' } } })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await pullEndTo1530(user, container)
      await waitFor(() => expect(sessions.update).toHaveBeenCalledTimes(1))
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      // A grid adjustment has no panel: its refusal is a toast (AGENDA-35).
      await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Session not found'))
      expect(screen.queryByRole('button', { name: 'Write the report, 14:00 – 15:30' })).toBeNull()
    })
  })
  describe('narrow screens and the calendar (AGENDA-36, AGENDA-40, AGENDA-41)', () => {
    const realMatchMedia = window.matchMedia
    const realWidth = window.innerWidth

    /** A window `px` wide, whose media queries answer for that width. */
    function setWidth(px: number) {
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: px })
      window.matchMedia = ((query: string) => {
        const max = /max-width:\s*(\d+)px/.exec(query)
        return {
          matches: max ? px <= Number(max[1]) : false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }
      }) as unknown as typeof window.matchMedia
    }

    afterEach(() => {
      window.matchMedia = realMatchMedia
      Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: realWidth })
    })

    const pickInCalendar = async (user: ReturnType<typeof renderWithProviders>['user'], day: string) => {
      await user.click(await screen.findByRole('button', { name: 'Today' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: day }))
    }

    it('shows the day timeline at 390 px', async () => {
      setWidth(390)
      const { container } = renderWithProviders(<AgendaPage />)
      expect(await screen.findByRole('group', { name: 'Days of the week' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Wednesday, November 4, 2026')
      expect(container.querySelectorAll('[data-agenda-column]')).toHaveLength(1)
      expect(screen.queryByRole('group', { name: 'View' })).toBeNull()
    })

    it('shows the week grid at 1024 px', async () => {
      setWidth(1024)
      const { container } = renderWithProviders(<AgendaPage />)
      expect(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
      expect(container.querySelectorAll('[data-agenda-column]')).toHaveLength(7)
      expect(screen.queryByRole('group', { name: 'Days of the week' })).toBeNull()
    })

    it('opens the week of 12 November when it is chosen in the week view (AGENDA-40)', async () => {
      setWidth(1024)
      const { user } = renderWithProviders(<AgendaPage />)
      await pickInCalendar(user, '12')
      expect(await weekHeading()).toHaveTextContent('November 9 – 15, 2026')
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(sessions.list).toHaveBeenCalledWith({ from: '2026-11-09', to: '2026-11-15' }))
    })

    it('opens Thursday 12 November itself when it is chosen in the day view (AGENDA-41)', async () => {
      setWidth(390)
      const { user, container } = renderWithProviders(<AgendaPage />)
      await pickInCalendar(user, '12')
      expect(await weekHeading()).toHaveTextContent('Thursday, November 12, 2026')
      expect(container.querySelector('[data-day-pill="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(sessions.list).toHaveBeenCalledWith({ from: '2026-11-09', to: '2026-11-15' }))
    })

    it('moves the day view to the Monday of the next week (AGENDA-38)', async () => {
      setWidth(390)
      const { user } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'Next week' }))
      expect(await weekHeading()).toHaveTextContent('Monday, November 9, 2026')
    })

    it('shows the day of a tapped pill and opens New session on it from + (AGENDA-37, AGENDA-43)', async () => {
      setWidth(390)
      const { user, container } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('group', { name: 'Days of the week' })
      await user.click(container.querySelector<HTMLElement>('[data-day-pill="2026-11-02"]')!)
      expect(await weekHeading()).toHaveTextContent('Monday, November 2, 2026 · 1hr')
      expect(screen.getByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'New session' }))
      expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
      expect(screen.getByLabelText('Date')).toHaveValue('2026-11-02')
      expect(screen.getByLabelText('Start')).toHaveValue('14:00')
      expect(screen.getByLabelText('End')).toHaveValue('14:05')
    })
  })
})
