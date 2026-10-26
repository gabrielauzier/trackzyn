import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { SubtaskList } from '@/components/board/subtask-list'
import { subtasks, tasks } from '@/lib/api'
import { renderWithProviders } from '@/test/utils'
import type { Subtask, Task } from '@/types'

vi.mock('@/lib/api', () => ({
  tasks: { get: vi.fn() },
  subtasks: { create: vi.fn(), update: vi.fn(), remove: vi.fn(), move: vi.fn() },
}))

const TASK = '11111111-1111-4111-8111-111111111111'
const S1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const S2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function subtask(id: string, title: string, done: boolean, position: number): Subtask {
  return { id, task_id: TASK, title, done, position }
}

function taskWith(items: Subtask[]): Task {
  return {
    id: TASK,
    list_id: '99999999-9999-4999-8999-999999999999',
    title: 'Write the report',
    notes: '',
    estimate_minutes: 60,
    column: 'today',
    position: 0,
    completed_at: null,
    created_at: '2026-10-24T10:00:00Z',
    subtasks: items,
  }
}

const initial = taskWith([subtask(S1, 'Outline', true, 0), subtask(S2, 'Draft', false, 1)])

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(tasks.get).mockResolvedValue(initial)
  vi.mocked(subtasks.create).mockResolvedValue(subtask(S2, 'Review', false, 2))
  vi.mocked(subtasks.update).mockResolvedValue(subtask(S2, 'Draft', true, 1))
  vi.mocked(subtasks.remove).mockResolvedValue(undefined)
  vi.mocked(subtasks.move).mockResolvedValue(subtask(S2, 'Draft', false, 0))
})

describe('SubtaskList', () => {
  it('lists the subtasks with the x/y counter', async () => {
    renderWithProviders(<SubtaskList taskId={TASK} canWrite />)

    expect(await screen.findByText('1/2 Subtasks')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Outline' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('checkbox', { name: 'Draft' })).toHaveAttribute('aria-checked', 'false')
  })

  it('ticks a subtask with PATCH done and updates the counter', async () => {
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')
    vi.mocked(tasks.get).mockResolvedValue(taskWith([subtask(S1, 'Outline', true, 0), subtask(S2, 'Draft', true, 1)]))

    await user.click(screen.getByRole('checkbox', { name: 'Draft' }))

    expect(subtasks.update).toHaveBeenCalledWith(S2, { done: true })
    expect(await screen.findByText('2/2 Subtasks')).toBeInTheDocument()
  })

  it('blocks adding a subtask with an empty title', async () => {
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')

    await user.click(screen.getByRole('button', { name: 'Add subtask' }))

    expect(await screen.findByText('Enter a title')).toBeInTheDocument()
    expect(subtasks.create).not.toHaveBeenCalled()
  })

  it('blocks a subtask title over 255 characters', async () => {
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')

    await user.click(screen.getByLabelText('New subtask'))
    await user.paste('a'.repeat(256))
    await user.click(screen.getByRole('button', { name: 'Add subtask' }))

    expect(await screen.findByText('Use at most 255 characters')).toBeInTheDocument()
    expect(subtasks.create).not.toHaveBeenCalled()
  })

  it('shows a new subtask before the server answers, and takes it back when the server refuses', async () => {
    let refuse: (error: Error) => void = () => {}
    vi.mocked(subtasks.create).mockReturnValue(new Promise((_resolve, reject) => (refuse = reject)))
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')

    await user.type(screen.getByLabelText('New subtask'), 'Review')
    await user.click(screen.getByRole('button', { name: 'Add subtask' }))

    expect(await screen.findByText('Review')).toBeInTheDocument()
    expect(screen.getByText('1/3 Subtasks')).toBeInTheDocument()
    expect(screen.getByLabelText('New subtask')).toHaveValue('')

    refuse(new Error('boom'))

    await waitFor(() => expect(screen.queryByText('Review')).not.toBeInTheDocument())
    expect(screen.getByText('1/2 Subtasks')).toBeInTheDocument()
    expect(screen.getByLabelText('New subtask')).toHaveValue('Review')
  })

  it('leaves out the counter when the card already shows it', async () => {
    renderWithProviders(<SubtaskList taskId={TASK} canWrite showSummary={false} />)

    expect(await screen.findByRole('checkbox', { name: 'Draft' })).toBeInTheDocument()
    expect(screen.queryByText('1/2 Subtasks')).not.toBeInTheDocument()
  })

  it('moves a subtask up and down, with the first unable to go up and the last unable to go down', async () => {
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')

    expect(screen.getByRole('button', { name: 'Move Outline up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move Draft down' })).toBeDisabled()

    // The server answers the move with the new order when the list is read again.
    vi.mocked(tasks.get).mockResolvedValue(taskWith([subtask(S2, 'Draft', false, 0), subtask(S1, 'Outline', true, 1)]))
    await user.click(screen.getByRole('button', { name: 'Move Draft up' }))

    expect(subtasks.move).toHaveBeenCalledWith(S2, S1)
    await waitFor(() =>
      expect(screen.getAllByRole('checkbox').map((box) => box.getAttribute('aria-label'))).toEqual(['Draft', 'Outline']),
    )
  })

  it('moves a subtask down before the one after the next, or last', async () => {
    const S3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    vi.mocked(tasks.get).mockResolvedValue(
      taskWith([subtask(S1, 'Outline', true, 0), subtask(S2, 'Draft', false, 1), subtask(S3, 'Review', false, 2)]),
    )
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/3 Subtasks')

    await user.click(screen.getByRole('button', { name: 'Move Outline down' }))
    expect(subtasks.move).toHaveBeenLastCalledWith(S1, S3)

    await user.click(screen.getByRole('button', { name: 'Move Draft down' }))
    expect(subtasks.move).toHaveBeenLastCalledWith(S2, null)
  })

  it('adds a subtask', async () => {
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')

    await user.type(screen.getByLabelText('New subtask'), 'Review')
    await user.click(screen.getByRole('button', { name: 'Add subtask' }))

    await waitFor(() => expect(subtasks.create).toHaveBeenCalledWith(TASK, 'Review'))
    await waitFor(() => expect(screen.getByLabelText('New subtask')).toHaveValue(''))
  })

  it('shows a 422 from the server', async () => {
    vi.mocked(subtasks.create).mockRejectedValue({
      response: { status: 422, data: { detail: [{ loc: ['body', 'title'], msg: 'String should have at least 1 character' }] } },
    })
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')

    await user.type(screen.getByLabelText('New subtask'), 'Review')
    await user.click(screen.getByRole('button', { name: 'Add subtask' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('title: String should have at least 1 character')
  })

  it('renames a subtask and blocks an empty name', async () => {
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')

    await user.dblClick(screen.getByRole('button', { name: 'Rename Draft' }))
    const input = screen.getByLabelText('Subtask title')
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Enter a title')).toBeInTheDocument()
    expect(subtasks.update).not.toHaveBeenCalled()

    await user.type(input, 'First draft')
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(subtasks.update).toHaveBeenCalledWith(S2, { title: 'First draft' }))
  })

  it('deletes a subtask', async () => {
    const { user } = renderWithProviders(<SubtaskList taskId={TASK} canWrite />)
    await screen.findByText('1/2 Subtasks')

    await user.click(screen.getByRole('button', { name: 'Delete Outline' }))

    await waitFor(() => expect(subtasks.remove).toHaveBeenCalledWith(S1))
  })

  it('lets a viewer only read', async () => {
    renderWithProviders(<SubtaskList taskId={TASK} canWrite={false} />)
    await screen.findByText('1/2 Subtasks')

    expect(within(screen.getByRole('list')).getByRole('checkbox', { name: 'Draft' })).toBeDisabled()
    expect(screen.queryByLabelText('New subtask')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Rename Draft' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Delete Draft' })).not.toBeInTheDocument()
  })
})
