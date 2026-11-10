import { useReducer } from 'react'
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { clampTask, draftReducer, emptyDraft, type DraftBlock } from '@/lib/plan/draft'
import { fit } from '@/lib/plan/fit'
import { scheduledMinutes } from '@/lib/agenda/layout'
import { i18n, renderWithProviders } from '@/test/utils'
import type { PlanCandidate, PlanTaskRef } from '@/types'
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

describe('PlanSidebar: Encaixar (PLAN-32, PLAN-33)', () => {
  const workday = { start: '09:00', end: '18:00' }

  /** The side list over a draft, as the page wires `Encaixar`: `fit` around what the draft holds, and nothing saved. */
  function Harness({ taken = [] }: { taken?: { start: number; minutes: number }[] }) {
    const [draft, dispatch] = useReducer(draftReducer, emptyDraft)
    const onFit = (tasks: PlanTaskRef[]) => {
      const sized = tasks.map((task) => ({ task, minutes: clampTask(scheduledMinutes(task.estimate_minutes)) }))
      const { placed, left } = fit(sized, [...taken, ...draft.blocks], workday)
      for (const { task, start } of placed) dispatch({ type: 'add', item: { kind: 'task', task: task.task }, start })
      return left.map(({ task }) => task)
    }
    return (
      <>
        <PlanSidebar day={DAY} candidates={candidates} blocks={draft.blocks} breakList={work} onDragStart={vi.fn()} onFit={onFit} />
        <ol aria-label="draft">
          {draft.blocks.map((block) => (
            <li key={block.key}>{`${block.kind === 'task' ? block.task.id : block.name}@${block.start}`}</li>
          ))}
        </ol>
      </>
    )
  }
  const draftItems = () => within(screen.getByRole('list', { name: 'draft' })).queryAllByRole('listitem').map((item) => item.textContent)

  it('puts the marked tasks into the draft in the order marked, from the start of the workday', async () => {
    const { user } = renderWithProviders(<Harness />)
    await user.click(screen.getByRole('checkbox', { name: 'Mark Fix the widget bug' }))
    await user.click(screen.getByRole('checkbox', { name: 'Mark Review the PR' }))
    await user.click(screen.getByRole('checkbox', { name: 'Mark Update the résumé' }))

    await user.click(screen.getByRole('button', { name: 'Fit (3)' }))

    // 2h from 09:00, then 1h30 from 11:00, then 1h (no estimate) from 12:30.
    expect(draftItems()).toEqual(['widget@540', 'review@660', 'resume@750'])
    expect(screen.queryAllByRole('checkbox', { checked: true })).toHaveLength(0)
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('leaves the tasks that fit nowhere marked and says how many did not fit', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      // Only 09:00 to 10:00 is free.
      const { user } = renderWithProviders(<Harness taken={[{ start: 600, minutes: 480 }]} />)
      await user.click(screen.getByRole('checkbox', { name: 'Marcar Fix the widget bug' }))
      await user.click(screen.getByRole('checkbox', { name: 'Marcar Send the weekly report' }))
      await user.click(screen.getByRole('checkbox', { name: 'Marcar Review the PR' }))

      await user.click(screen.getByRole('button', { name: 'Encaixar (3)' }))

      expect(draftItems()).toEqual(['report@540'])
      expect(screen.getByRole('status')).toHaveTextContent('2 tarefas não couberam')
      expect(screen.getByRole('checkbox', { name: 'Marcar Fix the widget bug' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Marcar Review the PR' })).toBeChecked()
      expect(screen.getByRole('checkbox', { name: 'Marcar Send the weekly report' })).not.toBeChecked()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('marking a task does not start a drag, and without onFit there is nothing to mark', async () => {
    const { onDragStart, unmount } = show({ onFit: vi.fn(() => []) })
    fireEvent.pointerDown(screen.getByRole('checkbox', { name: 'Mark Review the PR' }), { button: 0 })
    expect(onDragStart).not.toHaveBeenCalled()
    unmount()

    show()
    expect(screen.queryByRole('checkbox')).toBeNull()
    expect(screen.queryByRole('button', { name: /^Fit/ })).toBeNull()
  })

  it('PLAN-48 shows the new task card above the breaks, in the filtered list, and none without a drag', async () => {
    const { onDragStart, user, unmount } = show()
    const newTask = screen.getByRole('button', { name: 'Drag a new task onto the grid' })
    const breaks = screen.getByRole('heading', { name: 'Breaks' })
    expect(newTask.compareDocumentPosition(breaks) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.pointerDown(newTask, { clientX: 10, clientY: 10, button: 0 })
    expect(onDragStart).toHaveBeenLastCalledWith(expect.anything(), { kind: 'new', estimate: null, list: work })

    await user.click(screen.getByRole('combobox', { name: 'Filter by list' }))
    await user.click(await screen.findByRole('option', { name: 'Home' }))
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Drag a new task onto the grid' }), { clientX: 10, clientY: 10, button: 0 })
    expect(onDragStart).toHaveBeenLastCalledWith(expect.anything(), { kind: 'new', estimate: null, list: home })
    unmount()

    show({ onDragStart: undefined })
    expect(screen.queryByRole('button', { name: 'Drag a new task onto the grid' })).toBeNull()
  })

  it('PLAN-15 draws the break chips with the 2px dashed gray edge of a break block on the grid', () => {
    show()
    for (const chip of document.querySelectorAll<HTMLElement>('[data-break]')) {
      expect(chip).toHaveClass('border-2', 'border-dashed', 'border-muted-foreground/60')
      expect(chip.style.backgroundImage).toBe('repeating-linear-gradient(135deg, var(--muted) 0 6px, var(--border) 6px 8px)')
    }
    expect(document.querySelectorAll('[data-break]')).toHaveLength(2)
  })
})

