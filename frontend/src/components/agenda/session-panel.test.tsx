import { useState } from 'react'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { lists, sessions } from '@/lib/api'
import { newSessionTimes } from '@/lib/agenda/layout'
import { renderWithProviders } from '@/test/utils'
import type { AgendaSession, Board, ListCard, TaskCardView } from '@/types'
import { SessionPanel, type PanelTimes } from './session-panel'

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), board: vi.fn() },
  sessions: { create: vi.fn() },
}))

const SP = 'America/Sao_Paulo'
// Wednesday 4 November 2026, 14:07 in São Paulo.
const NOW = new Date('2026-11-04T17:07:00.000Z')
const at = (hours: number, minutes = 0) => hours * 60 + minutes

const card = (id: string, name: string, color: number): ListCard => ({
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

const task = (id: string, title: string): TaskCardView => ({
  id,
  title,
  estimate_minutes: null,
  spent_seconds: 0,
  position: 1,
  subtasks: { done: 0, total: 0 },
  created_via: null,
})

function board(listId: string, name: string, today: TaskCardView[], done: TaskCardView[] = []): Board {
  const column = { tasks: [], estimate_minutes: 0 }
  return {
    list: { id: listId, name, color: 3 },
    timezone: SP,
    pending: { count: today.length, estimate_minutes: 0 },
    columns: {
      backlog: column,
      this_week: { ...column, done: 0, total: 0 },
      today: { tasks: today, estimate_minutes: 0, done: 0, total: today.length },
      done: { today_count: done.length, days: done.length ? [{ date: '2026-11-04', tasks: done }] : [] },
    },
  }
}

const existing: AgendaSession = {
  id: 's1',
  kind: 'task',
  origin: 'focus',
  task_id: 't9',
  task_title: 'Plan the sprint',
  list_id: 'work',
  list_name: 'Work',
  list_color: 3,
  // 18:00 to 18:30 in São Paulo, on Tuesday.
  started_at: '2026-11-03T21:00:00.000Z',
  ended_at: '2026-11-03T21:30:00.000Z',
}

function Panel({ initial, onCancel = vi.fn(), agenda = [] }: { initial: PanelTimes; onCancel?: () => void; agenda?: AgendaSession[] }) {
  const [times, setTimes] = useState(initial)
  return (
    <SessionPanel
      times={times}
      onTimesChange={setTimes}
      timezone={SP}
      now={NOW}
      sessions={agenda}
      defaultListId="home"
      onCancel={onCancel}
      onSave={(input) => sessions.create(input)}
    />
  )
}

const dragged: PanelTimes = { day: '2026-11-03', start: at(17, 30), end: at(18, 45) }

async function chooseTask(user: ReturnType<typeof renderWithProviders>['user'], title: string) {
  await user.click(screen.getByRole('combobox', { name: 'Task' }))
  await user.click(await screen.findByRole('option', { name: title }))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(lists.list).mockResolvedValue({ timezone: SP, lists: [card('work', 'Work', 3), card('home', 'Home', 5)] })
  vi.mocked(lists.board).mockImplementation(async (id) =>
    id === 'work'
      ? board('work', 'Work', [task('t1', 'Write the report')], [task('t2', 'Send the invoice')])
      : board('home', 'Home', [task('t3', 'Fix the sink')]),
  )
})

describe('SessionPanel (new)', () => {
  it('opens with the date and both times of the draft and their duration (AGENDA-14)', () => {
    renderWithProviders(<Panel initial={dragged} />)
    expect(screen.getByRole('heading', { name: 'New session' })).toBeInTheDocument()
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-03')
    expect(screen.getByLabelText('Start')).toHaveValue('17:30')
    expect(screen.getByLabelText('End')).toHaveValue('18:45')
    expect(screen.getByText('1hr 15min')).toBeInTheDocument()
  })

  it('changes the duration to 1hr 30min when the end moves from 18:45 to 19:00 (AGENDA-17)', () => {
    renderWithProviders(<Panel initial={dragged} />)
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '19:00' } })
    expect(screen.getByLabelText('End')).toHaveValue('19:00')
    expect(screen.getByText('1hr 30min')).toBeInTheDocument()
  })

  it('offers the tasks of the active lists grouped by list, done ones included (AGENDA-16)', async () => {
    const { user } = renderWithProviders(<Panel initial={dragged} />)
    await user.click(screen.getByRole('combobox', { name: 'Task' }))
    const work = await screen.findByRole('group', { name: 'Work' })
    expect(work).toHaveTextContent('Write the report')
    expect(work).toHaveTextContent('Send the invoice')
    expect(screen.getByRole('group', { name: 'Home' })).toHaveTextContent('Fix the sink')
  })

  it('offers the list of a break, the default one chosen (AGENDA-16)', async () => {
    const { user } = renderWithProviders(<Panel initial={dragged} />)
    await user.click(screen.getByRole('button', { name: 'Break' }))
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'List of the break' })).toHaveTextContent('Home'))
    vi.mocked(sessions.create).mockResolvedValue(existing)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(sessions.create).toHaveBeenCalledWith({
      kind: 'break',
      list_id: 'home',
      started_at: '2026-11-03T20:30:00.000Z',
      ended_at: '2026-11-03T21:45:00.000Z',
    })
  })

  it('warns about an overlapping session and keeps Save enabled (AGENDA-19)', async () => {
    const { user } = renderWithProviders(<Panel initial={dragged} agenda={[existing]} />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Overlaps Plan the sprint (18:00 – 18:30). The time in common counts in both.',
    )
    await chooseTask(user, 'Write the report')
    expect(screen.getByRole('button', { name: 'Save' })).toBeEnabled()
  })

  it('does not warn when the times only touch another session', () => {
    renderWithProviders(<Panel initial={{ day: '2026-11-03', start: at(17), end: at(18) }} agenda={[existing]} />)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('records the chosen task with the times of the panel (AGENDA-20)', async () => {
    vi.mocked(sessions.create).mockResolvedValue(existing)
    const { user } = renderWithProviders(<Panel initial={dragged} />)
    await chooseTask(user, 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(sessions.create).toHaveBeenCalledWith({
      kind: 'task',
      task_id: 't1',
      started_at: '2026-11-03T20:30:00.000Z',
      ended_at: '2026-11-03T21:45:00.000Z',
    })
  })

  it('shows an end in the future in the app words (AGENDA-23)', async () => {
    vi.mocked(sessions.create).mockRejectedValue({
      response: { status: 422, data: { detail: 'occurred_at is outside the accepted window', code: 'invalid_time' } },
    })
    const { user } = renderWithProviders(<Panel initial={dragged} />)
    await chooseTask(user, 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The session cannot end in the future.')
  })

  it('shows a duration out of bounds in the app words (AGENDA-24)', async () => {
    vi.mocked(sessions.create).mockRejectedValue({
      response: { status: 422, data: { detail: 'A session lasts from 1 minute to 24 hours', code: 'invalid_duration' } },
    })
    const { user } = renderWithProviders(<Panel initial={dragged} />)
    await chooseTask(user, 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Use 1 minute to 24 hours.')
  })

  it('closes on Esc without recording anything (AGENDA-26)', async () => {
    const onCancel = vi.fn()
    const { user } = renderWithProviders(<Panel initial={dragged} onCancel={onCancel} />)
    await user.keyboard('{Escape}')
    expect(onCancel).toHaveBeenCalled()
    expect(sessions.create).not.toHaveBeenCalled()
  })

  it('closes on Cancel without recording anything (AGENDA-26)', async () => {
    const onCancel = vi.fn()
    const { user } = renderWithProviders(<Panel initial={dragged} onCancel={onCancel} />)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(sessions.create).not.toHaveBeenCalled()
  })
})

describe('newSessionTimes (AGENDA-15)', () => {
  it('opens on today, from the full hour before now to now rounded down to 5 min', () => {
    expect(newSessionTimes(NOW, SP)).toEqual({ day: '2026-11-04', start: at(14), end: at(14, 5) })
  })
})
