import { useState } from 'react'
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { lists, sessions } from '@/lib/api'
import { newSessionTimes } from '@/lib/agenda/layout'
import { i18n, renderWithProviders } from '@/test/utils'
import type { AgendaSession, AgendaSessionInput, AgendaTask, ListCard } from '@/types'
import { SessionDetails, SessionPanel, type PanelTimes } from './session-panel'

vi.mock('@/lib/api', () => ({
  lists: { list: vi.fn(), board: vi.fn() },
  sessions: { create: vi.fn(), tasks: vi.fn() },
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

const task = (id: string, title: string, list: ListCard, column: AgendaTask['column'] = 'today'): AgendaTask => ({
  id,
  title,
  list_id: list.id,
  list_name: list.name,
  list_color: list.color,
  column,
})

const WORK = card('work', 'Work', 3)
const HOME = card('home', 'Home', 5)

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

function Panel({
  initial,
  onCancel = vi.fn(),
  agenda = [],
  editing,
  onSave = (input) => sessions.create(input),
}: {
  initial: PanelTimes
  onCancel?: () => void
  agenda?: AgendaSession[]
  editing?: AgendaSession
  onSave?: (input: AgendaSessionInput) => Promise<unknown>
}) {
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
      onSave={onSave}
      editing={editing}
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
  vi.mocked(lists.list).mockResolvedValue({ timezone: SP, lists: [WORK, HOME] })
  vi.mocked(sessions.tasks).mockResolvedValue({
    tasks: [task('t1', 'Write the report', WORK), task('t2', 'Send the invoice', WORK, 'done'), task('t3', 'Fix the sink', HOME)],
  })
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

  it('offers a done task that no board shows any more, from the tasks the API offers (AGENDA-16)', async () => {
    // Done 10 days ago: the board keeps only today and the last day before.
    vi.mocked(sessions.tasks).mockResolvedValue({ tasks: [task('t4', 'Ship the release', WORK, 'done')] })
    const { user } = renderWithProviders(<Panel initial={dragged} />)
    await user.click(screen.getByRole('combobox', { name: 'Task' }))
    expect(await screen.findByRole('group', { name: 'Work' })).toHaveTextContent('Ship the release')
    expect(lists.board).not.toHaveBeenCalled()
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

describe('SessionDetails (AGENDA-27, AGENDA-32, AGENDA-33)', () => {
  const details = (session: AgendaSession, handlers: { onEdit?: () => void; onDelete?: () => void; onClose?: () => void } = {}) =>
    renderWithProviders(
      <SessionDetails session={session} timezone={SP} now={NOW} onClose={handlers.onClose ?? vi.fn()} onEdit={handlers.onEdit} onDelete={handlers.onDelete} />,
    )

  it('shows the task, the list, the day, times and duration and that the focus recorded it (AGENDA-27)', () => {
    const { container } = details(existing, { onEdit: vi.fn(), onDelete: vi.fn() })
    expect(screen.getByRole('heading', { name: 'Plan the sprint' })).toBeInTheDocument()
    expect(container).toHaveTextContent('Work')
    expect(screen.getByText('Tuesday, November 3 · 18:00 – 18:30 · 30min')).toBeInTheDocument()
    expect(screen.getByText('recorded by the focus')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Delete' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument()
  })

  it('reads the details in Portuguese (AGENDA-27)', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      details({ ...existing, kind: 'break', task_id: null, task_title: null, origin: 'manual' }, { onEdit: vi.fn(), onDelete: vi.fn() })
      expect(screen.getByRole('heading', { name: 'Intervalo' })).toBeInTheDocument()
      expect(screen.getByText('terça-feira, 3 de novembro · 18:00 – 18:30 · 30min')).toBeInTheDocument()
      expect(screen.getByText('registrada na agenda')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Editar' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Excluir' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Fechar' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('shows a session recorded on the agenda as such (AGENDA-27)', () => {
    details({ ...existing, origin: 'manual' })
    expect(screen.getByText('recorded on the agenda')).toBeInTheDocument()
  })

  it('closes on Close', async () => {
    const onClose = vi.fn()
    const { user } = details(existing, { onClose })
    await user.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('opens the edit form on Edit (AGENDA-31)', async () => {
    const onEdit = vi.fn()
    const { user } = details(existing, { onEdit, onDelete: vi.fn() })
    await user.click(screen.getByRole('button', { name: 'Edit' }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('deletes only once the confirmation is accepted (AGENDA-32)', async () => {
    const onDelete = vi.fn()
    const { user } = details(existing, { onEdit: vi.fn(), onDelete })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog')
    expect(dialog).toHaveTextContent('Delete this session?')
    expect(dialog).toHaveTextContent('Plan the sprint · Tuesday, November 3 · 18:00 – 18:30 · 30min')
    expect(onDelete).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('keeps the session when the confirmation is cancelled (AGENDA-32)', async () => {
    const onDelete = vi.fn()
    const { user } = details(existing, { onEdit: vi.fn(), onDelete })
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(onDelete).not.toHaveBeenCalled()
  })

  it('offers no edit nor delete for the running session, only the way to the focus (AGENDA-33)', () => {
    details({ ...existing, ended_at: null }, { onEdit: vi.fn(), onDelete: vi.fn() })
    expect(
      screen.getByText('The running session has no handles: its end is now. To adjust it, pause it in the focus.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open the focus' })).toHaveAttribute('href', '/focus/work')
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })

  it('hides Edit and Delete from a viewer (AGENDA-44)', () => {
    details(existing)
    expect(screen.getByRole('heading', { name: 'Plan the sprint' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull()
  })
})

describe('SessionPanel (edit, AGENDA-31)', () => {
  const own: PanelTimes = { day: '2026-11-03', start: at(18), end: at(18, 30) }

  it('opens with the task, the date and the times of the session, editable', async () => {
    renderWithProviders(<Panel initial={own} editing={existing} agenda={[existing]} />)
    expect(screen.getByRole('heading', { name: 'Edit session' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Task' })).toHaveTextContent('Plan the sprint'))
    expect(screen.getByLabelText('Date')).toHaveValue('2026-11-03')
    expect(screen.getByLabelText('Start')).toHaveValue('18:00')
    expect(screen.getByLabelText('End')).toHaveValue('18:30')
    // The session itself is no overlap.
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('saves the changed times and the chosen task', async () => {
    const onSave = vi.fn().mockResolvedValue(existing)
    const { user } = renderWithProviders(<Panel initial={own} editing={existing} onSave={onSave} />)
    fireEvent.change(screen.getByLabelText('End'), { target: { value: '19:00' } })
    await chooseTask(user, 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledWith(
      { kind: 'task', task_id: 't1', started_at: '2026-11-03T21:00:00.000Z', ended_at: '2026-11-03T22:00:00.000Z' },
      expect.anything(),
    )
  })

  it('shows the refusals of the creation: an end in the future (AGENDA-23)', async () => {
    const onSave = vi.fn().mockRejectedValue({ response: { status: 422, data: { detail: 'x', code: 'invalid_time' } } })
    const { user } = renderWithProviders(<Panel initial={own} editing={existing} onSave={onSave} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Task' })).toHaveTextContent('Plan the sprint'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('The session cannot end in the future.')
  })

  it('shows the refusals of the creation: a task not found (AGENDA-25)', async () => {
    const onSave = vi.fn().mockRejectedValue({ response: { status: 404, data: { detail: 'Task not found' } } })
    const { user } = renderWithProviders(<Panel initial={own} editing={existing} onSave={onSave} />)
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Task' })).toHaveTextContent('Plan the sprint'))
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Task not found')
  })
})
