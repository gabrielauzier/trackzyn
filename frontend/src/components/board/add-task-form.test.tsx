import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { AddTaskForm } from '@/components/board/add-task-form'
import { tasks } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'
import type { Task } from '@/types'

vi.mock('@/lib/api', () => ({
  tasks: { create: vi.fn() },
}))

const LIST = '11111111-1111-4111-8111-111111111111'

const created: Task = {
  id: '22222222-2222-4222-8222-222222222222',
  list_id: LIST,
  title: 'Write the report',
  notes: '',
  estimate_minutes: null,
  column: 'today',
  position: 0,
  completed_at: null,
  created_at: '2026-10-24T10:00:00Z',
  subtasks: [],
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tasks.create).mockResolvedValue(created)
})

async function open() {
  const rendered = renderWithProviders(<AddTaskForm listId={LIST} column="today" />)
  await rendered.user.click(screen.getByRole('button', { name: 'Add task' }))
  return rendered
}

describe('AddTaskForm', () => {
  it('blocks an empty title', async () => {
    const { user } = await open()

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Enter a title')).toBeInTheDocument()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('blocks a title over 255 characters', async () => {
    const { user } = await open()

    await user.click(screen.getByLabelText('Title'))
    await user.paste('a'.repeat(256))
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Use at most 255 characters')).toBeInTheDocument()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('blocks an estimate of 1441 minutes', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.type(screen.getByLabelText('Estimate (min)'), '1441')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByText('Use 1 to 1440 minutes')).toBeInTheDocument()
    expect(tasks.create).not.toHaveBeenCalled()
  })

  it('sends a null estimate when none is given', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(tasks.create).toHaveBeenCalledWith({
        list_id: LIST,
        title: 'Write the report',
        estimate_minutes: null,
        column: 'today',
      }),
    )
  })

  it('sends the estimate in minutes', async () => {
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.type(screen.getByLabelText('Estimate (min)'), '90')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(tasks.create).toHaveBeenCalledWith({
        list_id: LIST,
        title: 'Write the report',
        estimate_minutes: 90,
        column: 'today',
      }),
    )
  })

  it('shows a 422 from the server and keeps the form', async () => {
    vi.mocked(tasks.create).mockRejectedValue({
      response: { status: 422, data: { detail: [{ loc: ['body', 'title'], msg: 'String should have at most 255 characters' }] } },
    })
    const { user } = await open()

    await user.type(screen.getByLabelText('Title'), 'Write the report')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('title: String should have at most 255 characters')
    expect(screen.getByLabelText('Title')).toHaveValue('Write the report')
  })
})
