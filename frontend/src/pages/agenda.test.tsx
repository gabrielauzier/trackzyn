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
  sessions: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), tasks: vi.fn(), searchTasks: vi.fn(), createTask: vi.fn() },
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
  vi.mocked(sessions.searchTasks).mockResolvedValue({
    tasks: [{ id: 't1', title: 'Write the report', list_id: WORK, list_name: 'Work', list_color: 3, column: 'today', updated_at: '2026-11-04T12:00:00.000Z' }],
  })
})

afterEach(async () => {
  vi.useRealTimers()
  await i18n.changeLanguage('en')
})

const weekHeading = () => screen.findByRole('heading', { level: 2 })
/** The header cell of the day view, with its weekday, date and total (ADJ-16). */
const dayHeader = async (day?: string) => {
  const selector = day ? `[data-day-header="${day}"]` : '[data-day-header]'
  await waitFor(() => expect(document.querySelector(selector)).not.toBeNull())
  return document.querySelector<HTMLElement>(selector)!
}

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

  /** Opens the view menu in the corner of the grid and gives its zoom control. */
  const openZoom = async (user: ReturnType<typeof renderWithProviders>['user'], name = 'Zoom') => {
    await user.click(await screen.findByRole('button', { name: /^(View options|Opções de exibição)/ }))
    return within(await screen.findByRole('dialog')).getByRole('group', { name })
  }

  it('DAYS-05 DAYS-06 zooms the hours to 1x, 2x or 3x, one at a time, from the view menu, and the toolbar has no zoom', async () => {
    const { user, container } = renderWithProviders(<AgendaPage />)
    const block = await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })
    expect(screen.queryByRole('group', { name: 'Zoom' })).toBeNull()
    const zoom = await openZoom(user)
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

  it('DAYS-05 opens on the zoom picked last on this device', async () => {
    const first = renderWithProviders(<AgendaPage />)
    await first.user.click(within(await openZoom(first.user)).getByRole('button', { name: '1x' }))
    first.unmount()

    const second = renderWithProviders(<AgendaPage />)
    const again = await openZoom(second.user)
    expect(within(again).getByRole('button', { name: '1x' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(again).getByRole('button', { name: '3x' })).toHaveAttribute('aria-pressed', 'false')
    expect((await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })).style.height).toBe('48px')
  })

  it('names the zoom Lupa in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    const { user } = renderWithProviders(<AgendaPage />)
    expect(await openZoom(user, 'Lupa')).toBeInTheDocument()
  })

  describe('the week days filter (#26)', () => {
    // Saturday 7 November, 10:00 to 11:00 in São Paulo.
    const saturday: AgendaSession = { ...monday, id: 's7', task_title: 'Weekend notes', started_at: '2026-11-07T13:00:00.000Z', ended_at: '2026-11-07T14:00:00.000Z' }
    const headers = (container: HTMLElement) => [...container.querySelectorAll('[data-day-header]')].map((cell) => cell.getAttribute('data-day-header'))

    it('DAYS-01 puts the view options button in the corner of the week header', async () => {
      const { container } = renderWithProviders(<AgendaPage />)
      const button = await screen.findByRole('button', { name: 'View options' })
      expect(container.querySelector('[data-agenda-header]')).toContainElement(button)
    })

    it('DAYS-09 DAYS-11 DAYS-16 hides Saturday and Sunday at once with Mon – Fri, keeping the totals of the other days', async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, saturday] })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })
      const mondayTotal = container.querySelector('[data-day-header="2026-11-02"]')!.textContent
      await user.click(screen.getByRole('button', { name: 'View options' }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Mon – Fri' }))

      expect(headers(container)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'])
      expect(container.querySelectorAll('[data-agenda-column]')).toHaveLength(5)
      expect(screen.queryByRole('button', { name: 'Weekend notes, 10:00 – 11:00' })).toBeNull()
      expect(container.querySelector('[data-day-header="2026-11-02"]')!.textContent).toBe(mondayTotal)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'View options, 5 of 7 days' })).toBeInTheDocument()
    })

    it('DAYS-10 shows a day again at once when it is checked', async () => {
      const { user, container } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'View options' }))
      const panel = await screen.findByRole('dialog')
      await user.click(within(panel).getByRole('checkbox', { name: 'Wednesday' }))
      expect(headers(container)).not.toContain('2026-11-04')
      await user.click(within(panel).getByRole('checkbox', { name: 'Wednesday' }))
      expect(headers(container)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07', '2026-11-08'])
    })

    it('DAYS-15 opens on the days chosen last on this device', async () => {
      const first = renderWithProviders(<AgendaPage />)
      await first.user.click(await screen.findByRole('button', { name: 'View options' }))
      await first.user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Mon – Fri' }))
      first.unmount()

      const { container } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'View options, 5 of 7 days' })
      expect(headers(container)).toEqual(['2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06'])
    })

    it('DAYS-16 opens New session on a hidden today and warns about an overlap with a session of that hidden day', async () => {
      // Wednesday, today, is the hidden day; its 14:01 to 14:03 session is inside the New session at 14:00 – 14:05.
      localStorage.setItem('agenda.days', '[0,1,3,4,5,6]')
      const wednesday: AgendaSession = { ...monday, id: 's8', task_title: 'Quick call', started_at: '2026-11-04T17:01:00.000Z', ended_at: '2026-11-04T17:03:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, wednesday, saturday] })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'View options, 6 of 7 days' })
      expect(container.querySelector('[data-day-header="2026-11-04"]')).toBeNull()
      expect(screen.queryByRole('button', { name: 'Quick call, 14:01 – 14:03' })).toBeNull()

      await user.click(screen.getByRole('button', { name: 'New session' }))
      expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
      expect(screen.getByLabelText('Date')).toHaveValue('2026-11-04')
      expect(screen.getByRole('status')).toHaveTextContent('Overlaps Quick call (14:01 – 14:03).')
    })
  })

  describe('hiding the breaks (#29)', () => {
    // Monday 11:00 to 11:15 (closed) and Wednesday 14:00 to now (open), both breaks of Work.
    const pause: AgendaSession = { ...monday, id: 'b1', kind: 'break', task_id: null, task_title: null, started_at: '2026-11-02T14:00:00.000Z', ended_at: '2026-11-02T14:15:00.000Z' }
    const openPause: AgendaSession = { ...pause, id: 'b2', started_at: '2026-11-04T17:00:00.000Z', ended_at: null }
    const turnOn = async (user: ReturnType<typeof renderWithProviders>['user']) => {
      await user.click(await screen.findByRole('button', { name: /^View options/ }))
      await user.click(within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Hide breaks' }))
    }

    it('ADJ-22 ADJ-23 takes every break off at once, open or closed, keeping the day totals, and brings them back', async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, pause, openPause] })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'Break, 11:00 – 11:15' })
      expect(screen.getByRole('button', { name: 'Break, 14:00 – now' })).toBeInTheDocument()
      const mondayTotal = container.querySelector('[data-day-header="2026-11-02"]')!.textContent

      await turnOn(user)
      expect(screen.queryByRole('button', { name: 'Break, 11:00 – 11:15' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Break, 14:00 – now' })).toBeNull()
      expect(screen.getByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
      expect(container.querySelector('[data-day-header="2026-11-02"]')!.textContent).toBe(mondayTotal)
      expect(container.querySelector('[data-filter-dot]')).not.toBeNull()
      expect(screen.getByRole('dialog')).toBeInTheDocument()

      await user.click(within(screen.getByRole('dialog')).getByRole('switch', { name: 'Hide breaks' }))
      expect(screen.getByRole('button', { name: 'Break, 11:00 – 11:15' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Break, 14:00 – now' })).toBeInTheDocument()
    })

    it('ADJ-22 hides the breaks in the day view too', async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, openPause] })
      const { user } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'Day' }))
      await screen.findByRole('button', { name: 'Break, 14:00 – now' })
      await turnOn(user)
      expect(screen.queryByRole('button', { name: 'Break, 14:00 – now' })).toBeNull()
    })

    it('ADJ-23 leaves a hidden break out of the overlap warning of New session', async () => {
      // The open break from 14:00 overlaps the New session at 14:00 – 14:05.
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, openPause] })
      const { user } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'Break, 14:00 – now' })
      await user.click(screen.getByRole('button', { name: 'New session' }))
      expect(await screen.findByRole('status')).toHaveTextContent('Overlaps Break (14:00 – now).')
      await user.keyboard('{Escape}')

      await turnOn(user)
      await user.keyboard('{Escape}')
      await user.click(screen.getByRole('button', { name: 'New session' }))
      expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
      expect(screen.queryByRole('status')).toBeNull()
    })

    it('ADJ-25 keeps the breaks hidden after the agenda is opened again', async () => {
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, pause] })
      const first = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'Break, 11:00 – 11:15' })
      await turnOn(first.user)
      first.unmount()

      renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })
      expect(screen.queryByRole('button', { name: 'Break, 11:00 – 11:15' })).toBeNull()
    })

    it('ADJ-25 opens with the breaks hidden when this device chose so last', async () => {
      localStorage.setItem('agenda.hideBreaks', 'true')
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, pause] })
      const { container } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' })
      expect(screen.queryByRole('button', { name: 'Break, 11:00 – 11:15' })).toBeNull()
      expect(container.querySelector('[data-filter-dot]')).not.toBeNull()
    })
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

    it('draws the session hovered in the list out of its block, without opening it, and joins it again on leave', async () => {
      const { user, container } = renderWithProviders(<AgendaPage />)
      await user.click(await joined())
      const panel = screen.getByRole('complementary', { name: 'Work · 2 sessions' })
      const item = within(panel).getByRole('button', { name: /Review the notes/ })
      await user.hover(item)
      const alone = screen.getByRole('button', { name: 'Review the notes, 11:05 – 11:16' })
      expect(screen.getByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toBeInTheDocument()
      expect(container.querySelector('[data-joined]')).toBeNull()
      // The hovered session shows selected, not the rest of the block.
      expect(alone).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: 'Write the report, 10:20 – 11:01' })).toHaveAttribute('aria-pressed', 'false')
      // Only the grid changes: no handles, the list stays and nothing opens.
      expect(alone.querySelector('[data-handle]')).toBeNull()
      expect(screen.getByRole('complementary', { name: 'Work · 2 sessions' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Review the notes' })).toBeNull()

      await user.unhover(item)
      expect(await joined()).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('button', { name: 'Review the notes, 11:05 – 11:16' })).toBeNull()
    })

    it('moves the selection to the hovered session, off the rest of a block of three', async () => {
      // A third Work session at 11:03 to 11:04: hovering the 11:05 one leaves 10:20 – 11:01 and 11:03 – 11:04 joined.
      const third: AgendaSession = { ...monday, id: 'c', task_title: 'Send the notes', started_at: '2026-11-02T14:03:00.000Z', ended_at: '2026-11-02T14:04:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [first, second, third] })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'Work, 3 sessions, 10:20 – 11:16' }))
      const panel = screen.getByRole('complementary', { name: 'Work · 3 sessions' })
      await user.hover(within(panel).getByRole('button', { name: /Review the notes/ }))
      expect(screen.getByRole('button', { name: 'Review the notes, 11:05 – 11:16' })).toHaveAttribute('aria-pressed', 'true')
      const rest = container.querySelector<HTMLElement>('[data-joined]')!
      expect(rest).toHaveAccessibleName('Work, 2 sessions, 10:20 – 11:04')
      expect(rest).toHaveAttribute('aria-pressed', 'false')
    })

    it('draws nothing out of the block when the list opens again after a session was hovered and picked', async () => {
      const { user, container } = renderWithProviders(<AgendaPage />)
      await pickSecond(user)
      await user.click(screen.getByRole('button', { name: '‹ Work · 2 sessions' }))
      expect(screen.getByRole('complementary', { name: 'Work · 2 sessions' })).toBeInTheDocument()
      expect(container.querySelector('[data-joined]')).not.toBeNull()
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

    it('ADJ-09 joins the chosen session again once its end pulled to 11:30 is saved from the panel', async () => {
      const saved = { ...second, ended_at: '2026-11-02T14:30:00.000Z' }
      vi.mocked(sessions.update).mockImplementation(async () => {
        vi.mocked(sessions.list).mockResolvedValue({ sessions: [first, saved] })
        return saved
      })
      const { user } = renderWithProviders(<AgendaPage />)
      await pickSecond(user)
      const alone = await screen.findByRole('button', { name: 'Review the notes, 11:05 – 11:16' })
      fireEvent.pointerDown(alone.querySelector('[data-handle="bottom"]')!, { clientY: (11 * 60 + 16) * PX_PER_MINUTE, button: 0 })
      fireEvent.pointerMove(window, { clientY: (11 * 60 + 30) * PX_PER_MINUTE })
      fireEvent.pointerUp(window, { clientY: (11 * 60 + 30) * PX_PER_MINUTE })
      await user.click(await screen.findByRole('button', { name: 'Save time' }))
      expect(sessions.update).toHaveBeenCalledWith('b', { ended_at: '2026-11-02T14:30:00.000Z' })
      expect(await screen.findByRole('button', { name: 'Work, 2 sessions, 10:20 – 11:30' })).toBeInTheDocument()
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

  describe('adjusting a block (AGENDA-29, AGENDA-30), confirmed in the panel (#29)', () => {
    // Tuesday 14:00 to 15:00 in São Paulo.
    const tuesday: AgendaSession = { ...monday, id: 's2', started_at: '2026-11-03T17:00:00.000Z', ended_at: '2026-11-03T18:00:00.000Z' }
    const block = (range: string) => screen.findByRole('button', { name: `Write the report, ${range}` })
    const px = (hours: number, minutes = 0) => (hours * 60 + minutes) * PX_PER_MINUTE
    const confirmPanel = () => screen.findByText('New time — not saved yet')

    async function pullEndTo1530(user: ReturnType<typeof renderWithProviders>['user'], container: HTMLElement) {
      await user.click(await block('14:00 – 15:00'))
      fireEvent.pointerDown(container.querySelector('[data-handle="bottom"]')!, { clientY: px(15), button: 0 })
      fireEvent.pointerMove(window, { clientY: px(15, 30) })
      fireEvent.pointerUp(window, { clientY: px(15, 30) })
    }

    /** Drags the block of 14:00 – 15:00 two hours down, to 16:00 – 17:00. */
    async function moveTo1600() {
      const moved = await block('14:00 – 15:00')
      fireEvent.pointerDown(moved, { clientY: px(14, 10), button: 0 })
      fireEvent.pointerMove(window, { clientY: px(16, 10) })
      fireEvent.pointerUp(window, { clientY: px(16, 10) })
    }

    beforeEach(() => vi.mocked(sessions.list).mockResolvedValue({ sessions: [tuesday] }))

    it('ADJ-01 ADJ-03 saves the end pulled from 15:00 to 15:30 only on Save time', async () => {
      const saved = { ...tuesday, ended_at: '2026-11-03T18:30:00.000Z' }
      vi.mocked(sessions.update).mockImplementation(async () => {
        vi.mocked(sessions.list).mockResolvedValue({ sessions: [saved] })
        return saved
      })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await pullEndTo1530(user, container)
      await confirmPanel()
      expect(sessions.update).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: 'Save time' }))
      expect(sessions.update).toHaveBeenCalledTimes(1)
      expect(sessions.update).toHaveBeenCalledWith('s2', { ended_at: '2026-11-03T18:30:00.000Z' })
      expect(await block('14:00 – 15:30')).toBeInTheDocument()
      // Once saved, the panel shows the session's details.
      expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
      expect(screen.queryByText('New time — not saved yet')).toBeNull()
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

      it('saves a block moved from Tuesday to Monday with the same hour once confirmed (AGENDA-30, ADJ-03)', async () => {
        vi.mocked(sessions.update).mockResolvedValue({ ...tuesday, started_at: '2026-11-02T17:00:00.000Z', ended_at: '2026-11-02T18:00:00.000Z' })
        const { user } = renderWithProviders(<AgendaPage />)
        const moved = await block('14:00 – 15:00')
        fireEvent.pointerDown(moved, { clientX: 150, clientY: px(14, 10), button: 0 })
        fireEvent.pointerMove(window, { clientX: 50, clientY: px(14, 10) })
        fireEvent.pointerUp(window, { clientX: 50, clientY: px(14, 10) })
        await confirmPanel()
        expect(sessions.update).not.toHaveBeenCalled()
        await user.click(screen.getByRole('button', { name: 'Save time' }))
        expect(sessions.update).toHaveBeenCalledWith('s2', { started_at: '2026-11-02T17:00:00.000Z', ended_at: '2026-11-02T18:00:00.000Z' })
      })
    })

    it('ADJ-01 opens the panel with the saved time struck through and the new one, sending nothing, the block at the new time', async () => {
      const { container } = renderWithProviders(<AgendaPage />)
      await moveTo1600()
      await confirmPanel()
      expect(container.querySelector('del')).toHaveTextContent('Tue, Nov 3 · 14:00 – 15:00')
      expect(screen.getByText('Tue, Nov 3 · 16:00 – 17:00 · 1hr')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save time' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Write the report, 16:00 – 17:00' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Write the report, 14:00 – 15:00' })).toBeNull()
      expect(sessions.update).not.toHaveBeenCalled()
    })

    it('ADJ-02 never draws the block back at its saved time while the save is on its way, nor after', async () => {
      let answer: () => void = () => {}
      const saved = { ...tuesday, started_at: '2026-11-03T19:00:00.000Z', ended_at: '2026-11-03T20:00:00.000Z' }
      vi.mocked(sessions.update).mockImplementation(
        () =>
          new Promise((resolve) => {
            answer = () => {
              vi.mocked(sessions.list).mockResolvedValue({ sessions: [saved] })
              resolve(saved)
            }
          }),
      )
      // Every render of the block's old time is a flash of the wrong place.
      const { user } = renderWithProviders(<AgendaPage />)
      await moveTo1600()
      await confirmPanel()
      const seenAtOld: boolean[] = []
      const observer = new MutationObserver(() =>
        seenAtOld.push(screen.queryByRole('button', { name: 'Write the report, 14:00 – 15:00' }) !== null),
      )
      observer.observe(document.body, { subtree: true, childList: true, attributes: true })
      await user.click(screen.getByRole('button', { name: 'Save time' }))
      expect(screen.getByRole('button', { name: 'Write the report, 16:00 – 17:00' })).toBeInTheDocument()
      const loads = vi.mocked(sessions.list).mock.calls.length
      answer()
      expect(await screen.findByRole('button', { name: 'Edit' })).toBeInTheDocument()
      // The agenda reads again once the save is answered.
      await waitFor(() => expect(vi.mocked(sessions.list).mock.calls.length).toBeGreaterThan(loads))
      observer.disconnect()
      expect(screen.getByRole('button', { name: 'Write the report, 16:00 – 17:00' })).toBeInTheDocument()
      expect(seenAtOld).not.toContain(true)
    })

    it('ADJ-04 shows a refusal in the panel, without a toast, keeping the block at the new time', async () => {
      vi.mocked(sessions.update).mockRejectedValue({ response: { status: 404, data: { detail: 'Session not found' } } })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await pullEndTo1530(user, container)
      await user.click(await screen.findByRole('button', { name: 'Save time' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Session not found')
      expect(toast.error).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Write the report, 14:00 – 15:30' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Save time' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    })

    it('ADJ-05 puts the block back on Cancel and on Esc, sending nothing, and shows the details', async () => {
      const { user } = renderWithProviders(<AgendaPage />)
      await moveTo1600()
      await confirmPanel()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Write the report' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()

      await moveTo1600()
      await confirmPanel()
      await user.keyboard('{Escape}')
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      expect(screen.queryByText('New time — not saved yet')).toBeNull()
      expect(sessions.update).not.toHaveBeenCalled()
    })

    it('ADJ-06 keeps the pending time through the click that follows the release of its own block', async () => {
      const { user } = renderWithProviders(<AgendaPage />)
      const moved = await block('14:00 – 15:00')
      fireEvent.pointerDown(moved, { clientY: px(14, 10), button: 0 })
      fireEvent.pointerMove(window, { clientY: px(16, 10) })
      fireEvent.pointerUp(window, { clientY: px(16, 10) })
      fireEvent.click(screen.getByRole('button', { name: 'Write the report, 16:00 – 17:00' }))
      await confirmPanel()
      expect(screen.getByRole('button', { name: 'Write the report, 16:00 – 17:00' })).toBeInTheDocument()
      // A later, real click on the block does not drop it either.
      await user.click(screen.getByRole('button', { name: 'Write the report, 16:00 – 17:00' }))
      expect(screen.getByText('New time — not saved yet')).toBeInTheDocument()
    })

    it('ADJ-06 drops the pending time on a click on another block', async () => {
      const other: AgendaSession = { ...tuesday, id: 's3', task_title: 'Plan the week', started_at: '2026-11-03T12:00:00.000Z', ended_at: '2026-11-03T13:00:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [tuesday, other] })
      const { user } = renderWithProviders(<AgendaPage />)
      await moveTo1600()
      await confirmPanel()
      await user.click(screen.getByRole('button', { name: 'Plan the week, 09:00 – 10:00' }))
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Plan the week' })).toBeInTheDocument()
      expect(sessions.update).not.toHaveBeenCalled()
    })

    it('ADJ-06 drops the pending time on a drag over empty time and on another week', async () => {
      const { user, container } = renderWithProviders(<AgendaPage />)
      await moveTo1600()
      await confirmPanel()
      const column = container.querySelector('[data-agenda-column="2026-11-02"]')!
      fireEvent.pointerDown(column, { clientY: px(9), button: 0 })
      fireEvent.pointerMove(window, { clientY: px(10) })
      fireEvent.pointerUp(window, { clientY: px(10) })
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'New session' })).toBeInTheDocument()
      await user.keyboard('{Escape}')

      await moveTo1600()
      await confirmPanel()
      await user.click(screen.getByRole('button', { name: 'Next week' }))
      await user.click(screen.getByRole('button', { name: 'Previous week' }))
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      expect(screen.queryByText('New time — not saved yet')).toBeNull()
      expect(sessions.update).not.toHaveBeenCalled()
    })

    it('keeps drawing a block whose pending time is shorter than the workspace minimum until it is saved (HIDE-17)', async () => {
      workspace.minSessionMinutes = 30
      const { user, container } = renderWithProviders(<AgendaPage />)
      await user.click(await block('14:00 – 15:00'))
      fireEvent.pointerDown(container.querySelector('[data-handle="bottom"]')!, { clientY: px(15), button: 0 })
      fireEvent.pointerMove(window, { clientY: px(14, 15) })
      fireEvent.pointerUp(window, { clientY: px(14, 15) })
      await confirmPanel()
      expect(screen.getByRole('button', { name: 'Write the report, 14:00 – 14:15' })).toBeInTheDocument()
    })

    it('ADJ-06 drops the pending time when another block is opened from the keyboard', async () => {
      const other: AgendaSession = { ...tuesday, id: 's3', task_title: 'Plan the week', started_at: '2026-11-03T12:00:00.000Z', ended_at: '2026-11-03T13:00:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [tuesday, other] })
      const { user } = renderWithProviders(<AgendaPage />)
      await moveTo1600()
      await confirmPanel()
      screen.getByRole('button', { name: 'Plan the week, 09:00 – 10:00' }).focus()
      await user.keyboard('{Enter}')
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Write the report, 16:00 – 17:00' })).toBeNull()
      expect(screen.getByRole('heading', { name: 'Plan the week' })).toBeInTheDocument()
    })

    it('ADJ-01 opens the confirmation only once the block is released, not while its edge is pulled', async () => {
      const { user, container } = renderWithProviders(<AgendaPage />)
      await user.click(await block('14:00 – 15:00'))
      fireEvent.pointerDown(container.querySelector('[data-handle="bottom"]')!, { clientY: px(15), button: 0 })
      fireEvent.pointerMove(window, { clientY: px(15, 30) })
      expect(screen.queryByText('New time — not saved yet')).toBeNull()
      fireEvent.pointerUp(window, { clientY: px(15, 30) })
      expect(await confirmPanel()).toBeInTheDocument()
    })

    it('ADJ-01 ADJ-08 opens the confirmation for another block dragged while one session is in Edit', async () => {
      const other: AgendaSession = { ...tuesday, id: 's3', task_title: 'Plan the week', started_at: '2026-11-03T12:00:00.000Z', ended_at: '2026-11-03T13:00:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [tuesday, other] })
      const { user } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'Plan the week, 09:00 – 10:00' }))
      await user.click(screen.getByRole('button', { name: 'Edit' }))
      await screen.findByRole('heading', { name: 'Edit session' })
      await moveTo1600()
      expect(await confirmPanel()).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: 'Edit session' })).toBeNull()
      expect(screen.getByRole('heading', { name: 'Write the report' })).toBeInTheDocument()
      expect(sessions.update).not.toHaveBeenCalled()
    })

    it('ADJ-07 warns in the panel about an overlap at the new time', async () => {
      const call: AgendaSession = { ...tuesday, id: 's4', task_title: 'Call', started_at: '2026-11-03T19:30:00.000Z', ended_at: '2026-11-03T19:45:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [tuesday, call] })
      renderWithProviders(<AgendaPage />)
      await moveTo1600()
      await confirmPanel()
      expect(screen.getByRole('status')).toHaveTextContent('Overlaps Call (16:30 – 16:45).')
    })

    it('ADJ-08 changes the open Edit form when its block is released at a new time, and the fields move the block', async () => {
      const { user } = renderWithProviders(<AgendaPage />)
      await user.click(await block('14:00 – 15:00'))
      await user.click(screen.getByRole('button', { name: 'Edit' }))
      await screen.findByRole('heading', { name: 'Edit session' })
      await moveTo1600()
      expect(screen.getByRole('heading', { name: 'Edit session' })).toBeInTheDocument()
      expect(screen.queryByText('New time — not saved yet')).toBeNull()
      expect(screen.getByLabelText('Start')).toHaveValue('16:00')
      expect(screen.getByLabelText('End')).toHaveValue('17:00')
      expect(sessions.update).not.toHaveBeenCalled()

      fireEvent.change(screen.getByLabelText('Start'), { target: { value: '15:30' } })
      expect(await block('15:30 – 17:00')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      expect(sessions.update).not.toHaveBeenCalled()
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
      expect(await dayHeader('2026-11-04')).toHaveTextContent('November 4, 2026')
      expect(screen.queryByRole('heading', { level: 2 })).toBeNull()
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
      expect(await dayHeader('2026-11-04')).toHaveTextContent('November 4, 20261hr 2min')
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
      expect(await dayHeader('2026-11-04')).toHaveTextContent('November 4, 202652min')

      await user.click(block)
      const panel = screen.getByRole('complementary', { name: 'Work · 2 sessions' })
      await user.click(within(panel).getByRole('button', { name: /Review the notes/ }))
      expect(await screen.findByRole('button', { name: 'Review the notes, 11:05 – 11:16' })).toHaveAttribute('aria-pressed', 'true')
      expect(screen.getByRole('button', { name: '‹ Work · 2 sessions' })).toBeInTheDocument()
    })

    it('DAYS-02 DAYS-08 puts the view menu at the top of the day timeline at 390 px, with the zoom and without the week days', async () => {
      setWidth(390)
      localStorage.setItem('agenda.days', '[0,1,2,3,4]')
      const { user, container } = renderWithProviders(<AgendaPage />)
      const button = await screen.findByRole('button', { name: 'View options' })
      // In the first cell of the header, as in the week (ADJ-15).
      expect(container.querySelector('[data-agenda-header]')).toContainElement(button)
      await user.click(button)
      const panel = await screen.findByRole('dialog', { name: 'View options' })
      expect(within(panel).getByRole('group', { name: 'Zoom' })).toBeInTheDocument()
      expect(within(panel).queryByRole('group', { name: 'Week days' })).toBeNull()
    })

    it('DAYS-08 keeps the day timeline on its day at 390 px even when the week filter hides it', async () => {
      setWidth(390)
      localStorage.setItem('agenda.days', '[0,1]')
      // Wednesday 4 November, 09:00 to 10:00 in São Paulo: a session of the hidden day the timeline is on.
      const wednesday: AgendaSession = { ...monday, id: 's9', started_at: '2026-11-04T12:00:00.000Z', ended_at: '2026-11-04T13:00:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [monday, wednesday] })
      renderWithProviders(<AgendaPage />)
      expect(await dayHeader('2026-11-04')).toHaveTextContent('November 4, 2026')
      expect(await screen.findByRole('button', { name: 'Write the report, 09:00 – 10:00' })).toBeInTheDocument()
    })

    it('ADJ-19 takes the gestures in the day view at 1280 px, with New session in the toolbar and no + button', async () => {
      setWidth(1280)
      const { user, container } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'Day' }))
      await dayHeader('2026-11-04')
      const toolbarNew = screen.getAllByRole('button', { name: 'New session' })
      expect(toolbarNew).toHaveLength(1)
      expect(toolbarNew[0]).not.toHaveClass('rounded-full')

      // A click at 09:05 creates 09:00 – 10:00 (ADJ-10).
      const column = container.querySelector<HTMLElement>('[data-agenda-column="2026-11-04"]')!
      fireEvent.pointerDown(column, { clientY: (9 * 60 + 5) * PX_PER_MINUTE, button: 0 })
      fireEvent.pointerUp(window, { clientY: (9 * 60 + 5) * PX_PER_MINUTE })
      expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
      expect(column.querySelector('[data-draft]')).toHaveTextContent('09:00 – 10:00')
      await user.keyboard('{Escape}')
    })

    it('ADJ-19 opens the confirmation for a block dragged in the day view at 1280 px', async () => {
      setWidth(1280)
      const wednesday: AgendaSession = { ...monday, id: 's9', started_at: '2026-11-04T12:00:00.000Z', ended_at: '2026-11-04T13:00:00.000Z' }
      vi.mocked(sessions.list).mockResolvedValue({ sessions: [wednesday] })
      const { user } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'Day' }))
      const block = await screen.findByRole('button', { name: 'Write the report, 09:00 – 10:00' })
      fireEvent.pointerDown(block, { clientY: (9 * 60 + 10) * PX_PER_MINUTE, button: 0 })
      fireEvent.pointerMove(window, { clientY: (11 * 60 + 10) * PX_PER_MINUTE })
      fireEvent.pointerUp(window, { clientY: (11 * 60 + 10) * PX_PER_MINUTE })
      expect(await screen.findByText('New time — not saved yet')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Write the report, 11:00 – 12:00' })).toBeInTheDocument()
      expect(sessions.update).not.toHaveBeenCalled()
    })

    it('ADJ-19 keeps the + button and takes no drag in the day view at 390 px, without New session in the toolbar', async () => {
      setWidth(390)
      const { container } = renderWithProviders(<AgendaPage />)
      await dayHeader('2026-11-04')
      const news = screen.getAllByRole('button', { name: 'New session' })
      expect(news).toHaveLength(1)
      expect(news[0]).toHaveClass('rounded-full')
      const column = container.querySelector<HTMLElement>('[data-agenda-column="2026-11-04"]')!
      fireEvent.pointerDown(column, { clientY: 9 * 60 * PX_PER_MINUTE, button: 0 })
      fireEvent.pointerMove(window, { clientY: 10 * 60 * PX_PER_MINUTE })
      fireEvent.pointerUp(window, { clientY: 10 * 60 * PX_PER_MINUTE })
      expect(container.querySelector('[data-draft]')).toBeNull()
      expect(screen.queryByRole('heading', { name: 'New session' })).toBeNull()
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
      expect(await dayHeader('2026-11-12')).toHaveTextContent('November 12, 2026')
      expect(container.querySelector('[data-day-pill="2026-11-12"]')).toHaveAttribute('aria-pressed', 'true')
      expect(screen.queryByRole('dialog')).toBeNull()
      await waitFor(() => expect(sessions.list).toHaveBeenCalledWith({ from: '2026-11-09', to: '2026-11-15' }))
    })

    it('moves the day view to the Monday of the next week (AGENDA-38)', async () => {
      setWidth(390)
      const { user } = renderWithProviders(<AgendaPage />)
      await user.click(await screen.findByRole('button', { name: 'Next week' }))
      expect(await dayHeader('2026-11-09')).toHaveTextContent('November 9, 2026')
    })

    it('shows the day of a tapped pill and opens New session on it from + (AGENDA-37, AGENDA-43)', async () => {
      setWidth(390)
      const { user, container } = renderWithProviders(<AgendaPage />)
      await screen.findByRole('group', { name: 'Days of the week' })
      await user.click(container.querySelector<HTMLElement>('[data-day-pill="2026-11-02"]')!)
      expect(await dayHeader('2026-11-02')).toHaveTextContent('November 2, 20261hr')
      expect(screen.getByRole('button', { name: 'Write the report, 10:00 – 11:00' })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'New session' }))
      expect(await screen.findByRole('heading', { name: 'New session' })).toBeInTheDocument()
      expect(screen.getByLabelText('Date')).toHaveValue('2026-11-02')
      expect(screen.getByLabelText('Start')).toHaveValue('14:00')
      expect(screen.getByLabelText('End')).toHaveValue('14:05')
    })
  })
})
