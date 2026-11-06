import { beforeEach, describe, expect, it, vi } from 'vitest'
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
