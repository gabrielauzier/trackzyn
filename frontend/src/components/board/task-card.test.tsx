import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen, within } from '@testing-library/react'

import { TaskCard } from '@/components/board/task-card'
import { i18n, renderWithProviders, PLAIN_TASK_FIELDS } from '@/test/utils'
import type { TaskCardView, TaskColumn } from '@/types'

function task(overrides: Partial<TaskCardView> = {}): TaskCardView {
  return { ...PLAIN_TASK_FIELDS,
    id: '11111111-1111-4111-8111-111111111111',
    title: 'DEV-1725',
    estimate_minutes: 60,
    spent_seconds: 0,
    position: 0,
    subtasks: { done: 0, total: 0 },
    created_via: null,
    scheduled_on: null,
    scheduled_time: null,
    series: null,
    ...overrides,
  }
}

const noop = { onOpen: vi.fn() }

describe('TaskCard', () => {
  it('shows the token that created the task', () => {
    renderWithProviders(<TaskCard task={task({ created_via: 'n8n flow' })} column="backlog" canWrite {...noop} />)

    expect(screen.getByText('via n8n flow')).toBeInTheDocument()
  })

  it('shows no origin on a task without a token', () => {
    renderWithProviders(<TaskCard task={task({ created_via: null })} column="backlog" canWrite {...noop} />)

    expect(screen.queryByText(/^via /)).not.toBeInTheDocument()
  })

  it('shows the origin to a viewer too', () => {
    renderWithProviders(<TaskCard task={task({ created_via: 'n8n flow' })} column="backlog" canWrite={false} {...noop} />)

    expect(screen.getByText('via n8n flow')).toBeInTheDocument()
  })

  it('truncates a 100 character name and keeps it whole in the title', () => {
    const name = 'n'.repeat(100)
    renderWithProviders(<TaskCard task={task({ created_via: name })} column="backlog" canWrite {...noop} />)

    const origin = screen.getByText(`via ${name}`)
    expect(origin).toHaveClass('truncate')
    expect(origin).toHaveAttribute('title', `via ${name}`)
  })

  it('shows the origin in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    renderWithProviders(<TaskCard task={task({ created_via: 'n8n flow' })} column="backlog" canWrite {...noop} />)

    expect(screen.getByText('via n8n flow')).toBeInTheDocument()
    await i18n.changeLanguage('en')
  })

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

  it('cards outside Done have no checkbox', () => {
    for (const column of ['backlog', 'this_week', 'today'] as const) {
      const { unmount } = renderWithProviders(
        <TaskCard task={task()} column={column} number={1} canWrite {...noop} />,
      )
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      expect(screen.queryByLabelText('Completed')).not.toBeInTheDocument()
      const title = screen.getByRole('button', { name: 'DEV-1725' })
      // In Today the title comes right after the order number; elsewhere it opens the row.
      const row = title.parentElement!
      if (column === 'today') expect(title.previousElementSibling).toBe(screen.getByTitle('Order in Today'))
      else expect(row.firstElementChild).toBe(title)
      unmount()
    }
  })

  it('a done card shows a read-only check icon', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      renderWithProviders(<TaskCard task={task({ spent_seconds: 5220 })} column="done" canWrite {...noop} />)

      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
      const icon = screen.getByLabelText('Concluída')
      expect(icon.tagName.toLowerCase()).toBe('svg')
      expect(icon).toHaveClass('text-primary')
      expect(icon).not.toHaveAttribute('tabindex')
      expect(icon.closest('button')).toBeNull()
      // To the left of the title, which is struck through in grey.
      const title = screen.getByRole('button', { name: 'DEV-1725' })
      expect(icon.compareDocumentPosition(title) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(title).toHaveClass('line-through', 'text-muted-foreground')
      expect(screen.getByTitle('Tempo gasto')).toHaveTextContent('1h 27min')
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('the title wraps up to three lines with the full text as its tip', () => {
    const long = `DEV-1725 ${'averyveryverylongwordwithoutanyspace'.repeat(3)} and more words to fill three lines`
    for (const column of ['backlog', 'this_week', 'today', 'done'] as const) {
      const { unmount } = renderWithProviders(
        <TaskCard task={task({ title: long })} column={column} number={1} canWrite {...noop} />,
      )
      const title = screen.getByRole('button', { name: long })
      expect(title).toHaveClass('line-clamp-3', 'break-words')
      expect(title).not.toHaveClass('truncate')
      expect(title).toHaveAttribute('title', long)
      unmount()
    }
  })

  it('opens the task when the title is clicked', async () => {
    const onOpen = vi.fn()
    const view = task()
    const { user } = renderWithProviders(
      <TaskCard task={view} column="backlog" canWrite onOpen={onOpen} />,
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

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add subtask' })).not.toBeInTheDocument()
  })
})

/** A card whose estimate edits go to `onEstimateChange` and land on the card, as the board does. */
function EditableCard({ initial = 90, canWrite = true, onEstimateChange = vi.fn(), onPointerDown = vi.fn() }: {
  initial?: number | null
  canWrite?: boolean
  onEstimateChange?: (view: TaskCardView, minutes: number | null) => void
  onPointerDown?: () => void
}) {
  const [view, setView] = useState(task({ estimate_minutes: initial }))
  return (
    <div onPointerDown={onPointerDown}>
      <TaskCard
        task={view}
        column="this_week"
        canWrite={canWrite}
        onOpen={noop.onOpen}
        onEstimateChange={(card, minutes) => {
          onEstimateChange(card, minutes)
          setView({ ...card, estimate_minutes: minutes })
        }}
      />
    </div>
  )
}

describe('TaskCard estimate in HH:MM', () => {
  it('the estimate is an edit button for writers', () => {
    renderWithProviders(<EditableCard initial={60} />)

    const edit = screen.getByRole('button', { name: 'Edit estimate' })
    expect(edit).toHaveTextContent('1hr')
    expect(edit).toHaveClass('cursor-text')
    expect(edit.className).toMatch(/hover:bg-/)
    const pencil = edit.querySelector('svg')
    expect(pencil).toHaveClass('lucide-pencil')
    // The pencil only shows while the mouse is over it.
    expect(pencil!.getAttribute('class')).toMatch(/opacity-0/)
    expect(pencil!.getAttribute('class')).toMatch(/group-hover\/estimate:opacity-100/)
  })

  it('clicking the estimate opens the HH:MM field in place', async () => {
    const onPointerDown = vi.fn()
    noop.onOpen.mockClear()
    const { user } = renderWithProviders(<EditableCard initial={90} onPointerDown={onPointerDown} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))

    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    expect(field).toHaveValue('01:30')
    expect(field).toHaveFocus()
    expect(field).toHaveClass('h-5', 'text-xs')
    // Neither the dialog nor a drag starts from it.
    expect(noop.onOpen).not.toHaveBeenCalled()
    expect(onPointerDown).not.toHaveBeenCalled()
    fireEvent.pointerDown(field)
    expect(onPointerDown).not.toHaveBeenCalled()
  })

  it('a card without estimate offers an empty field', async () => {
    const { user } = renderWithProviders(<EditableCard initial={null} />)

    expect(screen.queryByTitle('Estimate')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))

    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    expect(field).toHaveValue('')
    expect(field).toHaveFocus()
  })

  it('Enter saves the estimate in minutes', async () => {
    const onEstimateChange = vi.fn()
    const { user } = renderWithProviders(<EditableCard initial={60} onEstimateChange={onEstimateChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(field)
    await user.type(field, '0130{Enter}')

    expect(onEstimateChange).toHaveBeenCalledTimes(1)
    expect(onEstimateChange).toHaveBeenCalledWith(expect.objectContaining({ id: task().id }), 90)
    expect(screen.queryByRole('textbox', { name: 'Edit estimate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('1hr 30min')

    // Leaving the field saves too.
    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    const again = screen.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(again)
    await user.type(again, '0200')
    await user.tab()

    expect(onEstimateChange).toHaveBeenLastCalledWith(expect.anything(), 120)
    expect(screen.getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('2hr')
  })

  it('clearing the field removes the estimate', async () => {
    const onEstimateChange = vi.fn()
    const { user } = renderWithProviders(<EditableCard initial={90} onEstimateChange={onEstimateChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    await user.clear(screen.getByRole('textbox', { name: 'Edit estimate' }))
    await user.tab()

    expect(onEstimateChange).toHaveBeenCalledWith(expect.anything(), null)
    expect(screen.queryByTitle('Estimate')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit estimate' })).not.toHaveTextContent(/\d/)
  })

  it('an invalid estimate warns and is not sent', async () => {
    const onEstimateChange = vi.fn()
    const { user } = renderWithProviders(<EditableCard initial={90} onEstimateChange={onEstimateChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(field)
    await user.type(field, '0175')

    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveClass('aria-invalid:border-destructive')
    expect(screen.getByText('Minutes from 00 to 59')).toBeInTheDocument()
    await user.keyboard('{Enter}')
    expect(onEstimateChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Edit estimate' })).toBeInTheDocument()

    // Past 24:00 shows the limit.
    await user.clear(field)
    await user.type(field, '2430')
    expect(screen.getByText('Use 00:01 to 24:00')).toBeInTheDocument()

    // Leaving puts the previous value back, unsent.
    await user.tab()
    expect(onEstimateChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('1hr 30min')
    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    expect(screen.getByRole('textbox', { name: 'Edit estimate' })).toHaveValue('01:30')
  })

  it('shows the warning in Portuguese', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      const { user } = renderWithProviders(<EditableCard initial={90} />)
      await user.click(screen.getByRole('button', { name: 'Editar estimativa' }))
      const field = screen.getByRole('textbox', { name: 'Editar estimativa' })
      await user.clear(field)
      await user.type(field, '0175')
      expect(screen.getByText('Minutos de 00 a 59')).toBeInTheDocument()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('Escape cancels the estimate edit', async () => {
    const onEstimateChange = vi.fn()
    const { user } = renderWithProviders(<EditableCard initial={90} onEstimateChange={onEstimateChange} />)

    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    const field = screen.getByRole('textbox', { name: 'Edit estimate' })
    await user.clear(field)
    await user.type(field, '0300{Escape}')

    expect(onEstimateChange).not.toHaveBeenCalled()
    expect(screen.queryByRole('textbox', { name: 'Edit estimate' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit estimate' })).toHaveTextContent('1hr 30min')
    await user.click(screen.getByRole('button', { name: 'Edit estimate' }))
    expect(screen.getByRole('textbox', { name: 'Edit estimate' })).toHaveValue('01:30')
  })

  it('a viewer sees the estimate as text only', async () => {
    const { user } = renderWithProviders(<EditableCard initial={90} canWrite={false} />)

    expect(screen.queryByRole('button', { name: 'Edit estimate' })).not.toBeInTheDocument()
    const text = screen.getByTitle('Estimate')
    expect(text).toHaveTextContent('1hr 30min')
    expect(text.closest('button')).toBeNull()
    expect(text.className).not.toMatch(/hover:bg-|cursor-text/)
    expect(text.querySelector('svg')).toBeNull()
    await user.click(text)
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

describe('TaskCard schedule badge (US-3, US-11)', () => {
  // Wednesday 2026-11-11, 14:07 in America/Sao_Paulo.
  const TZ = 'America/Sao_Paulo'
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T17:07:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const FRIDAYS = { id: 'series-1', rule: { freq: 'weekly' as const, interval: 1, weekdays: [5], month_day: null, until: null, count: null }, next_on: '2026-11-20' }
  const show = (overrides: Partial<TaskCardView>, column: TaskColumn) =>
    renderWithProviders(<TaskCard task={task(overrides)} column={column} number={1} timeZone={TZ} canWrite {...noop} />)

  it('shows the day in Backlog and This week, with the calendar icon and the full day as its tip', () => {
    const { unmount } = show({ scheduled_on: '2026-11-12' }, 'backlog')
    const badge = screen.getByTitle('Thu, Nov 12')
    expect(badge).toHaveTextContent('Tomorrow')
    expect(badge.querySelector('.lucide-calendar-days')).not.toBeNull()
    unmount()

    show({ scheduled_on: '2026-11-20' }, 'this_week')
    expect(screen.getByTitle('Fri, Nov 20')).toHaveTextContent('Nov 20')
  })

  it('joins the time with the clock icon, and shows only the time in Today', () => {
    const { unmount } = show({ scheduled_on: '2026-11-13', scheduled_time: '14:00' }, 'this_week')
    const badge = screen.getByTitle('Fri, Nov 13 · 14:00')
    expect(badge).toHaveTextContent('Fri 14:00')
    expect(badge.querySelector('.lucide-clock')).not.toBeNull()
    unmount()

    show({ scheduled_on: '2026-11-11', scheduled_time: '16:00' }, 'today')
    expect(screen.getByTitle('Wed, Nov 11 · 16:00')).toHaveTextContent(/^16:00$/)
  })

  it('D21 shows Agendada in Today for a task without a time, with the day it was scheduled for as its tip', async () => {
    await i18n.changeLanguage('pt-BR')
    try {
      show({ scheduled_on: '2026-11-04' }, 'today')
      const badge = screen.getByTitle('Agendada para qua, 4 nov')
      expect(badge).toHaveTextContent('Agendada')
      expect(badge.querySelector('.lucide-calendar-check')).not.toBeNull()
    } finally {
      await i18n.changeLanguage('en')
    }
  })

  it('D5 shows no badge in Done', () => {
    show({ scheduled_on: '2026-11-11', scheduled_time: '09:00' }, 'done')
    expect(screen.queryByTitle(/Nov 11/)).not.toBeInTheDocument()
    expect(screen.queryByText('09:00')).not.toBeInTheDocument()
  })

  it('shows no badge on a task that is not scheduled', () => {
    show({}, 'today')
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument()
  })

  it('adds the repeat icon after the day and time of a series, and the rule to the tip', () => {
    show({ scheduled_on: '2026-11-13', scheduled_time: '14:00', series: FRIDAYS }, 'this_week')
    const badge = screen.getByTitle(/Repeats every Friday/)
    expect(badge).toHaveAttribute('title', 'Fri, Nov 13 · 14:00\nRepeats every Friday')
    const icon = within(badge).getByRole('img', { name: 'Repeats' })
    expect(within(badge).getByText('Fri 14:00').compareDocumentPosition(icon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('sits on the estimate row, outside the title and the quick actions, so the title keeps its three lines', () => {
    renderWithProviders(
      <TaskCard
        task={task({ scheduled_on: '2026-11-13', scheduled_time: '14:00' })}
        column="this_week"
        timeZone={TZ}
        canWrite
        {...noop}
        actions={{ menu: <button type="button">menu</button> }}
      />,
    )
    const badge = screen.getByTitle('Fri, Nov 13 · 14:00')
    const title = screen.getByRole('button', { name: 'DEV-1725' })
    expect(title).toHaveClass('line-clamp-3')
    expect(title.contains(badge)).toBe(false)
    expect(screen.getByRole('button', { name: 'menu' }).parentElement!.contains(badge)).toBe(false)
    expect(badge.closest('div')).toBe(screen.getByTitle('Time spent').parentElement)
  })
})

describe('TaskCard new fields, each on and off (AD-011, FIELDS-01, FIELDS-05)', () => {
  // Wednesday 2026-11-11, 14:07 in America/Sao_Paulo.
  const TZ = 'America/Sao_Paulo'
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T17:07:00Z'))
    await i18n.changeLanguage('pt-BR')
  })
  afterEach(async () => {
    vi.useRealTimers()
    await i18n.changeLanguage('en')
  })

  const NONE = { priority: false, due: false, flag: false, waiting: false }
  const ALL = { priority: true, due: true, flag: true, waiting: true }
  const only = (field: keyof typeof NONE) => ({ ...NONE, [field]: true })
  const LOADED: Partial<TaskCardView> = {
    priority: 'ultra',
    due_on: '2026-11-10',
    waiting: true,
    waiting_for: 'QA',
    flagged: true,
    flag_reason: 'Bloqueada pelo deploy',
  }
  const show = (overrides: Partial<TaskCardView>, fields: typeof NONE, column: TaskColumn = 'this_week') =>
    renderWithProviders(<TaskCard task={task(overrides)} column={column} timeZone={TZ} fields={fields} canWrite {...noop} />)
  const card = () => screen.getByRole('button', { name: 'DEV-1725' }).closest('[data-slot="card"]')!

  it('FIELDS-01 with every field off, a card with all the new fields is the card of today: name, estimate, time', () => {
    const { container: loaded } = show(LOADED, NONE)
    const { container: plain } = renderWithProviders(<TaskCard task={task()} column="this_week" timeZone={TZ} canWrite {...noop} />)

    expect(loaded.innerHTML).toBe(plain.innerHTML)
    expect(within(loaded).getByTitle('Estimativa')).toHaveTextContent('1h')
    expect(within(loaded).getByTitle('Tempo gasto')).toHaveTextContent('0min')
  })

  it('PRI-02 Prioridade on shows the icon at the start of the bottom row; off hides it', () => {
    const { unmount } = show({ priority: 'high' }, only('priority'))
    const icon = screen.getByRole('img', { name: 'Prioridade alta' })
    expect(icon.parentElement!.firstElementChild).toBe(icon)
    expect(icon.closest('div')).toBe(screen.getByTitle('Tempo gasto').parentElement)
    unmount()

    show({ priority: 'high' }, { ...ALL, priority: false })
    expect(screen.queryByRole('img', { name: 'Prioridade alta' })).not.toBeInTheDocument()
  })

  it('FLAG-02 Flag on: red border and the reason under the title, with the red flag', () => {
    show({ flagged: true, flag_reason: 'Esperando acesso' }, only('flag'))

    expect(card()).toHaveClass('border-rose-600')
    const reason = screen.getByText('Esperando acesso')
    expect(reason.parentElement!.querySelector('svg.lucide-flag')).toHaveClass('text-rose-500')
    // Right under the title row.
    expect(screen.getByRole('button', { name: 'DEV-1725' }).parentElement!.nextElementSibling).toBe(reason.parentElement)
  })

  it('FLAG-02 a flag without a reason shows Flag sem motivo', () => {
    show({ flagged: true, flag_reason: null }, only('flag'))

    expect(screen.getByText('Flag sem motivo')).toBeInTheDocument()
    expect(card()).toHaveClass('border-rose-600')
  })

  it('FIELDS-05 Flag off: no reason and no red border on a flagged task', () => {
    show({ flagged: true, flag_reason: 'Esperando acesso' }, { ...ALL, flag: false })

    expect(screen.queryByText('Esperando acesso')).not.toBeInTheDocument()
    expect(card()).not.toHaveClass('border-rose-600')
  })

  it('FLAG-03 a task without a flag never has the red border, with every field on and the others set', () => {
    show({ ...LOADED, flagged: false, flag_reason: null }, ALL)

    expect(card()).not.toHaveClass('border-rose-600')
    expect(screen.queryByText('Flag sem motivo')).not.toBeInTheDocument()
  })

  it('WAIT-02 Aguardando on shows Aguardando · <de quem>, or Aguardando alone; off hides it', () => {
    const { unmount } = show({ waiting: true, waiting_for: 'Fulano' }, only('waiting'))
    expect(screen.getByText('Aguardando · Fulano').parentElement!.querySelector('svg.lucide-user-round')).not.toBeNull()
    unmount()

    const second = show({ waiting: true, waiting_for: null }, only('waiting'))
    expect(screen.getByText(/^Aguardando$/)).toBeInTheDocument()
    second.unmount()

    show({ waiting: true, waiting_for: 'Fulano' }, { ...ALL, waiting: false })
    expect(screen.queryByText(/Aguardando/)).not.toBeInTheDocument()
  })

  it('WAIT-02 a task not waiting shows no chip with Aguardando on', () => {
    show({ waiting: false }, ALL)
    expect(screen.queryByText(/Aguardando/)).not.toBeInTheDocument()
  })

  it.each([
    ['2026-11-20', 'this_week', 'Prazo 20 nov', 'bg-muted'],
    ['2026-11-12', 'this_week', 'Prazo amanhã', 'text-amber-700'],
    ['2026-11-11', 'today', 'Prazo hoje', 'text-amber-700'],
    ['2026-11-10', 'today', 'Atrasada · 10 nov', 'text-rose-700'],
    ['2026-11-10', 'done', 'Prazo 10 nov', 'bg-muted'],
  ] as const)('DUE-02..05 Prazo on: due %s in %s shows %s', (due_on, column, text, tone) => {
    show({ due_on }, only('due'), column)

    const chip = screen.getByText(text).parentElement!
    expect(chip).toHaveClass(tone)
    expect(chip.querySelector('svg.lucide-hourglass')).not.toBeNull()
  })

  it('DUE-02 Prazo off hides the chip; a task without a due day has none', () => {
    const { unmount } = show({ due_on: '2026-11-20' }, { ...ALL, due: false })
    expect(screen.queryByText(/Prazo/)).not.toBeInTheDocument()
    unmount()

    show({ due_on: null }, ALL)
    expect(screen.queryByText(/Prazo|Atrasada/)).not.toBeInTheDocument()
  })

  it('EDGE-06 a schedule and a due day on the same day show both, apart', () => {
    show({ scheduled_on: '2026-11-12', due_on: '2026-11-12' }, ALL)

    const schedule = screen.getByTitle('Qui, 12 nov')
    const due = screen.getByText('Prazo amanhã').parentElement!
    expect(schedule).toHaveTextContent('Amanhã')
    expect(schedule.contains(due)).toBe(false)
    expect(due.contains(schedule)).toBe(false)
  })

  it('keeps the order: title, flag, chips, bottom row', () => {
    show(LOADED, ALL)

    const title = screen.getByRole('button', { name: 'DEV-1725' }).parentElement!
    const flag = screen.getByText('Bloqueada pelo deploy').parentElement!
    const chips = screen.getByText('Atrasada · 10 nov').parentElement!.parentElement!
    const bottom = screen.getByTitle('Tempo gasto').parentElement!
    expect(title.nextElementSibling).toBe(flag)
    expect(flag.nextElementSibling).toBe(chips)
    expect(chips.nextElementSibling).toBe(bottom)
    expect(within(chips).getByText('Aguardando · QA')).toBeInTheDocument()
  })
})

describe('TaskCard of a reminder (REM-03, FIELDS-06)', () => {
  const TZ = 'America/Sao_Paulo'
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-11T17:07:00Z'))
    await i18n.changeLanguage('pt-BR')
  })
  afterEach(async () => {
    vi.useRealTimers()
    await i18n.changeLanguage('en')
  })

  const REMINDER: Partial<TaskCardView> = { kind: 'reminder', title: 'Pagar o DAS', estimate_minutes: null, priority: 'high', scheduled_on: '2026-11-11', scheduled_time: '10:00' }
  const NONE = { priority: false, due: false, flag: false, waiting: false }
  const ALL = { priority: true, due: true, flag: true, waiting: true }

  it.each([
    ['every field on', ALL],
    ['every field off', NONE],
  ])('shows the bell, the title and the time, without checkbox, estimate or time spent, with %s', (_, fields) => {
    const onOpen = vi.fn()
    renderWithProviders(<TaskCard task={task(REMINDER)} column="today" number={1} timeZone={TZ} fields={fields} canWrite onOpen={onOpen} />)

    expect(screen.getByRole('img', { name: 'Lembrete' })).toHaveClass('lucide-bell')
    expect(screen.getByRole('button', { name: 'Pagar o DAS' })).toBeInTheDocument()
    expect(screen.getByText('10:00')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Estimativa')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Editar estimativa' })).not.toBeInTheDocument()
    expect(screen.queryByTitle('Tempo gasto')).not.toBeInTheDocument()
    expect(screen.queryByTitle('Ordem em Hoje')).not.toBeInTheDocument()
  })

  it('REM-03 shows the priority icon with Prioridade on, and hides it with it off', () => {
    const { unmount } = renderWithProviders(<TaskCard task={task(REMINDER)} column="today" timeZone={TZ} fields={ALL} canWrite {...noop} />)
    expect(screen.getByRole('img', { name: 'Prioridade alta' })).toBeInTheDocument()
    unmount()

    renderWithProviders(<TaskCard task={task(REMINDER)} column="today" timeZone={TZ} fields={NONE} canWrite {...noop} />)
    expect(screen.queryByRole('img', { name: 'Prioridade alta' })).not.toBeInTheDocument()
  })

  it('in Concluídas it has no check icon either, and the title is struck through', () => {
    renderWithProviders(<TaskCard task={task(REMINDER)} column="done" timeZone={TZ} fields={ALL} canWrite {...noop} />)

    expect(screen.queryByLabelText('Concluída')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pagar o DAS' })).toHaveClass('line-through')
  })

  it('opens the task dialog from the title', async () => {
    vi.useRealTimers()
    const onOpen = vi.fn()
    const { user } = renderWithProviders(<TaskCard task={task(REMINDER)} column="today" timeZone={TZ} fields={ALL} canWrite onOpen={onOpen} />)

    await user.click(screen.getByRole('button', { name: 'Pagar o DAS' }))
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ title: 'Pagar o DAS', kind: 'reminder' }))
  })
})
