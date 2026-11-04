import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { PX_PER_MINUTE } from '@/components/agenda/week-grid'
import { lists, sessions } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { AgendaSession, ListCard } from '@/types'
import AgendaPage from './agenda'

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), board: vi.fn() },
  sessions: { list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
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

  it('shows the details to a viewer without Edit nor Delete (AGENDA-44)', async () => {
    workspace.canWrite = false
    const { user } = renderWithProviders(<AgendaPage />)
    await user.click(await screen.findByRole('button', { name: 'Write the report, 10:00 – 11:00' }))
    expect(screen.getByRole('heading', { name: 'Write the report' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
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

    it('puts the block back at 14:00 – 15:00 when the save fails', async () => {
      vi.mocked(sessions.update).mockRejectedValue({ response: { status: 404, data: { detail: 'Session not found' } } })
      const { user, container } = renderWithProviders(<AgendaPage />)
      await pullEndTo1530(user, container)
      await waitFor(() => expect(sessions.update).toHaveBeenCalledTimes(1))
      expect(await block('14:00 – 15:00')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Write the report, 14:00 – 15:30' })).toBeNull()
    })
  })
})
