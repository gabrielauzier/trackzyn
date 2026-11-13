import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/utils'
import type { TodayPendingTask } from '@/types'
import { TaskPicker } from './task-picker'

const work = { id: 'l1', name: 'Work', color: 1 }

function task(overrides: Partial<TodayPendingTask>): TodayPendingTask {
  return {
    id: 't',
    title: 'Task',
    list: work,
    estimate_minutes: 30,
    position: 0,
    scheduled_on: null,
    scheduled_minute: null,
    plan_minute: null,
    has_session_today: false,
    days_late: null,
    subtasks: { done: 0, total: 0 },
    series: false,
    ...overrides,
  }
}

const NOW = 14 * 60 + 20

// Given out of order: the picker shows them in the order of the groups of `Pendente`.
const pending = [
  task({ id: 'loose', title: 'Tidy the inbox', position: 0 }),
  task({ id: 'planned', title: 'Write the spec', plan_minute: 15 * 60, position: 1 }),
  task({ id: 'late', title: 'Review the PR', scheduled_minute: 13 * 60, position: 2 }),
]

function show() {
  const onPick = vi.fn()
  const result = renderWithProviders(<TaskPicker label="Another task" pending={pending} nowMinute={NOW} onPick={onPick} />)
  return { onPick, ...result }
}

const options = () =>
  within(screen.getByRole('dialog'))
    .getAllByRole('button')
    .map((button) => button.querySelector('.truncate')!.textContent)

describe('TaskPicker (HOJE-15)', () => {
  it('lists the tasks of Pendente in the order of the groups', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: 'Another task' }))
    expect(options()).toEqual(['Review the PR', 'Write the spec', 'Tidy the inbox'])
  })

  it('filters by the title as the user types', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: 'Another task' }))
    await user.type(screen.getByRole('textbox', { name: 'Search tasks' }), 'SPEC')
    expect(options()).toEqual(['Write the spec'])
  })

  it('says when no task matches', async () => {
    const { user } = show()
    await user.click(screen.getByRole('button', { name: 'Another task' }))
    await user.type(screen.getByRole('textbox', { name: 'Search tasks' }), 'nothing like it')
    expect(within(screen.getByRole('dialog')).getByText('No task found')).toBeInTheDocument()
  })

  it('hands the chosen task back and closes', async () => {
    const { user, onPick } = show()
    await user.click(screen.getByRole('button', { name: 'Another task' }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Write the spec/ }))
    expect(onPick).toHaveBeenCalledWith(pending[1])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Esc without choosing', async () => {
    const { user, onPick } = show()
    await user.click(screen.getByRole('button', { name: 'Another task' }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onPick).not.toHaveBeenCalled()
  })
})
