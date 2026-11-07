import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DraftBlock } from '@/lib/plan/draft'
import { i18n, renderWithProviders } from '@/test/utils'
import type { PlanCandidate } from '@/types'
import { PlanSidebar } from './plan-sidebar'

const DAY = '2026-11-09'
const work = { id: 'l1', name: 'Work', color: 1 }
const home = { id: 'l2', name: 'Home', color: 3 }

function candidate(overrides: Partial<PlanCandidate>): PlanCandidate {
  return {
    id: 'c',
    title: 'Task',
    list: work,
    column: 'backlog',
    position: 0,
    estimate_minutes: null,
    scheduled_on: null,
    scheduled_time: null,
    ...overrides,
  }
}

const candidates: PlanCandidate[] = [
  candidate({ id: 'report', title: 'Send the weekly report', column: 'today', scheduled_on: DAY, estimate_minutes: 30 }),
  candidate({ id: 'review', title: 'Review the PR', column: 'today', estimate_minutes: 90 }),
  candidate({ id: 'widget', title: 'Fix the widget bug', column: 'this_week', list: home, estimate_minutes: 120 }),
  candidate({ id: 'resume', title: 'Update the résumé', column: 'backlog', list: home }),
  // Scheduled for another day: it stays in its column.
  candidate({ id: 'later', title: 'Call the bank', column: 'this_week', scheduled_on: '2026-11-11' }),
]

const reviewBlock: DraftBlock = {
  key: 'b1',
  kind: 'task',
  start: 540,
  minutes: 90,
  task: { id: 'review', title: 'Review the PR', list: work, done: false, scheduled_on: null, estimate_minutes: 90 },
}

function show(props: Partial<Parameters<typeof PlanSidebar>[0]> = {}) {
  const onDragStart = vi.fn()
  const onNewBreak = vi.fn()
  const result = renderWithProviders(
    <PlanSidebar day={DAY} candidates={candidates} blocks={[]} breakList={work} onDragStart={onDragStart} onNewBreak={onNewBreak} {...props} />,
  )
  return { onDragStart, onNewBreak, ...result }
}

/** The titles of each group, by its heading. */
function groups() {
  return Object.fromEntries(
    screen.getAllByRole('region').map((region) => [
      within(region).getByRole('heading').firstChild!.textContent!.trim(),
      within(region)
        .queryAllByRole('listitem')
        .map((item) => item.querySelector('.text-sm')!.textContent),
    ]),
  )
}

describe('PlanSidebar groups, search and filter (PLAN-02)', () => {
  it('puts each task in Agendadas para o dia, Hoje, Esta semana or Backlog', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show()
      expect(groups()).toEqual({
        'Agendadas para o dia': ['Send the weekly report'],
        Hoje: ['Review the PR'],
        'Esta semana': ['Fix the widget bug', 'Call the bank'],
        Backlog: ['Update the résumé'],
      })
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('counts the tasks of each group', () => {
    show()
    expect(screen.getByRole('heading', { name: 'This week 2' })).toBeInTheDocument()
  })

  it('filters by title, ignoring case and accents', async () => {
    const { user } = show()
    await user.type(screen.getByRole('textbox', { name: 'Search tasks' }), 'RESUME')
    expect(groups()).toEqual({ Backlog: ['Update the résumé'] })
  })

  it('says so when nothing matches', async () => {
    const { user } = show()
    await user.type(screen.getByRole('textbox', { name: 'Search tasks' }), 'nothing like this')
    expect(screen.queryAllByRole('listitem')).toEqual([])
    expect(screen.getByText('No tasks found')).toBeInTheDocument()
  })

  it('filters by list', async () => {
    const { user } = show()
    await user.click(screen.getByRole('combobox', { name: 'Filter by list' }))
    await user.click(await screen.findByRole('option', { name: 'Home' }))
    expect(groups()).toEqual({ 'This week': ['Fix the widget bug'], Backlog: ['Update the résumé'] })
  })

  it('shows the list and the estimate, or no estimate', () => {
    show()
    const review = document.querySelector('[data-candidate="review"]')!
    expect(review).toHaveTextContent('Work')
    expect(review).toHaveTextContent('1hr 30min')
    expect(document.querySelector('[data-candidate="resume"]')).toHaveTextContent('no estimate')
  })
})

describe('PlanSidebar planned tasks (PLAN-04)', () => {
  it('marks a task of the draft as planned at its start, and still drags it', () => {
    const { onDragStart } = show({ blocks: [reviewBlock] })
    const review = document.querySelector<HTMLElement>('[data-candidate="review"]')!
    expect(review).toHaveAttribute('data-planned', 'true')
    expect(review).toHaveTextContent('Work · planned 09:00')
    expect(review).toHaveClass('opacity-60', 'cursor-grab')
    expect(document.querySelector('[data-candidate="widget"]')).not.toHaveAttribute('data-planned')

    fireEvent.pointerDown(review, { button: 0 })
    expect(onDragStart).toHaveBeenCalledOnce()
    expect(onDragStart.mock.calls[0]![1]).toEqual({
      kind: 'task',
      task: { id: 'review', title: 'Review the PR', list: work, done: false, scheduled_on: null, estimate_minutes: 90 },
    })
  })

  it('drags nothing without the gestures (PLAN-34)', () => {
    show({ onDragStart: undefined, onNewBreak: undefined })
    expect(document.querySelector('[data-candidate="review"]')).not.toHaveClass('cursor-grab')
    expect(screen.getByRole('button', { name: /Coffee/ })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'New break' })).toBeDisabled()
  })
})

describe('PlanSidebar breaks (PLAN-14)', () => {
  it('offers Café 15min, Almoço 1h and Nova pausa', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show()
      expect(screen.getByRole('button', { name: 'Café 15min' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Almoço 1h' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Nova pausa' })).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('drags a ready break with its name, its length and the list of the Intervalo (PLAN-15, PLAN-18)', () => {
    const { onDragStart } = show()
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Lunch 1hr' }), { button: 0 })
    expect(onDragStart.mock.calls[0]![1]).toEqual({ kind: 'break', name: 'Lunch', minutes: 60, list: work })
  })

  it('opens Nova pausa', async () => {
    const { user, onNewBreak } = show()
    await user.click(screen.getByRole('button', { name: 'New break' }))
    expect(onNewBreak).toHaveBeenCalledOnce()
  })
})
