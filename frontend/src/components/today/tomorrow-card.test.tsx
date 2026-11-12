import { screen, within } from '@testing-library/react'
import { useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/lib/i18n'
import { renderWithProviders } from '@/test/utils'
import type { TodayTomorrowTask } from '@/types'
import { TomorrowCard } from './tomorrow-card'

vi.mock('@/components/board/task-dialog', () => ({
  TaskDialog: ({ taskId }: { taskId: string | null }) => (taskId ? <div role="dialog" aria-label="Edit task">{taskId}</div> : null),
}))

const frete = { id: 'l1', name: 'Frete', color: 1 }
const fiap = { id: 'l2', name: 'FIAP', color: 3 }

function task(overrides: Partial<TodayTomorrowTask>): TodayTomorrowTask {
  return { id: 't', title: 'Task', list: frete, estimate_minutes: null, scheduled_minute: null, series: false, ...overrides }
}

// As the server orders them: with a time first, by time; then the ones without one.
const tasks = [
  task({ id: 'daily', title: 'Daily', list: frete, estimate_minutes: 15, scheduled_minute: 570, series: true }),
  task({ id: 'fiap', title: 'Hand in the FIAP work', list: fiap, estimate_minutes: 60, scheduled_minute: 600 }),
  task({ id: 'read', title: 'Read chapter 4', list: frete }),
]

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>
}

function draw(props: Partial<Parameters<typeof TomorrowCard>[0]> = {}) {
  return renderWithProviders(
    <>
      <TomorrowCard tomorrow="2026-11-12" tasks={tasks} weekUnscheduled={3} planBlocks={0} canWrite {...props} />
      <Where />
    </>,
  )
}

const card = () => screen.getByRole('heading', { name: /Tomorrow|Amanhã/ }).closest('section')!

afterEach(async () => {
  await i18n.changeLanguage('en')
})

describe('TomorrowCard (HOJE-54 to HOJE-57)', () => {
  it('HOJE-54 says tomorrow in full and lists its tasks in order, with list, time and recurring or scheduled', () => {
    draw()
    expect(within(card()).getByText('Thursday, November 12')).toBeInTheDocument()
    const items = within(card()).getAllByRole('listitem')
    expect(items.map((item) => within(item).getByText(/Daily|Hand in|Read chapter|This week/).textContent)).toEqual([
      'Daily',
      'Hand in the FIAP work',
      'Read chapter 4',
      '3 tasks in This week without a day',
    ])
    expect(within(items[0]!).getByText('Frete · 09:30 · recurring')).toBeInTheDocument()
    expect(within(items[1]!).getByText('FIAP · 10:00 · scheduled')).toBeInTheDocument()
    expect(within(items[2]!).getByText('Frete · scheduled')).toBeInTheDocument()
    expect(within(items[1]!).getByText('1hr')).toBeInTheDocument()
  })

  it('HOJE-54 writes the day and the lines in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    draw()
    expect(within(card()).getByText('quinta, 12 de novembro')).toBeInTheDocument()
    expect(within(card()).getByText('FIAP · 10:00 · agendada')).toBeInTheDocument()
    expect(within(card()).getByText('Frete · 09:30 · recorrente')).toBeInTheDocument()
    expect(within(card()).getByText('3 tarefas em Esta semana sem dia')).toBeInTheDocument()
  })

  it('HOJE-55 draws the This week line dashed, and leaves it out without such tasks', () => {
    draw()
    expect(within(card()).getByText('3 tasks in This week without a day').closest('[data-variant]')).toHaveAttribute('data-variant', 'ghost')
    expect(within(card()).getByText('3 tasks in This week without a day').closest('[data-variant]')).toHaveClass('border-dashed')
  })

  it('HOJE-55 leaves the This week line out without tasks there', () => {
    draw({ weekUnscheduled: 0 })
    expect(within(card()).queryByText(/in This week without a day/)).toBeNull()
  })

  it('HOJE-56 says tomorrow has no plan yet, with Plan tomorrow', () => {
    draw({ planBlocks: 0 })
    expect(within(card()).getByText('Tomorrow has no plan yet')).toBeInTheDocument()
    expect(within(card()).getByRole('button', { name: 'Plan tomorrow' })).toBeInTheDocument()
  })

  it('HOJE-56 says how many blocks the plan of tomorrow has', async () => {
    draw({ planBlocks: 4 })
    expect(within(card()).getByText('Plan for tomorrow: 4 blocks')).toBeInTheDocument()
    await i18n.changeLanguage('pt-BR')
    expect(await within(card()).findByText('Plano de amanhã: 4 blocos')).toBeInTheDocument()
  })

  it('HOJE-56 Plan tomorrow opens the plan of tomorrow', async () => {
    const { user } = draw()
    await user.click(within(card()).getByRole('button', { name: 'Plan tomorrow' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/planejar/2026-11-12')
  })

  it('HOJE-57 says nothing is set for tomorrow without tasks for tomorrow nor in This week without a day', () => {
    draw({ tasks: [], weekUnscheduled: 0 })
    expect(within(card()).getByText('Nothing set for tomorrow')).toBeInTheDocument()
    expect(within(card()).queryByRole('listitem')).toBeNull()
  })

  it('HOJE-57 does not say nothing is set when only This week has tasks without a day', () => {
    draw({ tasks: [], weekUnscheduled: 2 })
    expect(within(card()).queryByText('Nothing set for tomorrow')).toBeNull()
    expect(within(card()).getByText('2 tasks in This week without a day')).toBeInTheDocument()
  })

  it('opens a task of tomorrow in the task dialog (HOJE-33)', async () => {
    const { user } = draw()
    await user.click(within(card()).getByRole('button', { name: /Hand in the FIAP work/ }))
    expect(screen.getByRole('dialog', { name: 'Edit task' })).toHaveTextContent('fiap')
  })
})
