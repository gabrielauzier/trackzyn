import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { sessions, tasks } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ListCard, RecentAgendaTask, Task } from '@/types'
import { NewSchedulePanel } from './new-schedule-panel'

vi.mock('@/lib/api', () => ({
  sessions: { searchTasks: vi.fn() },
  tasks: { get: vi.fn(), update: vi.fn(), create: vi.fn() },
}))

const SP = 'America/Sao_Paulo'
// Wednesday 4 November 2026, 14:07 in São Paulo.
const NOW = new Date('2026-11-04T17:07:00.000Z')
const DAY = '2026-11-05'
const WORK = 'l-work'
const HOME = 'l-home'

const list = (id: string, name: string, color: number): ListCard => ({
  id,
  workspace_id: 'ws',
  name,
  color,
  position: 1,
  is_archived: false,
  created_by_user_id: null,
  created_at: '2026-10-01T00:00:00.000Z',
  pending_count: 0,
  preview: [],
})
const LISTS = [list(WORK, 'Work', 3), list(HOME, 'Home', 5)]

const found = (id: string, title: string, column: RecentAgendaTask['column'] = 'backlog'): RecentAgendaTask => ({
  id,
  title,
  list_id: WORK,
  list_name: 'Work',
  list_color: 3,
  column,
  updated_at: '2026-11-04T12:00:00.000Z',
})

const fullTask = (id: string, overrides: Partial<Task> = {}): Task => ({
  id,
  list_id: WORK,
  title: `Task ${id}`,
  notes: '',
  estimate_minutes: null,
  column: 'backlog',
  position: 0,
  completed_at: null,
  created_at: '2026-11-01T00:00:00.000Z',
  subtasks: [],
  created_via: null,
  scheduled_on: null,
  scheduled_time: null,
  series: null,
  ...overrides,
})

function show(window: { start: number; end: number } | null = { start: 15 * 60, end: 16 * 60 }, day = DAY) {
  const onCancel = vi.fn()
  const onSaved = vi.fn()
  const result = renderWithProviders(
    <NewSchedulePanel day={day} window={window} timeZone={SP} lists={LISTS} defaultListId={null} onCancel={onCancel} onSaved={onSaved} now={NOW} />,
  )
  return { ...result, onCancel, onSaved }
}

async function pick(user: ReturnType<typeof renderWithProviders>['user'], title: string) {
  await user.click(screen.getByRole('combobox', { name: 'Task' }))
  await user.click(await screen.findByRole('option', { name: title }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(sessions.searchTasks).mockResolvedValue({
    tasks: [found('t1', 'Write the report'), found('t2', 'Plan the sprint', 'today'), found('t3', 'Old report', 'done')],
  })
  vi.mocked(tasks.update).mockImplementation(async (id) => fullTask(id))
})

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('NewSchedulePanel (US-8)', () => {
  it('shows the day and the window, with the window start as the time', () => {
    show()
    expect(screen.getByRole('heading', { name: 'New schedule' })).toBeInTheDocument()
    expect(screen.getByTestId('new-schedule-window')).toHaveTextContent('Thu, Nov 5 · 15:00 – 16:00')
    expect(screen.getByLabelText('Time')).toHaveValue('15:00')
  })

  it('is called Novo agendamento in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    show()
    expect(screen.getByRole('heading', { name: 'Novo agendamento' })).toBeInTheDocument()
  })

  it('searches the pending tasks of the workspace only', async () => {
    const { user } = show()
    await user.click(screen.getByRole('combobox', { name: 'Task' }))
    const listbox = await screen.findByRole('listbox')
    expect(await within(listbox).findByRole('option', { name: 'Write the report' })).toBeInTheDocument()
    expect(within(listbox).getByRole('option', { name: 'Plan the sprint' })).toBeInTheDocument()
    expect(within(listbox).queryByRole('option', { name: /Old report/ })).toBeNull()
  })

  it('D11 gives a task without an estimate the length of the window as its estimate', async () => {
    vi.mocked(tasks.get).mockResolvedValue(fullTask('t1', { title: 'Write the report' }))
    const { user, onSaved } = show({ start: 15 * 60, end: 16 * 60 + 30 })
    await pick(user, 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith('t1', { scheduled_on: DAY, scheduled_time: '15:00', estimate_minutes: 90 }))
    expect(onSaved).toHaveBeenCalledWith({ taskId: 't1', title: 'Write the report', day: DAY, time: '15:00' })
  })

  it('D11 keeps the estimate of a task that has one: the window sets only the start', async () => {
    vi.mocked(tasks.get).mockResolvedValue(fullTask('t1', { title: 'Write the report', estimate_minutes: 25 }))
    const { user } = show()
    await pick(user, 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith('t1', { scheduled_on: DAY, scheduled_time: '15:00' }))
  })

  it('replaces the schedule of a task already scheduled', async () => {
    vi.mocked(tasks.get).mockResolvedValue(fullTask('t2', { title: 'Plan the sprint', estimate_minutes: 60, scheduled_on: '2026-11-10', scheduled_time: '09:00' }))
    const { user } = show()
    await pick(user, 'Plan the sprint')
    expect(await screen.findByText('Scheduled for Tue, Nov 10: this schedule replaces it.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith('t2', { scheduled_on: DAY, scheduled_time: '15:00' }))
  })

  it('D12 creates the task searched for in the Backlog of the chosen list, with the window as its estimate, and schedules it', async () => {
    vi.mocked(sessions.searchTasks).mockResolvedValue({ tasks: [] })
    vi.mocked(tasks.create).mockResolvedValue(fullTask('new', { title: 'Pay the rent', list_id: HOME }))
    const { user, onSaved } = show()
    await user.click(screen.getByRole('combobox', { name: 'Task' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search task' }), 'Pay the rent')
    await user.click(await screen.findByRole('button', { name: 'Create task “Pay the rent” and schedule' }))

    expect(screen.getByLabelText('Task title')).toHaveValue('Pay the rent')
    await user.click(screen.getByRole('combobox', { name: 'List' }))
    await user.click(await screen.findByRole('option', { name: 'Home' }))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(tasks.create).toHaveBeenCalledWith({
        list_id: HOME,
        title: 'Pay the rent',
        estimate_minutes: 60,
        column: 'backlog',
        scheduled_on: DAY,
        scheduled_time: '15:00',
      }),
    )
    expect(onSaved).toHaveBeenCalledWith({ taskId: 'new', title: 'Pay the rent', day: DAY, time: '15:00' })
  })

  it('says Criar tarefa "<busca>" e agendar in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    vi.mocked(sessions.searchTasks).mockResolvedValue({ tasks: [] })
    const { user } = show()
    await user.click(screen.getByRole('combobox', { name: 'Tarefa' }))
    await user.type(screen.getByRole('searchbox'), 'Pagar o aluguel')
    expect(await screen.findByRole('button', { name: 'Criar tarefa “Pagar o aluguel” e agendar' })).toBeInTheDocument()
  })

  it('from the toolbar button: the day without a time, and no estimate from a window', async () => {
    vi.mocked(tasks.get).mockResolvedValue(fullTask('t1', { title: 'Write the report' }))
    const { user } = show(null, '2026-11-04')
    expect(screen.queryByTestId('new-schedule-window')).toBeNull()
    expect(screen.getByLabelText('Time')).toHaveValue('')
    await pick(user, 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith('t1', { scheduled_on: '2026-11-04', scheduled_time: null }))
  })

  it('asks for a task before saving', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a task, or create one.')
    expect(tasks.update).not.toHaveBeenCalled()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('cancels on Cancel and on Esc', async () => {
    const { user, onCancel } = show()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalledTimes(2)
  })
})
