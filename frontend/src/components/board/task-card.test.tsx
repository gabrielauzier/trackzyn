import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { TaskCard } from '@/components/board/task-card'
import { renderWithProviders } from '@/test/utils'
import type { TaskCardView } from '@/types'

function task(overrides: Partial<TaskCardView> = {}): TaskCardView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'DEV-1725',
    estimate_minutes: 60,
    spent_seconds: 0,
    position: 0,
    subtasks: { done: 0, total: 0 },
    ...overrides,
  }
}

const noop = { onOpen: vi.fn(), onComplete: vi.fn() }

describe('TaskCard', () => {
  it('shows the title, the estimate and the time spent', () => {
    renderWithProviders(<TaskCard task={task({ estimate_minutes: 87 })} column="backlog" canWrite {...noop} />)

    expect(screen.getByRole('button', { name: 'DEV-1725' })).toBeInTheDocument()
    expect(screen.getByTitle('Estimate')).toHaveTextContent('1hr 27min')
    expect(screen.getByTitle('Time spent')).toHaveTextContent('0min')
  })

  it('shows no estimate when the task has none', () => {
    renderWithProviders(<TaskCard task={task({ estimate_minutes: null })} column="backlog" canWrite {...noop} />)

    expect(screen.queryByTitle('Estimate')).not.toBeInTheDocument()
    expect(screen.getByTitle('Time spent')).toHaveTextContent('0min')
  })

  it('numbers the card in Today', () => {
    renderWithProviders(<TaskCard task={task()} column="today" number={1} canWrite {...noop} />)

    expect(screen.getByTitle('Order in Today')).toHaveTextContent('1')
  })

  it('does not number cards outside Today', () => {
    renderWithProviders(<TaskCard task={task()} column="this_week" number={1} canWrite {...noop} />)

    expect(screen.queryByTitle('Order in Today')).not.toBeInTheDocument()
  })

  it('completes a pending task from its check', async () => {
    const onComplete = vi.fn()
    const view = task()
    const { user } = renderWithProviders(
      <TaskCard task={view} column="today" number={1} canWrite onOpen={vi.fn()} onComplete={onComplete} />,
    )

    const check = screen.getByRole('checkbox', { name: 'Complete DEV-1725' })
    expect(check).toHaveAttribute('aria-checked', 'false')
    await user.click(check)

    expect(onComplete).toHaveBeenCalledWith(view)
  })

  it('shows a done task struck through, checked, with the time spent', () => {
    renderWithProviders(
      <TaskCard task={task({ spent_seconds: 5220 })} column="done" canWrite {...noop} />,
    )

    expect(screen.getByRole('button', { name: 'DEV-1725' })).toHaveClass('line-through')
    expect(screen.getByRole('checkbox', { name: 'Complete DEV-1725' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTitle('Time spent')).toHaveTextContent('1hr 27min')
  })

  it('opens the task when the title is clicked', async () => {
    const onOpen = vi.fn()
    const view = task()
    const { user } = renderWithProviders(
      <TaskCard task={view} column="backlog" canWrite onOpen={onOpen} onComplete={vi.fn()} />,
    )

    await user.click(screen.getByRole('button', { name: 'DEV-1725' }))

    expect(onOpen).toHaveBeenCalledWith(view)
  })

  it('summarises the subtasks and opens their list from the arrow', async () => {
    const { user } = renderWithProviders(
      <TaskCard
        task={task({ subtasks: { done: 1, total: 3 } })}
        column="backlog"
        canWrite
        {...noop}
        subtasks={<p>subtask list</p>}
      />,
    )

    expect(screen.getByText('1/3 Subtasks')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add subtask' })).toBeInTheDocument()
    expect(screen.queryByText('subtask list')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show subtasks' }))

    expect(screen.getByText('subtask list')).toBeInTheDocument()
  })

  it('has no subtask summary when the task has no subtasks', () => {
    renderWithProviders(<TaskCard task={task()} column="backlog" canWrite {...noop} />)

    expect(screen.queryByText(/Subtasks/)).not.toBeInTheDocument()
  })

  it('lets a viewer neither complete nor add subtasks', () => {
    renderWithProviders(
      <TaskCard task={task({ subtasks: { done: 0, total: 2 } })} column="today" number={1} canWrite={false} {...noop} />,
    )

    expect(screen.getByRole('checkbox', { name: 'Complete DEV-1725' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument()
  })
})
