import { screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { renderWithProviders } from '@/test/utils'
import type { ScheduledTask } from '@/types'
import { ScheduledTaskPanel } from './scheduled-task-panel'

const task: ScheduledTask = {
  id: 't1',
  title: 'Weekly review',
  list: { id: 'l1', name: 'Work', color: 3 },
  column: 'today',
  position: 0,
  estimate_minutes: 30,
  scheduled_on: '2026-11-05',
  scheduled_time: '16:45',
  series: { id: 's1', rule: { freq: 'weekly', interval: 1, weekdays: [4], month_day: null, until: null, count: null } },
}

describe('ScheduledTaskPanel (US-5)', () => {
  it('shows the day and time from the estimate, the list and column, and the repetition of the series', () => {
    renderWithProviders(<ScheduledTaskPanel task={task} onOpen={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Weekly review' })).toBeInTheDocument()
    expect(screen.getByText('Thu, Nov 5 · 16:45 – 17:15')).toBeInTheDocument()
    expect(screen.getByText('Work · Today')).toBeInTheDocument()
    expect(screen.getByText('Repeats every Thursday')).toBeInTheDocument()
  })

  it('takes 1h for a task without an estimate, and leaves the repetition out without a series', () => {
    renderWithProviders(<ScheduledTaskPanel task={{ ...task, estimate_minutes: null, series: null }} onOpen={vi.fn()} onClose={vi.fn()} />)
    expect(screen.getByText('Thu, Nov 5 · 16:45 – 17:45')).toBeInTheDocument()
    expect(screen.getByText('No estimate')).toBeInTheDocument()
    expect(screen.queryByText(/^Repeats/)).toBeNull()
  })

  it('Abrir tarefa, the X and Esc', async () => {
    const onOpen = vi.fn()
    const onClose = vi.fn()
    const { user } = renderWithProviders(<ScheduledTaskPanel task={task} onOpen={onOpen} onClose={onClose} />)
    await user.click(screen.getByRole('button', { name: 'Open task' }))
    expect(onOpen).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: 'Close' }))
    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })
})
