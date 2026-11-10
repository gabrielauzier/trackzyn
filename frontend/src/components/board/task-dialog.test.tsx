import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { TaskDialog } from '@/components/board/task-dialog'
import { tasks } from '@/lib/api'
import { i18n, placeCaretAtEnd, renderWithProviders } from '@/test/utils'
import type { Task } from '@/types'

vi.mock('@/lib/api', () => ({
  tasks: { get: vi.fn(), update: vi.fn(), remove: vi.fn() },
  subtasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}))

const TASK = '11111111-1111-4111-8111-111111111111'

const task: Task = {
  id: TASK,
  list_id: '99999999-9999-4999-8999-999999999999',
  title: 'Write the report',
  notes: 'First pass',
  estimate_minutes: 90,
  column: 'today',
  position: 0,
  completed_at: null,
  created_at: '2026-10-24T10:00:00Z',
  subtasks: [{ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', task_id: TASK, title: 'Outline', done: false, position: 0 }],
  created_via: null,
  scheduled_on: null,
  scheduled_time: null,
  series: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tasks.get).mockResolvedValue(task)
  vi.mocked(tasks.update).mockResolvedValue(task)
  vi.mocked(tasks.remove).mockResolvedValue(undefined)
})

async function renderDialog(canWrite = true) {
  const onClose = vi.fn()
  const rendered = renderWithProviders(<TaskDialog taskId={TASK} canWrite={canWrite} onClose={onClose} />)
  await waitFor(() => expect(screen.getByLabelText('Title')).toHaveValue('Write the report'))
  return { ...rendered, onClose }
}

describe('TaskDialog', () => {
  it('shows the token that created the task, in every role', async () => {
    vi.mocked(tasks.get).mockResolvedValue({ ...task, created_via: 'n8n flow' })
    await renderDialog(false)

    const origin = screen.getByText('via n8n flow')
    expect(origin).toHaveClass('truncate')
    expect(origin).toHaveAttribute('title', 'via n8n flow')
  })

  it('shows no origin on a task without a token', async () => {
    await renderDialog()

    expect(screen.queryByText(/^via /)).not.toBeInTheDocument()
  })

  it('shows the title, estimate, notes and subtasks to edit', async () => {
    await renderDialog()

    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument()
    expect(screen.getByLabelText('Estimate')).toHaveValue('01:30')
    expect(screen.getByLabelText('Notes')).toHaveTextContent('First pass')
    expect(await screen.findByRole('checkbox', { name: 'Outline' })).toBeInTheDocument()
  })

  it('blocks notes over 10 000 characters', async () => {
    const { user } = await renderDialog()

    const notes = screen.getByLabelText('Notes')
    await user.clear(notes)
    await user.click(notes)
    await user.paste('a'.repeat(10_001))
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Use at most 10,000 characters')).toBeInTheDocument()
    expect(tasks.update).not.toHaveBeenCalled()
  })

  it('saves only the title when only the title changed', async () => {
    const { user, onClose } = await renderDialog()

    const title = screen.getByLabelText('Title')
    await user.clear(title)
    await user.type(title, 'Write the summary')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(TASK, { title: 'Write the summary' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('saves a cleared estimate as null with the new notes', async () => {
    const { user } = await renderDialog()

    await user.clear(screen.getByLabelText('Estimate'))
    placeCaretAtEnd(screen.getByLabelText('Notes'))
    await user.paste('!')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() =>
      expect(tasks.update).toHaveBeenCalledWith(TASK, { estimate_minutes: null, notes: '<p>First pass!</p>' }),
    )
  })

  it('blocks an estimate past 24:00', async () => {
    const { user } = await renderDialog()

    const estimate = screen.getByLabelText('Estimate')
    await user.clear(estimate)
    await user.type(estimate, '2401')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByText('Use 00:01 to 24:00')).toBeInTheDocument()
    expect(tasks.update).not.toHaveBeenCalled()
  })

  it('the estimate field takes HH:MM', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      vi.mocked(tasks.get).mockResolvedValue(task)
      const onClose = vi.fn()
      const { user } = renderWithProviders(<TaskDialog taskId={TASK} canWrite onClose={onClose} />)
      const estimate = await screen.findByLabelText('Estimativa')
      expect(estimate).toHaveValue('01:30')
      expect(screen.queryByLabelText('Estimativa (min)')).not.toBeInTheDocument()
      expect(screen.getByText('HH:MM · deixe vazio para sem estimativa')).toBeInTheDocument()

      // Digits only, with the colon fixed (13).
      await user.clear(estimate)
      await user.type(estimate, '0a2b4')
      expect(estimate).toHaveValue('02:4')
      await user.type(estimate, '5')
      expect(estimate).toHaveValue('02:45')

      // Minutes above 59 (16): a warning, and nothing sent.
      await user.clear(estimate)
      await user.type(estimate, '0175')
      await user.click(screen.getByRole('button', { name: 'Salvar' }))
      expect(await screen.findByText('Minutos de 00 a 59')).toBeInTheDocument()
      expect(estimate).toHaveAttribute('aria-invalid', 'true')
      expect(tasks.update).not.toHaveBeenCalled()

      // A valid value is sent in minutes (14).
      await user.clear(estimate)
      await user.type(estimate, '0245')
      await user.click(screen.getByRole('button', { name: 'Salvar' }))
      await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(TASK, { estimate_minutes: 165 }))
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('shows a 422 from the server and stays open', async () => {
    vi.mocked(tasks.update).mockRejectedValue({
      response: { status: 422, data: { detail: [{ loc: ['body', 'notes'], msg: 'String should have at most 10000 characters' }] } },
    })
    const { user, onClose } = await renderDialog()

    await user.type(screen.getByLabelText('Notes'), '!')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('notes: String should have at most 10000 characters')
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('asks for confirmation before deleting', async () => {
    const { user, onClose } = await renderDialog()

    await user.click(screen.getByRole('button', { name: 'Delete task' }))

    const confirm = await screen.findByRole('dialog', { name: 'Delete task' })
    expect(confirm).toHaveTextContent('Write the report will be deleted with its subtasks and tracked time.')
    expect(tasks.remove).not.toHaveBeenCalled()

    await user.click(within(confirm).getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(tasks.remove).toHaveBeenCalledWith(TASK))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('lets a viewer only read', async () => {
    await renderDialog(false)

    expect(screen.getByLabelText('Title')).toBeDisabled()
    expect(screen.getByLabelText('Notes')).toHaveAttribute('contenteditable', 'false')
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete task' })).not.toBeInTheDocument()
  })
})

describe('TaskDialog: Agendamento (US-2)', () => {
  // Wednesday 2026-11-11, 14:07 in America/Sao_Paulo.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T17:07:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const THURSDAYS = { freq: 'weekly' as const, interval: 1, weekdays: [4], month_day: null, until: null, count: null }
  async function open(overrides: Partial<Task>, canWrite = true) {
    vi.mocked(tasks.get).mockResolvedValue({ ...task, ...overrides })
    const rendered = renderWithProviders(<TaskDialog taskId={TASK} canWrite={canWrite} timeZone="America/Sao_Paulo" onClose={vi.fn()} />)
    await screen.findByDisplayValue('Write the report')
    return rendered
  }
  const text = () => screen.getByTestId('schedule-text')

  it('shows Sem agendamento for a task without a schedule', async () => {
    await open({})
    expect(text()).toHaveTextContent(/^Not scheduled$/)
    expect(screen.queryByRole('button', { name: 'Clear time' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove schedule' })).not.toBeInTheDocument()
  })

  it('shows the day, and the start and the end from the estimate', async () => {
    const { unmount } = await open({ scheduled_on: '2026-11-12' })
    expect(text()).toHaveTextContent(/^Thu, Nov 12$/)
    unmount()

    await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00', estimate_minutes: 120 })
    expect(text()).toHaveTextContent(/^Thu, Nov 12 · 10:00 – 12:00$/)
  })

  it('D7 D23 without an estimate the end is one hour on, marked +1h', async () => {
    await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00', estimate_minutes: null })
    expect(text()).toHaveTextContent(/^Thu, Nov 12 · 10:00 – 11:00 \(\+1h\)$/)
  })

  it('says the rule of a series, in Portuguese too: Qui, 12 nov · 10:00 – 12:00 · ↻ toda quinta', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00', estimate_minutes: 120, series: { id: 's', rule: THURSDAYS, next_on: '2026-11-19' } })
      expect(text()).toHaveTextContent(/^Qui, 12 nov · 10:00 – 12:00 · toda quinta$/)
      expect(within(text()).getByRole('img', { name: 'Repete' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('Limpar hora clears only the time; Remover agendamento clears the day and the time', async () => {
    const { user } = await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00' })
    await user.click(screen.getByRole('button', { name: 'Clear time' }))
    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(TASK, { scheduled_time: null }))

    await user.click(screen.getByRole('button', { name: 'Remove schedule' }))
    await waitFor(() => expect(tasks.update).toHaveBeenLastCalledWith(TASK, { scheduled_on: null }))
  })

  it('changes the day with the picker, which starts from the schedule of the task', async () => {
    const { user } = await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00' })
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('button', { name: 'Thu, Nov 12' })).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'Fri, Nov 13' }))
    await user.click(within(screen.getByRole('button', { name: 'Fri, Nov 13' }).closest('form')!).getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(TASK, { scheduled_on: '2026-11-13', scheduled_time: '10:00' }))
  })

  it('a task without a schedule opens the picker from Agendar', async () => {
    const { user } = await open({})
    await user.click(screen.getByRole('button', { name: 'Schedule' }))
    expect(screen.getByRole('button', { name: 'Wed, Nov 11' })).toHaveAttribute('aria-current', 'date')
  })

  describe('US-12 the question of a series', () => {
    const series = { id: 's', rule: THURSDAYS, next_on: '2026-11-19' }

    it('Limpar hora of an occurrence asks first and sends the scope chosen', async () => {
      const { user } = await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00', series })
      await user.click(screen.getByRole('button', { name: 'Clear time' }))
      const question = await screen.findByRole('dialog', { name: 'Change a repeating task' })
      expect(tasks.update).not.toHaveBeenCalled()
      await user.click(within(question).getByRole('button', { name: /^This occurrence only/ }))
      await waitFor(() => expect(tasks.update).toHaveBeenCalledWith(TASK, { scheduled_time: null, scope: 'occurrence' }))
    })

    it('a new day from the picker asks first and sends the scope chosen', async () => {
      // Every day: a rule the new day leaves as it is, so only the day changes.
      const daily = { ...THURSDAYS, freq: 'daily' as const, weekdays: null }
      const { user } = await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00', series: { ...series, rule: daily } })
      await user.click(screen.getByRole('button', { name: 'Change' }))
      await user.click(screen.getByRole('button', { name: 'Fri, Nov 13' }))
      await user.click(within(screen.getByRole('button', { name: 'Fri, Nov 13' }).closest('form')!).getByRole('button', { name: 'Save' }))
      const question = await screen.findByRole('dialog', { name: 'Change a repeating task' })
      await user.click(within(question).getByRole('button', { name: /^This and the next ones/ }))
      await waitFor(() =>
        expect(tasks.update).toHaveBeenCalledWith(TASK, { scheduled_on: '2026-11-13', scheduled_time: '10:00', scope: 'series' }),
      )
    })

    it('D30 an occurrence of Every Thursday moved to Friday keeps the rule, asks, and This and the next ones sends no new rule', async () => {
      const { user } = await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00', series })
      await user.click(screen.getByRole('button', { name: 'Change' }))
      await user.click(screen.getByRole('button', { name: 'Fri, Nov 13' }))
      expect(screen.getByRole('radio', { name: 'Every Thursday' })).toBeChecked()
      await user.click(within(screen.getByRole('button', { name: 'Fri, Nov 13' }).closest('form')!).getByRole('button', { name: 'Save' }))
      const question = await screen.findByRole('dialog', { name: 'Change a repeating task' })
      expect(tasks.update).not.toHaveBeenCalled()
      await user.click(within(question).getByRole('button', { name: /^This and the next ones/ }))
      await waitFor(() =>
        expect(tasks.update).toHaveBeenCalledWith(TASK, { scheduled_on: '2026-11-13', scheduled_time: '10:00', scope: 'series' }),
      )
    })

    it('Cancel saves nothing', async () => {
      const { user } = await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00', series })
      await user.click(screen.getByRole('button', { name: 'Clear time' }))
      const question = await screen.findByRole('dialog', { name: 'Change a repeating task' })
      await user.click(within(question).getByRole('button', { name: 'Cancel' }))
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Change a repeating task' })).not.toBeInTheDocument())
      expect(tasks.update).not.toHaveBeenCalled()
    })

    it('deleting an occurrence asks how, with the day of the next one, and sends the scope chosen', async () => {
      const { user } = await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00', series })
      await user.click(screen.getByRole('button', { name: 'Delete task' }))
      const question = await screen.findByRole('dialog', { name: 'Delete a repeating task' })
      expect(within(question).getByRole('button', { name: /^Delete this one only/ })).toHaveTextContent('Thu, Nov 19')
      expect(tasks.remove).not.toHaveBeenCalled()
      await user.click(within(question).getByRole('button', { name: /^Delete this one and end the series/ }))
      await waitFor(() => expect(tasks.remove).toHaveBeenCalledWith(TASK, 'series'))
    })
  })

  it('shows the schedule to a viewer, with nothing to change it', async () => {
    await open({ scheduled_on: '2026-11-12', scheduled_time: '10:00' }, false)
    expect(text()).toHaveTextContent('Thu, Nov 12 · 10:00 – 11:30')
    expect(screen.queryByRole('button', { name: 'Change' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear time' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove schedule' })).not.toBeInTheDocument()
  })
})
