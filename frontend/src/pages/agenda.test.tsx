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

const workspace = vi.hoisted(() => ({ canWrite: true, minSessionMinutes: null as number | null, mergeGapMinutes: null as number | null }))
vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({
    current: {
      id: 'ws',
      name: 'Synthetic workspace',
      timezone: null,
      min_session_minutes: workspace.minSessionMinutes,
      merge_gap_minutes: workspace.mergeGapMinutes,
    },
    canWrite: workspace.canWrite,
  }),
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
  workspace.minSessionMinutes = null
  workspace.mergeGapMinutes = null
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

  it('zooms the hours to 1x, 2x or 3x, one at a time, from the control right of Day and Week', async () => {
    const { user, container } = renderWithProviders(<AgendaPage />)
    const block = await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })
    const zoom = screen.getByRole('group', { name: 'Zoom' })
    const view = screen.getByRole('group', { name: 'View' })
    expect(view.compareDocumentPosition(zoom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(view.nextElementSibling).toBe(zoom)
    const levels = within(zoom).getAllByRole('button')
    expect(levels.map((level) => level.textContent)).toEqual(['1x', '2x', '3x'])
    const pressed = () => levels.filter((level) => level.getAttribute('aria-pressed') === 'true').map((level) => level.textContent)
    const gridHeight = () => (container.querySelector('[data-agenda-scroll] > div') as HTMLElement).style.height

    // 3x by default: 144 px an hour; the 1-hour session is as tall as an hour.
    expect(pressed()).toEqual(['3x'])
    expect(gridHeight()).toBe(`${24 * 144}px`)
    expect(block.style.height).toBe('144px')

    await user.click(within(zoom).getByRole('button', { name: '1x' }))
    expect(pressed()).toEqual(['1x'])
    expect(gridHeight()).toBe(`${24 * 48}px`)
    expect(screen.getByRole('button', { name: 'Write the report, 10:00 – 11:00' }).style.height).toBe('48px')

    await user.click(within(zoom).getByRole('button', { name: '2x' }))
    expect(pressed()).toEqual(['2x'])
    expect(gridHeight()).toBe(`${24 * 96}px`)
  })

  it('opens on the zoom picked last on this device', async () => {
    const first = renderWithProviders(<AgendaPage />)
    const zoom = await screen.findByRole('group', { name: 'Zoom' })
    await first.user.click(within(zoom).getByRole('button', { name: '1x' }))
    first.unmount()

    renderWithProviders(<AgendaPage />)
    const again = await screen.findByRole('group', { name: 'Zoom' })
    expect(within(again).getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(again).getByRole('button', { name: '3x' })).toHaveAttribute('aria-pressed', 'false')
    expect((await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })).style.height).toBe('48px')
  })

  it('names the zoom Lupa in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    renderWithProviders(<AgendaPage />)
    expect(await screen.findByRole('group', { name: 'Lupa' })).toBeInTheDocument()
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

  describe('the workspace minimum session length (#22)', () => {
    // Monday 10:30 to 10:32 in São Paulo: 2 minutes, under a minimum of 5.
    const blip: AgendaSession = { ...monday, id: 's2', started_at: '2026-11-02T13:30:00.000Z', ended_at: '2026-11-02T13:32:00.000Z' }
    // Wednesday 14:01 to 14:03, inside the New session that opens at 14:00 – 14:05 at 14:07 (AGENDA-15).
    const wednesdayBlip: AgendaSession = { ...blip, id: 's3', started_at: '2026-11-04T17:01:00.000Z', ended_at: '2026-11-04T17:03:00.000Z' }

    it('HIDE-11 HIDE-16 hides the 2-minute session under a minimum of 5 and shows both with the minimum off', async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, blip] })
      workspace.minSessionMinutes = 5
      const { unmount } = renderWithProviders(<AgendaPage />)
      expect(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Write the report, 10:30 – 10:32' })).toBeNull()
      unmount()

      workspace.minSessionMinutes = null
      renderWithProviders(<AgendaPage />)
      expect(await screen.findByRole('button', { name: 'Write the report, 10:30 – 10:32' })).toBeInTheDocument()
    })

    it('HIDE-15 opens New session over a hidden session without the overlap warning', async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, wednesdayBlip] })
      workspace.minSessionMinutes = 5
      const { user } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })
      await user.click(screen.getByRole('button', { name: 'New session' }))
      expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('HIDE-15 still warns about the same session with the minimum off', async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, wednesdayBlip] })
      const { user } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'Write the report, 14:01 – 14:03' })
      await user.click(screen.getByRole('button', { name: 'New session' }))
      expect(await screen.findByRole('status')).toHaveTextContent('Overlaps Write the report (14:01 – 14:03).')
    })

    it('HIDE-17 takes the block off the grid and closes the panel once the session is saved shorter than the minimum', async () => {
      workspace.minSessionMinutes = 5
      const saved = { ...monday, ended_at: '2026-11-02T13:03:00.000Z' }
      vi.mocked(sessions.update).mockImplementation(async () => {
        vi.mocked(sessions.list).mockResolvedValue({ sessions: [saved] })
        return saved
      })
      const { user } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' }))
      await user.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.change(await screen.findByLabelText('End'), { target: { value: '10:03' } })
      await user.click(screen.getByRole('button', { name: 'Save' }))

      await waitFor(() => expect(screen.queryByRole('button', { name: /^Write the report, 10:00/ })).toBeNull())
      expect(screen.queryByRole('heading', { name: 'Edit session' })).toBeNull()
      expect(screen.queryByRole('heading', { name: 'Write the report' })).toBeNull()
    })

    it('HIDE-18 redraws the grid when the minimum of the current workspace changes, without a reload', async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, blip] })
      const { rerender } = renderWithProviders(<AgendaPage />)
      expect(await screen.findByRole('button', { name: 'Write the report, 10:30 – 10:32' })).toBeInTheDocument()
      const loads = vi.mocked(sessions.list).mock.calls.length

      workspace.minSessionMinutes = 5
      rerender(<AgendaPage />)
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Write the report, 10:30 – 10:32' })).toBeNull())
      expect(screen.getByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
      // The grid redraws from the sessions already loaded.
      expect(sessions.list).toHaveBeenCalledTimes(loads)
    })
  })

  describe('joining near sessions (#23)', () => {
    // Monday in São Paulo, both of Work: 10:20 to 11:01, then 11:05 to 11:16, 4 minutes later (the example of #23).
    const first: AgendaSession = { ...monday, id: 'a', started_at: '2026-11-02T13:20:00.000Z', ended_at: '2026-11-02T14:01:00.000Z' }
    const second: AgendaSession = {
      ...monday,
      id: 'b',
      origin: 'manual',
      task_id: 't2',
      task_title: 'Review the notes',
      started_at: '2026-11-02T14:05:00.000Z',
      ended_at: '2026-11-02T14:16:00.000Z',
    }
    const joined = () => screen.findByRole('button', { name: 'Work, 2 sessions, 10:20 – 11:16' })
    const pickSecond = async (user: ReturnType<typeof renderWithProviders>['user']) => {
      await user.click(await joined())
      const panel = screen.getByRole('complementary', { name: 'Work · 2 sessions' })
      await user.click(within(panel).getByRole('button', { name: /Review the notes/ }))
    }

    beforeEach(() => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [first, second] })
      workspace.mergeGapMinutes = 5
    })

    it('MERGE-23 draws the two sessions as one block under a join gap of 5, and as two with the gap off', async () => {
      const { unmount } = renderWithProviders(<AgendaPage />)
      expect(await joined()).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Review the notes, 11:05 – 11:16' })).toBeNull()
      unmount()

      workspace.mergeGapMinutes = null
      renderWithProviders(<AgendaPage />)
      expect(await screen.findByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Review the notes, 11:05 – 11:16' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /2 sessions/ })).toBeNull()
    })

    it('MERGE-27 MERGE-28 opens the list of the block on a click, and the details of the 11:05 session with Edit and Delete', async () => {
      const { user } = renderWithProviders(<AgendaPage />)
      await user.click(await joined())
      expect(await joined()).toHaveAttribute('aria-pressed', 'true')
      const panel = screen.getByRole('complementary', { name: 'Work · 2 sessions' })
      expect(within(panel).getByText('Monday, November 2 · 10:20 – 11:16')).toBeInTheDocument()
      expect(within(panel).getByText('11:05 – 11:16 · 11min')).toBeInTheDocument()

      await user.click(within(panel).getByRole('button', { name: /Review the notes/ }))
      expect(screen.getByRole('heading', { name: 'Review the notes' })).toBeInTheDocument()
      expect(screen.getByText('Monday, November 2 · 11:05 – 11:16 · 11min')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    })

    it('MERGE-29 MERGE-33 draws the chosen session alone with its handles, and the way back shows the list again', async () => {
      const { user, container } = renderWithProviders(<AgendaPage />)
      await pickSecond(user)
      const alone = await screen.findByRole('button', { name: 'Review the notes, 11:05 – 11:16' })
      expect(alone).toHaveAttribute('aria-pressed', 'true')
      expect(alone.querySelector('[data-handle="top"]')).not.toBeNull()
      expect(alone.querySelector('[data-handle="bottom"]')).not.toBeNull()
      // The rest of the block is drawn without it: one session is a common block.
      expect(screen.getByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeInTheDocument()
      expect(container.querySelector('[data-joined]')).toBeNull()

      await user.click(screen.getByRole('button', { name: '‹ Work · 2 sessions' }))
      expect(screen.getByRole('complementary', { name: 'Work · 2 sessions' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Review the notes' })).toBeNull()
    })

    it('MERGE-31 joins the chosen session again with its neighbour once the details close', async () => {
      const { user } = renderWithProviders(<AgendaPage />)
      await pickSecond(user)
      await screen.findByRole('button', { name: 'Review the notes, 11:05 – 11:16' })
      await user.click(screen.getByRole('button', { name: 'Close' }))
      expect(await joined()).toHaveAttribute('aria-pressed', 'false')
      expect(screen.queryByRole('button', { name: 'Review the notes, 11:05 – 11:16' })).toBeNull()
      expect(screen.queryByRole('complementary')).toBeNull()
    })

    it('MERGE-31 joins the chosen session again once its edit is saved', async () => {
      const saved = { ...second, ended_at: '2026-11-02T14:20:00.000Z' }
      vi.mocked(sessions.update).mockImplementation(async () => {
        vi.mocked(sessions.list).mockResolvedValue({ sessions: [first, saved] })
        return saved
      })
      const { user } = renderWithProviders(<AgendaPage />)
      await pickSecond(user)
      await user.click(screen.getByRole('button', { name: 'Edit' }))
      fireEvent.change(await screen.findByLabelText('End'), { target: { value: '11:20' } })
      await user.click(screen.getByRole('button', { name: 'Save' }))
      expect(await screen.findByRole('button', { name: 'Work, 2 sessions, 10:20 – 11:20' })).toBeInTheDocument()
      expect(screen.queryByRole('complementary')).toBeNull()
    })

    it('MERGE-31 closes the panel once the chosen session is deleted, leaving its neighbour alone', async () => {
      vi.mocked(sessions.remove).mockImplementation(async () => {
        vi.mocked(sessions.list).mockResolvedValue({ sessions: [first] })
      })
      const { user } = renderWithProviders(<AgendaPage />)
      await pickSecond(user)
      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
      expect(sessions.remove).toHaveBeenCalledWith('b')
      await waitFor(() => expect(screen.queryByRole('button', { name: 'Review the notes, 11:05 – 11:16' })).toBeNull())
      expect(screen.getByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeInTheDocument()
      expect(screen.queryByRole('complementary')).toBeNull()
    })

    it('MERGE-33 keeps the way back to the block when deleting the chosen session fails', async () => {
      vi.mocked(sessions.remove).mockRejectedValue({ response: { status: 500, data: { detail: 'Server error' } } })
      const { user } = renderWithProviders(<AgendaPage />)
      await pickSecond(user)
      await user.click(screen.getByRole('button', { name: 'Delete' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }))
      expect(sessions.remove).toHaveBeenCalledWith('b')
      await waitFor(() => expect(toast.error).toHaveBeenCalled())

      // The session is back, still chosen from its block: its details and the way back to the list.
      expect(await screen.findByRole('heading', { name: 'Review the notes' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '‹ Work · 2 sessions' }))
      expect(screen.getByRole('complementary', { name: 'Work · 2 sessions' })).toBeInTheDocument()
    })

    it('MERGE-24 redraws the grid when the join gap of the current workspace changes, without a reload', async () => {
      workspace.mergeGapMinutes = null
      const { rerender } = renderWithProviders(<AgendaPage />)
      expect(await screen.findByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeInTheDocument()
      const loads = vi.mocked(sessions.list).mock.calls.length

      workspace.mergeGapMinutes = 5
      rerender(<AgendaPage />)
      expect(await joined()).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeNull()
      // The grid redraws from the sessions already loaded.
      expect(sessions.list).toHaveBeenCalledTimes(loads)

      // Back to 3 minutes: the 4-minute gap keeps them apart again.
      workspace.mergeGapMinutes = 3
      rerender(<AgendaPage />)
      expect(await screen.findByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /2 sessions/ })).toBeNull()
      expect(sessions.list).toHaveBeenCalledTimes(loads)
    })
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

    it('HIDE-11 HIDE-14 hides the 2-minute session in the day view under a minimum of 5, and the day total still counts it', async () => {
      setWidth(390)
      workspace.minSessionMinutes = 5
      // Wednesday, the day the narrow agenda opens on: 10:00 to 11:00, and 10:30 to 10:32.
      const long: AgendaSession = { ...monday, started_at: '2026-11-04T13:00:00.000Z', ended_at: '2026-11-04T14:00:00.000Z' }
      const blip: AgendaSession = { ...monday, id: 's2', started_at: '2026-11-04T13:30:00.000Z', ended_at: '2026-11-04T13:32:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [long, blip] })
      renderWithProviders(<AgendaPage />)

      expect(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Write the report, 10:30 – 10:32' })).toBeNull()
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Wednesday, November 4, 2026 · 1hr 2min')
    })

    it('MERGE-23 joins the two Work sessions into one block in the day view at 390 px, and picks one from it', async () => {
      setWidth(390)
      workspace.mergeGapMinutes = 5
      // Wednesday, the day the narrow agenda opens on: 10:20 to 11:01 and 11:05 to 11:16.
      const first: AgendaSession = { ...monday, id: 'a', started_at: '2026-11-04T13:20:00.000Z', ended_at: '2026-11-04T14:01:00.000Z' }
      const second: AgendaSession = {
        ...monday,
        id: 'b',
        task_title: 'Review the notes',
        started_at: '2026-11-04T14:05:00.000Z',
        ended_at: '2026-11-04T14:16:00.000Z',
      }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [first, second] })
      const { user } = renderWithProviders(<AgendaPage />)

      const block = await screen.findByRole('button', { name: 'Work, 2 sessions, 10:20 – 11:16' })
      expect(screen.queryByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeNull()
      // The day total is the sum of the sessions, not the gap (MERGE-20).
      expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Wednesday, November 4, 2026 · 52min')

      await user.click(block)
      const panel = screen.getByRole('complementary', { name: 'Work · 2 sessions' })
      await user.click(within(panel).getByRole('button', { name: /Review the notes/ }))
      expect(await screen.findByRole('button', { name: 'Review the notes, 11:05 – 11:16' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: '‹ Work · 2 sessions' })).toBeInTheDocument()
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
