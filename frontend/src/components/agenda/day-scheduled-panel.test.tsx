import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { agenda, tasks } from '@/lib/api'
import { i18n, renderWithProviders } from '@/test/utils'
import type { ProjectedOccurrence, ScheduledResponse, ScheduledTask, Task } from '@/types'
import { DayScheduledPanel } from './day-scheduled-panel'

vi.mock('@/lib/api', () => ({
  agenda: { scheduled: vi.fn() },
  tasks: { update: vi.fn() },
}))

const SP = 'America/Sao_Paulo'
const DAY = '2026-11-05'
// Wednesday 4 November 2026, 14:07 in São Paulo.
const NOW = new Date('2026-11-04T17:07:00.000Z')
const WEEKLY = { freq: 'weekly' as const, interval: 1, weekdays: [4], month_day: null, until: null, count: null }

function task(id: string, overrides: Partial<ScheduledTask> = {}): ScheduledTask {
  return {
    id,
    title: `Task ${id}`,
    list: { id: 'l1', name: 'Work', color: 4 },
    column: 'this_week',
    position: 0,
    estimate_minutes: null,
    scheduled_on: DAY,
    scheduled_time: null,
    series: null,
    ...overrides,
  }
}

const projection: ProjectedOccurrence = {
  series_id: 'sr1',
  task_id: 'open1',
  title: 'Weekly review',
  list: { id: 'l1', name: 'Work', color: 4 },
  on: DAY,
  time: '16:00',
  estimate_minutes: 30,
  rule: WEEKLY,
}

function show(data: ScheduledResponse, canWrite = true) {
  vi.mocked(agenda.scheduled).mockResolvedValue(data)
  const onOpenTask = vi.fn()
  const onClose = vi.fn()
  const result = renderWithProviders(
    <DayScheduledPanel day={DAY} timeZone={SP} canWrite={canWrite} onOpenTask={onOpenTask} onClose={onClose} now={NOW} />,
  )
  return { ...result, onOpenTask, onClose }
}

const section = (name: RegExp) => screen.getByRole('region', { name })

beforeEach(() => vi.clearAllMocks())

describe('DayScheduledPanel (US-14)', () => {
  const day: ScheduledResponse = {
    untimed: [
      task('b', { title: 'Backlog task', column: 'backlog', estimate_minutes: 30 }),
      task('a', { title: 'Today task', column: 'today', estimate_minutes: 60 }),
      task('c', { title: 'Week task', position: 1 }),
      task('d', { title: 'Second week task', position: 2 }),
    ],
    timed: [
      task('t2', { title: 'Late meeting', scheduled_time: '18:00', estimate_minutes: 45 }),
      task('t1', { title: 'Early call', scheduled_time: '09:00' }),
    ],
    projected: [projection],
  }

  it('heads the panel with the weekday and the date, the count of tasks and the sum of their estimates', async () => {
    show(day)
    expect(await screen.findByRole('heading', { name: 'Thursday, Nov 5' })).toBeInTheDocument()
    // 6 tasks (the projection is not one); 30 + 60 + 45 min.
    expect(await screen.findByText('6 scheduled tasks · Est. 2hr 15min')).toBeInTheDocument()
  })

  it('reads the day alone and says it in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show(day)
      expect(await screen.findByRole('heading', { name: 'Quinta-feira, 5 nov' })).toBeInTheDocument()
      expect(await screen.findByText('6 tarefas agendadas · Est. 2h 15min')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Sem hora · 4' })).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: 'Com hora · 2' })).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: /^Definir hora de/ })).toHaveLength(4)
      expect(screen.getByText('próxima ocorrência')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
    expect(agenda.scheduled).toHaveBeenCalledWith(DAY, DAY)
  })

  it('lists every task without a time in the order of the board, with its estimate', async () => {
    show(day)
    const untimed = await waitFor(() => section(/^No time · 4$/))
    expect(within(untimed).getAllByRole('listitem').map((item) => item.getAttribute('data-day-task'))).toEqual(['a', 'c', 'd', 'b'])
    expect(within(untimed).getByRole('button', { name: 'Today task1hr' })).toBeInTheDocument()
  })

  it('lists the tasks with a time in time order, the next projected occurrence among them, read only', async () => {
    show(day)
    const timedSection = await waitFor(() => section(/^With time · 2$/))
    const rows = within(timedSection).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      '09:00 – 10:00Early call',
      '16:00 – 16:30Weekly reviewnext occurrence',
      '18:00 – 18:45Late meeting45min',
    ])
    expect(rows[1]).toHaveAttribute('data-day-projection', 'open1')
    expect(within(timedSection).queryByRole('button', { name: /Set time/ })).toBeNull()
  })

  it('opens the task dialog on a click on a task, and on the open occurrence for the projection', async () => {
    const { user, onOpenTask } = show(day)
    await user.click(await screen.findByRole('button', { name: 'Week task' }))
    expect(onOpenTask).toHaveBeenCalledWith('c')
    await user.click(screen.getByRole('button', { name: /Weekly review/ }))
    expect(onOpenTask).toHaveBeenLastCalledWith('open1')
  })

  it('shows a viewer the tasks without Definir hora', async () => {
    show(day, false)
    expect(await screen.findByRole('button', { name: 'Today task1hr' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Set time/ })).toBeNull()
  })

  it('takes a task out of Sem hora once its time is set, and it shows with its time', async () => {
    const one: ScheduledResponse = { untimed: [task('a', { title: 'Call the bank' })], timed: [], projected: [] }
    const { user } = show(one)
    vi.mocked(tasks.update).mockImplementation(async () => {
      vi.mocked(agenda.scheduled).mockResolvedValue({ untimed: [], timed: [task('a', { title: 'Call the bank', scheduled_time: '10:00' })], projected: [] })
      return {} as Task
    })
    await user.click(await screen.findByRole('button', { name: 'Set time of Call the bank' }))
    await user.selectOptions(screen.getByLabelText('Time'), '10:00')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(tasks.update).toHaveBeenCalledWith('a', { scheduled_on: DAY, scheduled_time: '10:00' })
    expect(await screen.findByRole('heading', { name: 'No time · 0' })).toBeInTheDocument()
    expect(within(section(/^With time · 1$/)).getByRole('button', { name: '10:00 – 11:00Call the bank' })).toBeInTheDocument()
  })

  it('asks Só esta or Esta e as próximas before setting the time of an occurrence of a series (US-12)', async () => {
    const one: ScheduledResponse = { untimed: [task('a', { title: 'Review', series: { id: 'sr1', rule: WEEKLY } })], timed: [], projected: [] }
    vi.mocked(tasks.update).mockResolvedValue({} as Task)
    const { user } = show(one)
    await user.click(await screen.findByRole('button', { name: 'Set time of Review' }))
    await user.selectOptions(screen.getByLabelText('Time'), '10:00')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(tasks.update).not.toHaveBeenCalled()

    await user.click(await screen.findByRole('button', { name: /^This and the next ones/ }))
    expect(tasks.update).toHaveBeenCalledWith('a', { scheduled_on: DAY, scheduled_time: '10:00', scope: 'series' })
  })

  it('closes on Close and on Esc', async () => {
    const { user, onClose } = show(day)
    await user.click(await screen.findByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
